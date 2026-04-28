import fs from 'fs'
import path from 'path'
import OpenAI, { toFile } from 'openai'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import type { ImageGenerator, GeneratedImage } from '@/types/generation'
import { getOpenAiKey } from '@/lib/openai/openai-client'

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

function mapSize(resolution: string): '1024x1024' | '1536x1024' | '1024x1536' | 'auto' {
  if (resolution === '2K' || resolution === '2k') return '1536x1024'
  return '1024x1024'
}

export class OpenAiImageClient implements ImageGenerator {
  private apiKey: string

  constructor() {
    const key = getOpenAiKey()
    if (!key) throw new Error('Clé API OpenAI manquante (panneau admin ou OPENAI_API_KEY)')
    this.apiKey = key
  }

  async generateImage(
    sourceImagePath: string,
    targetLanguage: string,
    prompt: string,
    resolution: string = '1K'
  ): Promise<GeneratedImage> {
    try {
      ensureOutputDir()
      if (!fs.existsSync(sourceImagePath)) {
        return { success: false, outputPath: '', error: `Source image not found: ${sourceImagePath}` }
      }

      const model = getOpenAiImageModel()
      const client = new OpenAI({ apiKey: this.apiKey })
      const size = mapSize(resolution)
      const mimeType = getMimeType(sourceImagePath)

      console.log('[openai-image] images.edit | model:', model, '| size:', size, '| lang:', targetLanguage)

      const imageFile = await toFile(
        fs.createReadStream(sourceImagePath),
        path.basename(sourceImagePath),
        { type: mimeType }
      )

      const result = await client.images.edit({
        model,
        image: imageFile,
        prompt,
        size,
        n: 1,
      })

      const b64 = result.data?.[0]?.b64_json
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
    }
  }
}
