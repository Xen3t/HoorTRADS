import fs from 'fs'
import path from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import { getModel } from '@/lib/gemini/gemini-client'

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French', nl: 'Dutch', de: 'German', cs: 'Czech', da: 'Danish',
  es: 'Spanish', fi: 'Finnish', en: 'English', el: 'Greek', hr: 'Croatian',
  hu: 'Hungarian', it: 'Italian', lt: 'Lithuanian', lv: 'Latvian',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', sv: 'Swedish',
  sl: 'Slovenian', sk: 'Slovak',
}

// ── Default prompts (must stay in sync with admin/prompts page defaults) ────
export const DEFAULT_GOOGLE_EXTRACT = `Extract EVERY piece of visible text from this advertising image — do not skip anything.

Include: headlines, taglines, CTAs, discount amounts (e.g. "-60%", "Jusqu'à 60% de réduction"), promo codes (e.g. "EXTRADISCOUNT", "CODE10"), prices (e.g. "49,99 €"), dates, brand names, legal text, footnotes, and any other text visible in the image.

For each text zone, also capture its typographic properties:
- weight: "bold", "semibold", "regular", "light", or "thin"
- case: "uppercase" (ALL CAPS), "lowercase", "titlecase", or "mixed"
- color: hex code if determinable, otherwise a color name (e.g. "white", "black", "orange", "#FF6B00")
- size: "large", "medium", or "small" relative to other text in the image

Rules:
- Return ONLY text that is clearly visible — do not invent or guess
- Preserve EXACT text content including case
- Give each text element a short descriptive label

Example labels: headline, tagline, cta, discount_percent, discount_label, promo_code, price, date, legal, brand_name, footnote`

export const DEFAULT_GOOGLE_TRANSLATE = `You are a native marketing copywriter. Translate the following French advertising text zones into each target language.

CRITICAL instructions:
1. Preserve typographic case exactly — ALL CAPS text must stay ALL CAPS in the translation
2. Translate ONLY these zones. Do not add, remove, or duplicate any text element
3. Write as a professional native copywriter — idiomatic, not word-for-word
4. Follow ALL rules and terms listed per language — they override your default choices`

// ── Helpers ─────────────────────────────────────────────────────────────────

function getApiKey(): string {
  let key: string | null = null
  try { key = getAppConfig(getDb(), 'gemini_api_key') } catch {}
  if (!key) key = process.env.GEMINI_API_KEY ?? null
  if (!key) throw new Error('Gemini API key not configured')
  return key
}

function getPromptFromDb(key: string, defaultValue: string): string {
  try { return getAppConfig(getDb(), key) || defaultValue } catch { return defaultValue }
}

function isProviderEnabled(key: 'pretrans_gemini_enabled' | 'pretrans_openai_enabled'): boolean {
  try {
    const val = getAppConfig(getDb(), key)
    // Default: both enabled if not set
    if (val === null || val === undefined) return true
    return val === 'true' || val === '1'
  } catch { return true }
}

/**
 * Returns true if the backup is enabled in admin config (new unified model). Defaults to true.
 */
function isBackupEnabled(): boolean {
  try {
    const val = getAppConfig(getDb(), 'backup_enabled')
    if (val === null || val === undefined) return true
    return val === 'true' || val === '1'
  } catch { return true }
}

import { inferProvider } from '@/lib/provider-utils'

/**
 * For a given step, return { primary, backup } provider identifiers based on the model IDs
 * configured in the admin. Falls back to legacy keys if new ones are not set.
 */
function getProvidersForStep(step: 'extract' | 'translate' | 'generate' | 'verify'): { primary: 'gemini' | 'openai'; backup: 'gemini' | 'openai' } {
  try {
    const db = getDb()
    const primaryId = getAppConfig(db, `primary_model_${step}`) || ''
    const backupId = getAppConfig(db, `backup_model_${step}`) || ''
    return {
      primary: primaryId ? inferProvider(primaryId) : 'gemini',
      backup: backupId ? inferProvider(backupId) : 'openai',
    }
  } catch {
    return { primary: 'gemini', backup: 'openai' }
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || 'image/jpeg'
}

export interface GlossaryHints {
  [lang: string]: string[]
}

export interface ExpertTranslations {
  [lang: string]: Record<string, string>
}

export interface ExtractedZone {
  text: string
  weight: 'bold' | 'semibold' | 'regular' | 'light' | 'thin'
  case: 'uppercase' | 'lowercase' | 'titlecase' | 'mixed'
  color: string   // hex (#FF6B00) or name ("white", "black")
  size: 'large' | 'medium' | 'small'
}

/**
 * Natif mode:
 * Step 1 — gemini-3.1-flash-lite-preview extracts all French text zones from the image,
 *           including typographic properties (weight, case, color, size).
 * Step 2 — gemini-3.1-pro-preview translates each zone for all target languages.
 * One API call pair per unique source image path.
 */
export interface PreTranslationResult {
  translations: ExpertTranslations
  extractedZones: Record<string, ExtractedZone>
  error?: string
  provider?: 'gemini' | 'openai' | 'mixed'
  configDocHints?: Record<string, string>
  docFilterError?: string
  configDocInjected?: boolean
  extractionPrompt?: string
  translationPrompt?: string
}

/**
 * Filter a configuration document per target language.
 * Given the extracted text zones and a config doc, returns per-language actionable hints
 * like "use price 49,99€", "apply promo code SUMMER25", etc.
 * Only relevant info per language is returned — no noise.
 */
export async function filterConfigDocPerLanguage(
  docContent: string,
  zones: Record<string, ExtractedZone>,
  targetLanguages: string[]
): Promise<{ hints: Record<string, string>; provider: 'gemini' | 'openai'; error?: string }> {
  const zonesList = Object.entries(zones).map(([label, z]) => `  - ${label}: "${z.text}"`).join('\n')
  const langsList = targetLanguages.map((l) => `${LANGUAGE_NAMES[l] || l} (${l})`).join(', ')

  const prompt = `You receive a configuration document with market-specific advertising info (prices, promo codes, dates, disclaimers, etc.) and a list of target languages.

Your task: extract ALL values from the document, organized by target language/market.

Instructions:
- For each target language, collect every price, promo code, discount amount, date, legal mention, or market-specific value found in the document
- If a value applies to all markets (e.g. a universal promo code), include it for every language listed
- Output concise, actionable instructions (e.g. "use price 49,99€", "apply code SUMMER25", "mention légale: ...")
- If the document has no data at all for a specific language, omit that language — but do NOT omit a language just because the data looks similar to French

Configuration document:
---
${docContent}
---

French text zones in the visual (for reference):
${zonesList}

Target languages to extract for: ${langsList}

Respond ONLY with valid JSON, no markdown:
{
  "<lang_code>": "<hint text, multiple lines OK>"
}`

  // Use the dedicated doc-filter model if set, else fall back to extract model
  const docFilterModel = (() => {
    try {
      const db = getDb()
      return getAppConfig(db, 'primary_model_doc_filter') || getAppConfig(db, 'model_extract') || getModel('model_extract')
    } catch { return getModel('model_extract') }
  })()
  const docFilterProvider = inferProvider(docFilterModel)

  // If doc filter is configured to OpenAI, call OpenAI directly
  if (docFilterProvider === 'openai') {
    try {
      const { default: OpenAI } = await import('openai')
      const { getOpenAiKey } = await import('@/lib/openai/openai-client')
      const key = getOpenAiKey()
      if (!key) return { hints: {}, provider: 'openai', error: 'OpenAI key missing' }
      const openai = new OpenAI({ apiKey: key })
      const r = await openai.chat.completions.create({
        model: docFilterModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      })
      const raw = r.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(raw) as Record<string, string>
      return { hints: parsed, provider: 'openai' }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      return { hints: {}, provider: 'openai', error: errMsg }
    }
  }

  // Gemini path
  try {
    const client = new GoogleGenerativeAI(getApiKey())
    const model = client.getGenerativeModel({ model: docFilterModel, generationConfig: { temperature: 0 } })
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    const raw = res.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(raw) as Record<string, string>
    return { hints: parsed, provider: 'gemini' }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[configDoc] Gemini filter failed, trying OpenAI:', errMsg)
    try {
      const { default: OpenAI } = await import('openai')
      const { getOpenAiKey } = await import('@/lib/openai/openai-client')
      const key = getOpenAiKey()
      if (!key) return { hints: {}, provider: 'gemini', error: `gemini: ${errMsg} (no OpenAI fallback key)` }
      const openai = new OpenAI({ apiKey: key })
      const r = await openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      })
      const raw = r.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(raw) as Record<string, string>
      return { hints: parsed, provider: 'openai' }
    } catch (e2: unknown) {
      const errMsg2 = e2 instanceof Error ? e2.message : String(e2)
      return { hints: {}, provider: 'gemini', error: `gemini: ${errMsg} / openai: ${errMsg2}` }
    }
  }
}

export interface PreValidateProgressCb {
  (phase: 'extracting' | 'extracted' | 'doc_filtering' | 'doc_filtered' | 'translating' | 'translated', data: Partial<PreTranslationResult>): void
}

export async function preValidateTranslations(
  imagePath: string,
  targetLanguages: string[],
  glossaryByLang: Record<string, { source: string; target: string }[]>,
  rulesByLang: Record<string, string[]>,
  filteredHints?: GlossaryHints,
  configDocContent?: string,
  onProgress?: PreValidateProgressCb
): Promise<PreTranslationResult> {
  console.log('[preValidate] start', { imagePath, langs: targetLanguages })
  if (!fs.existsSync(imagePath)) { console.log('[preValidate] image not found'); return { translations: {}, extractedZones: {}, error: 'image not found' } }

  // New unified provider resolution — based on primary/backup model IDs
  const extractProviders = getProvidersForStep('extract')
  const backupEnabled = isBackupEnabled()

  // Code path is determined by the PRIMARY provider only.
  // Legacy pretrans_gemini_enabled / pretrans_openai_enabled flags are no longer used.
  const geminiEnabled = extractProviders.primary === 'gemini'
  const openaiEnabled = extractProviders.primary === 'openai'
  console.log('[preValidate] providers: primary extract=' + extractProviders.primary + ', backup=' + extractProviders.backup + ' (backupEnabled=' + backupEnabled + ') → Gemini=' + geminiEnabled + ', OpenAI=' + openaiEnabled)

  if (!geminiEnabled && !openaiEnabled) {
    return { translations: {}, extractedZones: {}, error: 'both providers disabled in admin config' }
  }

  // If Gemini disabled → run OpenAI extraction then fall through to shared translation path
  if (!geminiEnabled && openaiEnabled) {
    const { openaiExtractZones, getOpenAiKey } = await import('@/lib/openai/openai-client')
    if (!getOpenAiKey()) return { translations: {}, extractedZones: {}, error: 'Gemini disabled and OpenAI key not configured' }
    console.log('[preValidate] Gemini disabled — running OpenAI extraction, then shared translation path')
    onProgress?.('extracting', {})
    const extractRes = await openaiExtractZones(imagePath)
    if (extractRes.error || Object.keys(extractRes.zones).length === 0) {
      return { translations: {}, extractedZones: {}, error: extractRes.error || 'OpenAI extraction: empty zones', provider: 'openai' }
    }
    onProgress?.('extracted', { extractedZones: extractRes.zones, provider: 'openai' })
    // Fall through to shared translation path below with frenchZones set
    const frenchZonesOpenAI = extractRes.zones
    const configDocInjectedOpenAI = !!(configDocContent?.trim())
    if (configDocInjectedOpenAI) onProgress?.('doc_filtered', {})
    onProgress?.('translating', {})
    const translateInstructionOpenAI = getPromptFromDb('prompt_google_translate', DEFAULT_GOOGLE_TRANSLATE)
    const zonesTextOpenAI = Object.entries(frenchZonesOpenAI).map(([k, v]) => `  "${k}": "${v.text}"`).join('\n')
    const perLangOpenAI = targetLanguages.map((lang) => {
      const langName = LANGUAGE_NAMES[lang] || lang
      if (filteredHints) {
        const hints = filteredHints[lang]
        return (!hints || hints.length === 0)
          ? `${langName} (${lang}): no specific glossary guidance for this image`
          : `${langName} (${lang}):\n${hints.map((h) => `  - ${h}`).join('\n')}`
      }
      const rules = (rulesByLang[lang] || []).map((r) => `  - ${r}`).join('\n')
      const glossary = (glossaryByLang[lang] || []).map((t) => `  - "${t.source}" → "${t.target}"`).join('\n')
      return `${langName} (${lang}):${rules ? `\n  RULES (mandatory):\n${rules}` : ''}${glossary ? `\n  TERMS (use exactly):\n${glossary}` : ''}`
    }).join('\n\n')
    const rawDocOpenAI = configDocInjectedOpenAI
      ? `\nCONFIG DOCUMENT — raw market data attached to this campaign:\n---\n${configDocContent!.trim()}\n---\nOVERRIDE RULE: For each target language, identify the values in this document that apply to that market (prices, promo codes, dates, legal mentions) and USE them verbatim — do NOT translate the French value from the visual.\n`
      : ''
    const translatePromptOpenAI = `${translateInstructionOpenAI}\n${rawDocOpenAI}\nFrench source zones:\n${zonesTextOpenAI}\n\n${perLangOpenAI}\n\nRespond ONLY with valid JSON, no markdown:\n{\n  "<lang_code>": { "<zone_label>": "<translated text>" }\n}`
    const { openaiTranslateZones } = await import('@/lib/openai/openai-client')
    const translateRes = await openaiTranslateZones(frenchZonesOpenAI, targetLanguages, translatePromptOpenAI)
    if (!translateRes.error && Object.keys(translateRes.translations).length > 0) {
      onProgress?.('translated', { translations: translateRes.translations, provider: 'openai' })
      return { translations: translateRes.translations, extractedZones: frenchZonesOpenAI, provider: 'openai', configDocInjected: configDocInjectedOpenAI, translationPrompt: translatePromptOpenAI }
    }
    return { translations: {}, extractedZones: frenchZonesOpenAI, error: translateRes.error || 'OpenAI translation failed', provider: 'openai', configDocInjected: configDocInjectedOpenAI, translationPrompt: translatePromptOpenAI }
  }

  const imageBuffer = fs.readFileSync(imagePath)
  const base64Image = imageBuffer.toString('base64')
  const mimeType = getMimeType(imagePath)
  console.log('[preValidate] image loaded, size:', imageBuffer.length, 'mime:', mimeType)

  const apiKey = getApiKey()
  console.log('[preValidate] key:', apiKey.slice(0, 6) + '...')
  const client = new GoogleGenerativeAI(apiKey)

  // ── Step 1: Extract every visible text zone ─────────────────────────────
  const extractInstruction = getPromptFromDb('prompt_google_extract', DEFAULT_GOOGLE_EXTRACT)
  const extractPrompt = `${extractInstruction}

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

  // Route based on the configured extraction model's provider
  const extractModelId = getModel('model_extract')
  const extractProvider = inferProvider(extractModelId)

  let frenchZones: Record<string, ExtractedZone> = {}
  let extractionFailed = false
  let extractionErrMsg = ''
  let extractionUsedProvider: 'gemini' | 'openai' = 'gemini'
  onProgress?.('extracting', {})

  // If primary extraction provider is OpenAI, call OpenAI directly
  if (extractProvider === 'openai') {
    const { openaiExtractZones, getOpenAiKey } = await import('@/lib/openai/openai-client')
    if (!getOpenAiKey()) {
      return { translations: {}, extractedZones: {}, error: `extraction: OpenAI key missing for model ${extractModelId}`, provider: 'openai' }
    }
    console.log('[preValidate] calling OpenAI extraction:', extractModelId)
    const r = await openaiExtractZones(imagePath)
    if (r.error || Object.keys(r.zones).length === 0) {
      extractionErrMsg = r.error || 'empty zones'
      extractionFailed = true
    } else {
      frenchZones = r.zones
      extractionUsedProvider = 'openai'
    }
  } else {
    // Gemini extraction path
    const extractModel = client.getGenerativeModel({
      model: extractModelId,
      generationConfig: { temperature: 0 },
    })
    try {
      console.log('[preValidate] calling Gemini extraction:', extractModelId)
      const geminiExtract = extractModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: extractPrompt }, { inlineData: { mimeType, data: base64Image } }] }],
      })
      const extractTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('gemini extraction timeout after 45s')), 45_000)
      )
      const extractRes = await Promise.race([geminiExtract, extractTimeout])
      const raw = extractRes.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
      console.log('[preValidate] extraction response:', raw.slice(0, 200))
      frenchZones = JSON.parse(raw)
      console.log('[preValidate] zones parsed:', Object.keys(frenchZones).length)
    } catch (e: unknown) {
      extractionErrMsg = e instanceof Error ? e.message : String(e)
      console.error('[preValidate] GEMINI EXTRACTION ERROR, falling back to OpenAI:', extractionErrMsg)
      extractionFailed = true
    }
  }

  // If Gemini extraction failed OR returned empty — try OpenAI extraction, then fall through to shared translation path
  if (extractionFailed || Object.keys(frenchZones).length === 0) {
    if (!openaiEnabled) {
      return { translations: {}, extractedZones: frenchZones, error: `extraction: ${extractionErrMsg || 'empty zones'} (OpenAI fallback disabled)`, provider: 'gemini' }
    }
    const { openaiExtractZones, getOpenAiKey } = await import('@/lib/openai/openai-client')
    if (!getOpenAiKey()) {
      return { translations: {}, extractedZones: frenchZones, error: `extraction: ${extractionErrMsg || 'empty zones'} (OpenAI key not configured)`, provider: 'gemini' }
    }
    console.log('[preValidate] Gemini extraction failed — trying OpenAI extraction fallback')
    const openaiExtract = await openaiExtractZones(imagePath)
    if (openaiExtract.error || Object.keys(openaiExtract.zones).length === 0) {
      return { translations: {}, extractedZones: {}, error: `gemini: ${extractionErrMsg || 'empty zones'} / openai: ${openaiExtract.error || 'empty zones'}`, provider: 'openai' }
    }
    frenchZones = openaiExtract.zones
    extractionUsedProvider = 'openai'
    console.log('[preValidate] OpenAI extraction fallback OK, zones:', Object.keys(frenchZones).length)
  }

  // Extraction done — notify so UI can display it immediately (using whichever provider actually ran)
  onProgress?.('extracted', { extractedZones: frenchZones, provider: extractionUsedProvider })

  // ── Step 1.5: Filter config doc per language (if provided) ──────────────
  const configDocInjected = !!(configDocContent && configDocContent.trim())
  if (configDocInjected) {
    console.log('[preValidate] config doc present — injecting raw into translation prompt (no separate filter step)')
    onProgress?.('doc_filtered', {})
  }

  // Notify translation is starting
  onProgress?.('translating', {})

  // ── Step 2: Translate all zones to all target languages ─────────────────
  const translateInstruction = getPromptFromDb('prompt_google_translate', DEFAULT_GOOGLE_TRANSLATE)

  // Pass only the text strings to the translation model
  const zonesText = Object.entries(frenchZones)
    .map(([zone, zoneData]) => `  "${zone}": "${zoneData.text}"`)
    .join('\n')

  const perLangGuidance = targetLanguages.map((lang) => {
    const langName = LANGUAGE_NAMES[lang] || lang

    // When filtered hints are provided (Google mode), use concise context-aware guidance
    if (filteredHints) {
      const hints = filteredHints[lang]
      return (!hints || hints.length === 0)
        ? `${langName} (${lang}): no specific glossary guidance for this image`
        : `${langName} (${lang}):\n${hints.map((h) => `  - ${h}`).join('\n')}`
    }

    // Full glossary + rules
    const rules = rulesByLang[lang] || []
    const glossary = glossaryByLang[lang] || []
    const ruleLines = rules.map((r) => `  - ${r}`).join('\n')
    const glossaryLines = glossary.map((t) => `  - "${t.source}" → "${t.target}"`).join('\n')
    return `${langName} (${lang}):${ruleLines ? `\n  RULES (mandatory):\n${ruleLines}` : ''}${glossaryLines ? `\n  TERMS (use exactly):\n${glossaryLines}` : ''}`
  }).join('\n\n')

  const rawDocSection = configDocInjected
    ? `\nCONFIG DOCUMENT — raw market data attached to this campaign:\n---\n${configDocContent!.trim()}\n---\nOVERRIDE RULE: This document contains market-specific values (prices, promo codes, dates, legal mentions, etc.). For each target language, identify which entries in this document apply to that market and USE those exact values verbatim in your translation — do NOT translate the French value from the visual. You must figure out which doc entry maps to which language/country.\n`
    : ''

  const translatePrompt = `${translateInstruction}
${rawDocSection}
French source zones:
${zonesText}

${perLangGuidance}

Respond ONLY with valid JSON, no markdown:
{
  "<lang_code>": { "<zone_label>": "<translated text>" }
}`

  // Route based on the configured translation model's provider
  const translateModelId = getModel('model_translate')
  const translateProvider = inferProvider(translateModelId)
  console.log('[preValidate] calling translation model:', translateModelId, '(provider:', translateProvider + ') | langs:', targetLanguages)

  // If primary translation provider is OpenAI, call OpenAI directly (don't waste a call to Gemini)
  if (translateProvider === 'openai') {
    const { openaiTranslateZones, getOpenAiKey } = await import('@/lib/openai/openai-client')
    if (!getOpenAiKey()) {
      return { translations: {}, extractedZones: frenchZones, error: `translation: OpenAI key missing for model ${translateModelId}`, provider: 'openai', configDocInjected }
    }
    // Pass full translatePrompt (includes raw doc section if present)
    const r = await openaiTranslateZones(frenchZones, targetLanguages, translatePrompt)
    if (!r.error && Object.keys(r.translations).length > 0) {
      onProgress?.('translated', { translations: r.translations, provider: 'openai' })
      return { translations: r.translations, extractedZones: frenchZones, provider: 'openai', configDocInjected, extractionPrompt: extractPrompt, translationPrompt: translatePrompt}
    }
    // OpenAI failed — try Gemini as fallback if backup enabled
    if (!isProviderEnabled('pretrans_gemini_enabled')) {
      return { translations: {}, extractedZones: frenchZones, error: `openai translation: ${r.error || 'failed'} (Gemini fallback disabled)`, provider: 'openai', configDocInjected, extractionPrompt: extractPrompt, translationPrompt: translatePrompt}
    }
    console.error('[preValidate] OPENAI TRANSLATION ERROR, falling back to Gemini:', r.error)
    // Fall through to Gemini path below
  }

  const translateModel = client.getGenerativeModel({
    model: translateProvider === 'gemini' ? translateModelId : 'gemini-3.1-pro-preview',
    generationConfig: { temperature: 0 },
  })

  try {
    // Wrap Gemini translation in a 60s timeout to avoid infinite hang
    const geminiTranslation = translateModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: translatePrompt }] }],
    })
    const translateTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('gemini translation timeout after 60s')), 60_000)
    )
    const translateRes = await Promise.race([geminiTranslation, translateTimeout])
    const raw = translateRes.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    console.log('[preValidate] translation response:', raw.slice(0, 300))
    const parsed = JSON.parse(raw) || {}
    console.log('[preValidate] translation OK, langs:', Object.keys(parsed))
    onProgress?.('translated', { translations: parsed, provider: 'gemini' })
    return { translations: parsed, extractedZones: frenchZones, provider: 'gemini', configDocInjected, extractionPrompt: extractPrompt, translationPrompt: translatePrompt}
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e)
    if (!openaiEnabled) {
      console.error('[preValidate] GEMINI TRANSLATION ERROR (OpenAI fallback disabled):', errMsg)
      return { translations: {}, extractedZones: frenchZones, error: `translation: ${errMsg} (OpenAI fallback disabled)`, provider: 'gemini', configDocInjected, extractionPrompt: extractPrompt, translationPrompt: translatePrompt}
    }
    console.error('[preValidate] GEMINI TRANSLATION ERROR, falling back to OpenAI:', errMsg)
    const { openaiTranslateZones, getOpenAiKey } = await import('@/lib/openai/openai-client')
    if (getOpenAiKey()) {
      const openaiResult = await openaiTranslateZones(frenchZones, targetLanguages, translatePrompt)
      if (!openaiResult.error && Object.keys(openaiResult.translations).length > 0) {
        console.log('[preValidate] OpenAI translation fallback OK')
        onProgress?.('translated', { translations: openaiResult.translations, provider: 'mixed' })
        return { translations: openaiResult.translations, extractedZones: frenchZones, provider: 'mixed', configDocInjected, extractionPrompt: extractPrompt, translationPrompt: translatePrompt}
      }
      return { translations: {}, extractedZones: frenchZones, error: `gemini translation: ${errMsg} / openai: ${openaiResult.error || 'failed'}`, configDocInjected, extractionPrompt: extractPrompt, translationPrompt: translatePrompt}
    }
    return { translations: {}, extractedZones: frenchZones, error: `translation: ${errMsg} (OpenAI key not configured)`, extractionPrompt: extractPrompt, translationPrompt: translatePrompt}
  }
}

/**
 * Precision mode:
 * gemini-2.5-flash analyzes the source image and filters BOTH dictionary terms
 * AND language rules to only those relevant to this specific image's content.
 * One API call per unique source image path.
 */
