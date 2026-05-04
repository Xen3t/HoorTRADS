import fs from 'fs'
import path from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import { getModel } from '@/lib/gemini/gemini-client'
import { inferProvider } from '@/lib/provider-utils'
import { isTestModel } from '@/lib/provider-utils'

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

// ── Generic provider-agnostic helpers ────────────────────────────────────────

async function callExtractModel(
  modelId: string,
  imagePath: string,
  base64Image: string,
  mimeType: string,
  extractPrompt: string
): Promise<{ zones: Record<string, ExtractedZone>; error?: string }> {
  if (isTestModel(modelId)) return { zones: {}, error: 'TEST model — toujours en échec (test backup)' }
  const provider = inferProvider(modelId)
  if (provider === 'openai') {
    const { openaiExtractZones, getOpenAiKey } = await import('@/lib/openai/openai-client')
    if (!getOpenAiKey()) return { zones: {}, error: 'OpenAI key not configured' }
    return openaiExtractZones(imagePath, modelId)
  }
  // Gemini
  try {
    const client = new GoogleGenerativeAI(getApiKey())
    const model = client.getGenerativeModel({ model: modelId, generationConfig: { temperature: 0 } })
    const geminiExtract = model.generateContent({
      contents: [{ role: 'user', parts: [{ text: extractPrompt }, { inlineData: { mimeType, data: base64Image } }] }],
    })
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('gemini extraction timeout after 45s')), 45_000)
    )
    const res = await Promise.race([geminiExtract, timeout])
    const raw = res.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    const zones = JSON.parse(raw) as Record<string, ExtractedZone>
    return { zones }
  } catch (e: unknown) {
    return { zones: {}, error: e instanceof Error ? e.message : String(e) }
  }
}

async function callTranslateModel(
  modelId: string,
  frenchZones: Record<string, ExtractedZone>,
  targetLanguages: string[],
  translatePrompt: string
): Promise<{ translations: ExpertTranslations; error?: string }> {
  if (isTestModel(modelId)) return { translations: {}, error: 'TEST model — toujours en échec (test backup)' }
  const provider = inferProvider(modelId)
  if (provider === 'openai') {
    const { openaiTranslateZones, getOpenAiKey } = await import('@/lib/openai/openai-client')
    if (!getOpenAiKey()) return { translations: {}, error: 'OpenAI key not configured' }
    return openaiTranslateZones(frenchZones, targetLanguages, translatePrompt, modelId)
  }
  // Gemini
  try {
    const client = new GoogleGenerativeAI(getApiKey())
    const model = client.getGenerativeModel({ model: modelId, generationConfig: { temperature: 0 } })
    const geminiTranslation = model.generateContent({
      contents: [{ role: 'user', parts: [{ text: translatePrompt }] }],
    })
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('gemini translation timeout after 60s')), 60_000)
    )
    const res = await Promise.race([geminiTranslation, timeout])
    const raw = res.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    const translations = JSON.parse(raw) as ExpertTranslations
    return { translations }
  } catch (e: unknown) {
    return { translations: {}, error: e instanceof Error ? e.message : String(e) }
  }
}

async function callDocFilterModel(
  modelId: string,
  prompt: string
): Promise<{ hints: Record<string, string>; error?: string }> {
  if (isTestModel(modelId)) return { hints: {}, error: 'TEST model — toujours en échec (test backup)' }
  const provider = inferProvider(modelId)
  if (provider === 'openai') {
    try {
      const { default: OpenAI } = await import('openai')
      const { getOpenAiKey } = await import('@/lib/openai/openai-client')
      const key = getOpenAiKey()
      if (!key) return { hints: {}, error: 'OpenAI key missing' }
      const openai = new OpenAI({ apiKey: key })
      const r = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      })
      const raw = r.choices[0]?.message?.content || '{}'
      return { hints: JSON.parse(raw) as Record<string, string> }
    } catch (e: unknown) {
      return { hints: {}, error: e instanceof Error ? e.message : String(e) }
    }
  }
  // Gemini
  try {
    const client = new GoogleGenerativeAI(getApiKey())
    const model = client.getGenerativeModel({ model: modelId, generationConfig: { temperature: 0 } })
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    const raw = res.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    return { hints: JSON.parse(raw) as Record<string, string> }
  } catch (e: unknown) {
    return { hints: {}, error: e instanceof Error ? e.message : String(e) }
  }
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

  const primaryModelId = (() => {
    try {
      const db = getDb()
      return getAppConfig(db, 'primary_model_doc_filter') || getAppConfig(db, 'model_extract') || getModel('model_extract')
    } catch { return getModel('model_extract') }
  })()
  const backupEnabled = isBackupEnabled()
  const backupModelId = backupEnabled ? (() => {
    try { return getAppConfig(getDb(), 'backup_model_doc_filter') || '' } catch { return '' }
  })() : ''

  let result = await callDocFilterModel(primaryModelId, prompt)
  if ((result.error || Object.keys(result.hints).length === 0) && backupModelId) {
    console.log('[configDoc] primary failed, trying backup:', backupModelId, '| error:', result.error)
    result = await callDocFilterModel(backupModelId, prompt)
  }
  if (result.error) {
    return { hints: {}, provider: inferProvider(primaryModelId) as 'gemini' | 'openai', error: result.error }
  }
  return { hints: result.hints, provider: inferProvider(primaryModelId) as 'gemini' | 'openai' }
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
  if (!fs.existsSync(imagePath)) return { translations: {}, extractedZones: {}, error: 'image not found' }

  const backupEnabled = isBackupEnabled()

  const primaryExtractModelId = getModel('model_extract')
  const backupExtractModelId = backupEnabled ? (() => { try { return getAppConfig(getDb(), 'backup_model_extract') || '' } catch { return '' } })() : ''
  const primaryTranslateModelId = getModel('model_translate')
  const backupTranslateModelId = backupEnabled ? (() => { try { return getAppConfig(getDb(), 'backup_model_translate') || '' } catch { return '' } })() : ''

  console.log('[preValidate] extract primary=' + primaryExtractModelId + ' backup=' + (backupExtractModelId || 'none'))
  console.log('[preValidate] translate primary=' + primaryTranslateModelId + ' backup=' + (backupTranslateModelId || 'none'))

  const imageBuffer = fs.readFileSync(imagePath)
  const base64Image = imageBuffer.toString('base64')
  const mimeType = getMimeType(imagePath)
  console.log('[preValidate] image loaded, size:', imageBuffer.length, 'mime:', mimeType)

  // ── Step 1: Extract ──────────────────────────────────────────────────────
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

  onProgress?.('extracting', {})
  console.log('[preValidate] calling extraction model:', primaryExtractModelId)
  let extractResult = await callExtractModel(primaryExtractModelId, imagePath, base64Image, mimeType, extractPrompt)

  if ((extractResult.error || Object.keys(extractResult.zones).length === 0) && backupExtractModelId) {
    console.log('[preValidate] primary extract failed (' + extractResult.error + '), trying backup:', backupExtractModelId)
    extractResult = await callExtractModel(backupExtractModelId, imagePath, base64Image, mimeType, extractPrompt)
  }

  if (extractResult.error || Object.keys(extractResult.zones).length === 0) {
    return { translations: {}, extractedZones: {}, error: `extraction failed: ${extractResult.error || 'empty zones'}`, provider: inferProvider(primaryExtractModelId) as 'gemini' | 'openai' }
  }

  const frenchZones = extractResult.zones
  const extractUsedProvider = inferProvider(primaryExtractModelId) as 'gemini' | 'openai'
  console.log('[preValidate] extraction OK, zones:', Object.keys(frenchZones).length)
  onProgress?.('extracted', { extractedZones: frenchZones, provider: extractUsedProvider })

  // ── Step 1.5: Doc filter ─────────────────────────────────────────────────
  const configDocInjected = !!(configDocContent && configDocContent.trim())
  if (configDocInjected) {
    onProgress?.('doc_filtered', {})
  }

  // ── Step 2: Translate ────────────────────────────────────────────────────
  const translateInstruction = getPromptFromDb('prompt_google_translate', DEFAULT_GOOGLE_TRANSLATE)

  const zonesText = Object.entries(frenchZones)
    .map(([zone, zoneData]) => `  "${zone}": "${zoneData.text}"`)
    .join('\n')

  const perLangGuidance = targetLanguages.map((lang) => {
    const langName = LANGUAGE_NAMES[lang] || lang
    if (filteredHints) {
      const hints = filteredHints[lang]
      return (!hints || hints.length === 0)
        ? `${langName} (${lang}): no specific glossary guidance for this image`
        : `${langName} (${lang}):\n${hints.map((h) => `  - ${h}`).join('\n')}`
    }
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

  onProgress?.('translating', {})
  console.log('[preValidate] calling translation model:', primaryTranslateModelId, '| langs:', targetLanguages)
  let translateResult = await callTranslateModel(primaryTranslateModelId, frenchZones, targetLanguages, translatePrompt)

  if ((translateResult.error || Object.keys(translateResult.translations).length === 0) && backupTranslateModelId) {
    console.log('[preValidate] primary translate failed (' + translateResult.error + '), trying backup:', backupTranslateModelId)
    translateResult = await callTranslateModel(backupTranslateModelId, frenchZones, targetLanguages, translatePrompt)
  }

  if (translateResult.error || Object.keys(translateResult.translations).length === 0) {
    return { translations: {}, extractedZones: frenchZones, error: `translation failed: ${translateResult.error || 'empty'}`, provider: extractUsedProvider, configDocInjected, extractionPrompt: extractPrompt, translationPrompt: translatePrompt }
  }

  console.log('[preValidate] translation OK, langs:', Object.keys(translateResult.translations))
  const translateUsedProvider = inferProvider(primaryTranslateModelId) as 'gemini' | 'openai'
  const finalProvider: 'gemini' | 'openai' | 'mixed' = extractUsedProvider === translateUsedProvider ? extractUsedProvider : 'mixed'
  onProgress?.('translated', { translations: translateResult.translations, provider: finalProvider })
  return { translations: translateResult.translations, extractedZones: frenchZones, provider: finalProvider, configDocInjected, extractionPrompt: extractPrompt, translationPrompt: translatePrompt }
}

/**
 * Precision mode:
 * gemini-2.5-flash analyzes the source image and filters BOTH dictionary terms
 * AND language rules to only those relevant to this specific image's content.
 * One API call per unique source image path.
 */
