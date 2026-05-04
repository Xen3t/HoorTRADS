export type Provider = 'gemini' | 'openai'

/**
 * Infer which API provider to call based on a model ID string.
 * OpenAI models start with "gpt-" or "o" (o3, o4, etc.). Everything else is treated as Gemini.
 */
export function inferProvider(modelId: string): Provider {
  if (!modelId) return 'gemini'
  const id = modelId.trim().toLowerCase()
  if (id.startsWith('gpt-') || /^o\d/.test(id)) return 'openai'
  return 'gemini'
}

/**
 * Returns true if this model is a Gemini image-generation model (needs NB2-style params).
 */
export function isGeminiImageModel(modelId: string): boolean {
  const id = (modelId || '').toLowerCase()
  return id.includes('image') && inferProvider(id) === 'gemini'
}

export function isTestModel(modelId: string): boolean {
  return (modelId || '').trim().toUpperCase() === 'TEST'
}
