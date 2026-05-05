import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import OpenAI, { toFile } from 'openai'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import type { ImageGenerator, GeneratedImage } from '@/types/generation'
import { getOpenAiKey } from '@/lib/openai/openai-client'
import { isTestModel } from '@/lib/provider-utils'

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'generated')
const DEFAULT_MODEL = 'gpt-image-2'

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

function getOpenAiImageModel(): string {
  try {
    const db = getDb()
    const primary = getAppConfig(db, 'primary_model_generate')
    if (primary && primary.startsWith('gpt-')) return primary
    return getAppConfig(db, 'openai_model_generate') || DEFAULT_MODEL
  } catch { return DEFAULT_MODEL }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] ?? 'image/png'
}

async function computeOpenAiParams(
  sourceImagePath: string,
  _resolution: string
): Promise<{ size: string; quality: 'medium' | 'high'; croppedPath?: string }> {
  const { width: srcW = 0, height: srcH = 0 } = await sharp(sourceImagePath).metadata()
  if (!srcW || !srcH) throw new Error('Dimensions source invalides')

  // Arrondir aux multiples de 16 (exigence OpenAI)
  let wFinal = Math.round(srcW / 16) * 16 || 16
  let hFinal = Math.round(srcH / 16) * 16 || 16

  // Clamp ratio ≤ 3:1
  if (Math.max(wFinal, hFinal) / Math.min(wFinal, hFinal) > 3) {
    const clamped = Math.ceil(Math.max(wFinal, hFinal) / 3 / 16) * 16
    if (wFinal > hFinal) hFinal = clamped
    else wFinal = clamped
  }

  // Clamp bord max ≤ 3840
  const maxEdge = Math.max(wFinal, hFinal)
  if (maxEdge > 3840) {
    const scale = 3840 / maxEdge
    wFinal = Math.round(wFinal * scale / 16) * 16 || 16
    hFinal = Math.round(hFinal * scale / 16) * 16 || 16
  }

  // Budget pixel minimum OpenAI (~1MP)
  const MIN_PIXELS = 1024 * 1024
  if (wFinal * hFinal < MIN_PIXELS) {
    const scale = Math.sqrt(MIN_PIXELS / (wFinal * hFinal))
    wFinal = Math.round(wFinal * scale / 16) * 16 || 16
    hFinal = Math.round(hFinal * scale / 16) * 16 || 16
  }

  const quality = wFinal * hFinal >= 2048 * 2048 ? 'high' : 'medium'
  return { size: `${wFinal}x${hFinal}`, quality }
}

export class OpenAiImageClient implements ImageGenerator {
  private apiKey: string
  private modelId?: string

  constructor(modelId?: string) {
    const key = getOpenAiKey()
    if (!key) throw new Error('Clé API OpenAI manquante (panneau admin ou OPENAI_API_KEY)')
    this.apiKey = key
    this.modelId = modelId
  }

  async generateImage(
    sourceImagePath: string,
    targetLanguage: string,
    prompt: string,
    resolution: string = '1K'
  ): Promise<GeneratedImage> {
    let croppedPath: string | undefined
    try {
      ensureOutputDir()
      if (!fs.existsSync(sourceImagePath)) {
        return { success: false, outputPath: '', error: `Source image not found: ${sourceImagePath}` }
      }

      const model = this.modelId || getOpenAiImageModel()
      if (isTestModel(model)) return { success: false, outputPath: '', error: 'TEST model — toujours en échec (test backup)' }

      const { size, quality, croppedPath: cp } = await computeOpenAiParams(sourceImagePath, resolution)
      croppedPath = cp
      if (croppedPath) console.log(`[openai-image] center-crop appliqué → ${size}`)

      const client = new OpenAI({ apiKey: this.apiKey })
      const imagePath = croppedPath ?? sourceImagePath
      const mimeType = getMimeType(sourceImagePath)

      console.log('[openai-image] images.edit | model:', model, '| size:', size, '| quality:', quality, '| lang:', targetLanguage)

      let imageFile = await toFile(
        fs.createReadStream(imagePath),
        path.basename(imagePath),
        { type: mimeType }
      )

      let result
      const maxRetries = 3
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          result = await client.images.edit({ model, image: imageFile, prompt, size, quality, n: 1 } as Parameters<typeof client.images.edit>[0])
          break
        } catch (err: unknown) {
          const isRateLimit = err instanceof Error && (
            (err as { status?: number }).status === 429 ||
            err.message.includes('429') ||
            err.message.toLowerCase().includes('rate limit')
          )
          if (isRateLimit && attempt < maxRetries) {
            const waitSec = 60 * (attempt + 1)
            console.log(`[openai-image] 429 rate limit — attente ${waitSec}s (tentative ${attempt + 1}/${maxRetries})`)
            await new Promise((r) => setTimeout(r, waitSec * 1000))
            imageFile = await toFile(fs.createReadStream(imagePath), path.basename(imagePath), { type: mimeType })
            continue
          }
          throw err
        }
      }

      const b64 = result && 'data' in result ? result.data?.[0]?.b64_json : undefined
      if (!b64) {
        return { success: false, outputPath: '', error: 'Aucune image dans la réponse OpenAI' }
      }

      const sourceName = path.basename(sourceImagePath, path.extname(sourceImagePath))
      const outputFilename = `${sourceName}_${targetLanguage}_${Date.now()}.png`
      const outputPath = path.join(OUTPUT_DIR, outputFilename)
      fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'))

      return { success: true, outputPath }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      return { success: false, outputPath: '', error: `OpenAI image: ${errMsg}` }
    } finally {
      if (croppedPath && fs.existsSync(croppedPath)) {
        try { fs.unlinkSync(croppedPath) } catch {}
      }
    }
  }
}
