import type { ImageGenerator } from '@/types/generation'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import { GeminiClient } from '@/lib/gemini/gemini-client'
import { OpenAiImageClient } from '@/lib/openai/openai-image-client'
import { inferProvider, type Provider } from '@/lib/provider-utils'

export type ImageProvider = Provider

function getConfiguredModel(key: 'primary' | 'backup'): string {
  try {
    const db = getDb()
    if (key === 'primary') {
      return getAppConfig(db, 'primary_model_generate') || getAppConfig(db, 'model_generate') || 'gemini-3.1-flash-image-preview'
    }
    return getAppConfig(db, 'backup_model_generate') || ''
  } catch { return key === 'primary' ? 'gemini-3.1-flash-image-preview' : '' }
}

function isBackupEnabled(): boolean {
  try {
    const val = getAppConfig(getDb(), 'backup_enabled')
    if (val === null || val === undefined) return true
    return val === 'true' || val === '1'
  } catch { return true }
}

function createGeneratorForModel(modelId: string): ImageGenerator {
  const provider = inferProvider(modelId)
  // TEST routes to gemini (handled inside GeminiClient)
  if (provider === 'openai') return new OpenAiImageClient(modelId)
  return new GeminiClient(modelId)
}

export function createImageGenerator(): ImageGenerator {
  return createGeneratorForModel(getConfiguredModel('primary'))
}

export function createBackupImageGenerator(): ImageGenerator | null {
  if (!isBackupEnabled()) return null
  const backupModelId = getConfiguredModel('backup')
  if (!backupModelId) return null
  try {
    return createGeneratorForModel(backupModelId)
  } catch { return null }
}
