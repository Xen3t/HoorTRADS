import type { ImageGenerator } from '@/types/generation'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import { GeminiClient } from '@/lib/gemini/gemini-client'
import { OpenAiImageClient } from '@/lib/openai/openai-image-client'
import { inferProvider, type Provider } from '@/lib/provider-utils'

export type ImageProvider = Provider

/**
 * Reads the primary image model from admin config, infers its provider, and returns the right client.
 * Falls back to backup if primary fails to construct AND backup is enabled.
 * Legacy keys are supported for backward compatibility.
 */
export function getImageProvider(): ImageProvider {
  try {
    const db = getDb()
    const primaryModel = getAppConfig(db, 'primary_model_generate') || getAppConfig(db, 'model_generate')
    if (primaryModel) return inferProvider(primaryModel)
    // Legacy fallback: explicit image_provider key
    const legacy = getAppConfig(db, 'image_provider')
    if (legacy === 'openai') return 'openai'
  } catch {}
  return 'gemini'
}

export function createImageGenerator(): ImageGenerator {
  const provider = getImageProvider()
  if (provider === 'openai') return new OpenAiImageClient()
  return new GeminiClient()
}
