import fs from 'fs'
import path from 'path'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import type { ImageGenerator, GeneratedImage, GenerationAttempt } from '@/types/generation'
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
  // filePath → Gemini file URI — pre-populated before job starts to avoid per-request base64 encoding
  private fileUriCache = new Map<string, string>()

  constructor(modelId?: string) {
    this.apiKey = getApiKey()
    this.modelId = modelId
  }

  setFileUri(filePath: string, uri: string): void {
    this.fileUriCache.set(filePath, uri)
  }

  async generateImage(
    sourceImagePath: string,
    targetLanguage: string,
    prompt: string,
    resolution: string = '1K',
    onAttempt?: (attempt: GenerationAttempt) => void
  ): Promise<GeneratedImage> {
    const attempts: GenerationAttempt[] = []
    const recordAttempt = (a: GenerationAttempt) => {
      attempts.push(a)
      try { onAttempt?.(a) } catch { /* callback must never break the generator */ }
    }
    const modelId = this.modelId || getModel('model_generate')
    try {
      ensureOutputDir()

      if (isTestModel(modelId)) {
        recordAttempt({ provider: 'gemini', model: modelId, startedAt: new Date().toISOString(), durationMs: 0, success: false, error: 'TEST model' })
        return { success: false, outputPath: '', error: 'TEST model — toujours en échec (test backup)', attempts }
      }

      const mimeType = getMimeType(sourceImagePath)
      const fileUri = this.fileUriCache.get(sourceImagePath)

      // Use pre-uploaded file URI if available, otherwise fall back to inline base64
      const imagePart = fileUri
        ? { fileData: { mimeType, fileUri } }
        : { inlineData: { mimeType, data: fs.readFileSync(sourceImagePath).toString('base64') } }

      const { temperature, topP, topK } = getGenerationParams()

      const body = {
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            imagePart,
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

      // Single fetch with a generous 10-min timeout — Gemini NB2 preview can legitimately queue
      // requests for several minutes. The timeout exists only to prevent zombie sockets, not
      // to cut off slow-but-valid responses. Retries are handled one level up in processTask.
      const startedAt = new Date().toISOString()
      const startMs = Date.now()
      let res: Response
      let successAttemptDurationMs = 0
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000) // 10 min timeout
        res = await fetch(
          `${GEMINI_BASE}/models/${modelId}:generateContent?key=${this.apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal }
        )
        clearTimeout(timer)
        successAttemptDurationMs = Date.now() - startMs
        if (!res.ok) {
          recordAttempt({ provider: 'gemini', model: modelId, startedAt, durationMs: successAttemptDurationMs, success: false, error: `HTTP ${res.status}`, httpStatus: res.status })
        }
      } catch (fetchErr: unknown) {
        const lastFetchError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        recordAttempt({ provider: 'gemini', model: modelId, startedAt, durationMs: Date.now() - startMs, success: false, error: `fetch: ${lastFetchError}` })
        return { success: false, outputPath: '', error: `fetch failed: ${lastFetchError}`, attempts }
      }

      if (!res.ok) {
        const err = await res.text()
        return { success: false, outputPath: '', error: `Gemini API ${res.status}: ${err.slice(0, 200)}`, attempts }
      }

      const data = await res.json()
      const responsePart = data.candidates?.[0]?.content?.parts?.find(
        (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData
      )

      if (!responsePart?.inlineData?.data) {
        recordAttempt({ provider: 'gemini', model: modelId, startedAt, durationMs: successAttemptDurationMs, success: false, error: 'no image in response' })
        return { success: false, outputPath: '', error: 'Aucune image dans la réponse Gemini', attempts }
      }

      const sourceName = path.basename(sourceImagePath, path.extname(sourceImagePath))
      const outputFilename = `${sourceName}_${targetLanguage}_${Date.now()}.jpg`
      const outputPath = path.join(OUTPUT_DIR, outputFilename)

      fs.writeFileSync(outputPath, Buffer.from(responsePart.inlineData.data, 'base64'))

      recordAttempt({ provider: 'gemini', model: modelId, startedAt, durationMs: successAttemptDurationMs, success: true })

      return { success: true, outputPath, attempts }
    } catch (error: unknown) {
      return { success: false, outputPath: '', error: error instanceof Error ? error.message : 'Gemini generation failed', attempts }
    }
  }
}
