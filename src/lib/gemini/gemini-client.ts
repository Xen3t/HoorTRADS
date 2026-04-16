import fs from 'fs'
import path from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ImageGenerator, GeneratedImage } from '@/types/generation'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'generated')

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }
  return mimeTypes[ext] || 'image/jpeg'
}

export class GeminiClient implements ImageGenerator {
  private client: GoogleGenerativeAI

  constructor() {
    // DB key takes priority over env variable
    let apiKey: string | null = null
    try {
      apiKey = getAppConfig(getDb(), 'gemini_api_key')
    } catch {
      // DB not yet ready — fall through to env
    }
    if (!apiKey) apiKey = process.env.GEMINI_API_KEY ?? null
    if (!apiKey) throw new Error('Gemini API key not configured (admin panel or GEMINI_API_KEY env)')
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async generateImage(
    sourceImagePath: string,
    targetLanguage: string,
    prompt: string
  ): Promise<GeneratedImage> {
    try {
      ensureOutputDir()

      const imageBuffer = fs.readFileSync(sourceImagePath)
      const base64Image = imageBuffer.toString('base64')
      const mimeType = getMimeType(sourceImagePath)

      const model = this.client.getGenerativeModel({
        model: 'gemini-3.1-flash-image-preview',
      })

      const response = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64Image } },
            ],
          },
        ],
      })

      const imagePart = response.response.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData
      )

      if (!imagePart?.inlineData?.data) {
        return { success: false, outputPath: '', error: 'No image in Gemini response' }
      }

      const sourceName = path.basename(sourceImagePath, path.extname(sourceImagePath))
      const outputFilename = `${sourceName}_${targetLanguage}_${Date.now()}.jpg`
      const outputPath = path.join(OUTPUT_DIR, outputFilename)

      fs.writeFileSync(outputPath, Buffer.from(imagePart.inlineData.data, 'base64'))

      return { success: true, outputPath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Gemini generation failed'
      return { success: false, outputPath: '', error: message }
    }
  }
}
