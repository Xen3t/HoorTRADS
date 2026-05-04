import fs from 'fs'
import path from 'path'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import type { ImageGenerator, GeneratedImage } from '@/types/generation'
import { isTestModel } from '@/lib/provider-utils'

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'generated')
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || 'image/jpeg'
}

export function getApiKey(): string {
  let key: string | null = null
  try { key = getAppConfig(getDb(), 'gemini_api_key') } catch {}
  if (!key) key = process.env.GEMINI_API_KEY ?? null
  if (!key) throw new Error('Gemini API key not configured (panneau admin ou GEMINI_API_KEY)')
  return key
}

export function getGenerationParams(): { temperature: number; topP: number; topK: number } {
  const db = getDb()
  const temperature = parseFloat(getAppConfig(db, 'generate_temperature') || '0.2')
  const topP = parseFloat(getAppConfig(db, 'generate_top_p') || '0.9')
  const topK = parseInt(getAppConfig(db, 'generate_top_k') || '40', 10)
  return {
    temperature: isNaN(temperature) ? 0.2 : Math.max(0, Math.min(2, temperature)),
    topP: isNaN(topP) ? 0.9 : Math.max(0, Math.min(1, topP)),
    topK: isNaN(topK) ? 40 : Math.max(1, Math.min(100, topK)),
  }
}

export function getModel(key: 'model_generate' | 'model_extract' | 'model_translate' | 'model_verify'): string {
  const DEFAULTS: Record<string, string> = {
    model_generate: 'gemini-3.1-flash-image-preview',
    model_extract: 'gemini-3.1-flash-lite-preview',
    model_translate: 'gemini-3.1-pro-preview',
    model_verify: 'gemini-3.1-pro-preview',
  }
  try {
    const db = getDb()
    // Prefer new primary_* key if set (unified config)
    const step = key.replace('model_', '')
    const primaryVal = getAppConfig(db, `primary_model_${step}`)
    if (primaryVal) return primaryVal
    // Fallback to legacy key
    return getAppConfig(db, key) || DEFAULTS[key]
  } catch { return DEFAULTS[key] }
}

export class GeminiClient implements ImageGenerator {
  private apiKey: string
  private modelId?: string

  constructor(modelId?: string) {
    this.apiKey = getApiKey()
    this.modelId = modelId
  }

  async generateImage(
    sourceImagePath: string,
    targetLanguage: string,
    prompt: string,
    resolution: string = '1K'
  ): Promise<GeneratedImage> {
    try {
      ensureOutputDir()

      const modelId = this.modelId || getModel('model_generate')
      if (isTestModel(modelId)) return { success: false, outputPath: '', error: 'TEST model — toujours en échec (test backup)' }

      const imageBuffer = fs.readFileSync(sourceImagePath)
      const base64Image = imageBuffer.toString('base64')
      const mimeType = getMimeType(sourceImagePath)

      const { temperature, topP, topK } = getGenerationParams()

      const body = {
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Image } },
          ],
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { imageSize: resolution },
          temperature,
          topP,
          topK,
        },
      }

      // Retry up to 2 times on network errors (fetch failed / connection reset)
      let res: Response | null = null
      let lastFetchError: string = ''
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 3 * 60 * 1000) // 3 min timeout
          res = await fetch(
            `${GEMINI_BASE}/models/${modelId}:generateContent?key=${this.apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal }
          )
          clearTimeout(timer)
          break
        } catch (fetchErr: unknown) {
          lastFetchError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
          if (attempt < 2) await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
        }
      }
      if (!res) return { success: false, outputPath: '', error: `fetch failed (3 attempts): ${lastFetchError}` }

      if (!res.ok) {
        const err = await res.text()
        return { success: false, outputPath: '', error: `Gemini API ${res.status}: ${err.slice(0, 200)}` }
      }

      const data = await res.json()
      const imagePart = data.candidates?.[0]?.content?.parts?.find(
        (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData
      )

      if (!imagePart?.inlineData?.data) {
        return { success: false, outputPath: '', error: 'Aucune image dans la réponse Gemini' }
      }

      const sourceName = path.basename(sourceImagePath, path.extname(sourceImagePath))
      const outputFilename = `${sourceName}_${targetLanguage}_${Date.now()}.jpg`
      const outputPath = path.join(OUTPUT_DIR, outputFilename)

      fs.writeFileSync(outputPath, Buffer.from(imagePart.inlineData.data, 'base64'))

      return { success: true, outputPath }
    } catch (error: unknown) {
      return { success: false, outputPath: '', error: error instanceof Error ? error.message : 'Gemini generation failed' }
    }
  }
}
