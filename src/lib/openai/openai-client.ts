import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import type { ExtractedZone, ExpertTranslations, PreTranslationResult } from '@/lib/gemini/text-extractor'

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French', nl: 'Dutch', de: 'German', cs: 'Czech', da: 'Danish',
  es: 'Spanish', fi: 'Finnish', en: 'English', el: 'Greek', hr: 'Croatian',
  hu: 'Hungarian', it: 'Italian', lt: 'Lithuanian', lv: 'Latvian',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', sv: 'Swedish',
  sl: 'Slovenian', sk: 'Slovak',
}

const DEFAULT_MODEL_EXTRACT = 'gpt-5-nano'
const DEFAULT_MODEL_TRANSLATE = 'gpt-5-mini'

export function getOpenAiKey(): string | null {
  let key: string | null = null
  try { key = getAppConfig(getDb(), 'openai_api_key') } catch {}
  if (!key) key = process.env.OPENAI_API_KEY ?? null
  return key
}

function getOpenAiModel(key: 'openai_model_extract' | 'openai_model_translate'): string {
  const defaults: Record<string, string> = {
    openai_model_extract: DEFAULT_MODEL_EXTRACT,
    openai_model_translate: DEFAULT_MODEL_TRANSLATE,
  }
  try {
    const db = getDb()
    // Prefer new backup_model_* key
    const step = key.replace('openai_model_', '')
    const backupVal = getAppConfig(db, `backup_model_${step}`)
    if (backupVal) return backupVal
    return getAppConfig(db, key) || defaults[key]
  } catch { return defaults[key] }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || 'image/jpeg'
}

function stripJsonFences(raw: string): string {
  return raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
}

const EXTRACT_INSTRUCTION = `Extract EVERY piece of visible text from this advertising image — do not skip anything.

Include: headlines, taglines, CTAs, discount amounts, promo codes, prices, dates, brand names, legal text, footnotes, and any other text visible in the image.

For each text zone, also capture its typographic properties:
- weight: "bold", "semibold", "regular", "light", or "thin"
- case: "uppercase" (ALL CAPS), "lowercase", "titlecase", or "mixed"
- color: hex code if determinable, otherwise a color name
- size: "large", "medium", or "small" relative to other text in the image

Rules:
- Return ONLY text that is clearly visible — do not invent or guess
- Preserve EXACT text content including case
- Give each text element a short descriptive label (e.g. headline, tagline, cta, discount_percent, promo_code, price, legal, brand_name)

Respond ONLY with valid JSON, no markdown:
{
  "<label>": {
    "text": "<exact text as seen>",
    "weight": "bold|semibold|regular|light|thin",
    "case": "uppercase|lowercase|titlecase|mixed",
    "color": "<hex code or color name>",
    "size": "large|medium|small"
  }
}`

const TRANSLATE_INSTRUCTION = `You are a native marketing copywriter. Translate the following French advertising text zones into each target language.

CRITICAL instructions:
1. Preserve typographic case exactly — ALL CAPS text must stay ALL CAPS in the translation
2. Translate ONLY these zones. Do not add, remove, or duplicate any text element
3. Write as a professional native copywriter — idiomatic, not word-for-word`

export async function openaiExtractZones(imagePath: string, modelId?: string): Promise<{ zones: Record<string, ExtractedZone>; error?: string }> {
  const key = getOpenAiKey()
  if (!key) return { zones: {}, error: 'OpenAI key not configured' }
  if (!fs.existsSync(imagePath)) return { zones: {}, error: 'image not found' }

  const imageBuffer = fs.readFileSync(imagePath)
  const base64Image = imageBuffer.toString('base64')
  const mimeType = getMimeType(imagePath)
  const dataUrl = `data:${mimeType};base64,${base64Image}`

  const client = new OpenAI({ apiKey: key })
  const resolvedModel = modelId || getOpenAiModel('openai_model_extract')
  try {
    console.log('[openai] calling extraction model:', resolvedModel)
    const res = await client.chat.completions.create({
      model: resolvedModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACT_INSTRUCTION },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    })
    const raw = res.choices[0]?.message?.content || ''
    console.log('[openai] extraction response:', raw.slice(0, 200))
    const zones = JSON.parse(stripJsonFences(raw)) as Record<string, ExtractedZone>
    console.log('[openai] zones parsed:', Object.keys(zones).length)
    return { zones }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[openai] EXTRACTION ERROR:', errMsg)
    return { zones: {}, error: `openai extraction: ${errMsg}` }
  }
}

export async function openaiTranslateZones(
  frenchZones: Record<string, ExtractedZone>,
  targetLanguages: string[],
  customPrompt?: string,
  modelId?: string
): Promise<{ translations: ExpertTranslations; error?: string }> {
  const key = getOpenAiKey()
  if (!key) return { translations: {}, error: 'OpenAI key not configured' }

  let prompt: string
  if (customPrompt) {
    prompt = customPrompt
  } else {
    const zonesText = Object.entries(frenchZones)
      .map(([zone, zoneData]) => `  "${zone}": "${zoneData.text}"`)
      .join('\n')
    const perLangGuidance = targetLanguages
      .map((lang) => `${LANGUAGE_NAMES[lang] || lang} (${lang})`)
      .join(', ')
    prompt = `${TRANSLATE_INSTRUCTION}

French source zones:
${zonesText}

Target languages: ${perLangGuidance}

Respond ONLY with valid JSON, no markdown:
{
  "<lang_code>": { "<zone_label>": "<translated text>" }
}`
  }

  const client = new OpenAI({ apiKey: key })
  const resolvedModel = modelId || getOpenAiModel('openai_model_translate')
  try {
    console.log('[openai] calling translation model:', resolvedModel, '| langs:', targetLanguages)
    const res = await client.chat.completions.create({
      model: resolvedModel,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    })
    const raw = res.choices[0]?.message?.content || ''
    console.log('[openai] translation response:', raw.slice(0, 300))
    const parsed = JSON.parse(stripJsonFences(raw)) as ExpertTranslations
    console.log('[openai] translation OK, langs:', Object.keys(parsed))
    return { translations: parsed }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[openai] TRANSLATION ERROR:', errMsg)
    return { translations: {}, error: `openai translation: ${errMsg}` }
  }
}

/**
 * Full fallback: extract + translate via OpenAI. Used when Gemini extraction fails.
 */
export async function openaiFullPipeline(
  imagePath: string,
  targetLanguages: string[]
): Promise<PreTranslationResult> {
  const extractResult = await openaiExtractZones(imagePath)
  if (extractResult.error || Object.keys(extractResult.zones).length === 0) {
    return {
      translations: {},
      extractedZones: extractResult.zones,
      error: extractResult.error || 'openai extraction: empty zones',
    }
  }
  const translateResult = await openaiTranslateZones(extractResult.zones, targetLanguages)
  if (translateResult.error) {
    return {
      translations: {},
      extractedZones: extractResult.zones,
      error: translateResult.error,
    }
  }
  return {
    translations: translateResult.translations,
    extractedZones: extractResult.zones,
  }
}
