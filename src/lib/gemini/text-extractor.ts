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

export const DEFAULT_PRECISION_FILTER = `You are a translation quality expert. Analyze this French advertising image.

Step 1 — Read all visible text and understand the content (headlines, promo offers, CTA, promo codes, dates, prices, legal, etc.).

Step 2 — For each language below, review its DICTIONARY entries and STYLE RULES. Select ONLY those that are relevant to the text actually present in this image. Discard anything that doesn't apply.

Step 3 — For each relevant item, output a concise actionable hint in English:
- For dictionary: "prefer 'Tot 60% korting' rather than 'Tot -60%'"
- For style rules: include the rule as-is if it applies to this image's content`

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
}

export async function preValidateTranslations(
  imagePath: string,
  targetLanguages: string[],
  glossaryByLang: Record<string, { source: string; target: string }[]>,
  rulesByLang: Record<string, string[]>,
  filteredHints?: GlossaryHints
): Promise<PreTranslationResult> {
  if (!fs.existsSync(imagePath)) return { translations: {}, extractedZones: {} }

  const imageBuffer = fs.readFileSync(imagePath)
  const base64Image = imageBuffer.toString('base64')
  const mimeType = getMimeType(imagePath)

  const client = new GoogleGenerativeAI(getApiKey())

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

  const extractModel = client.getGenerativeModel({
    model: getModel('model_extract'),
    generationConfig: { temperature: 0 },
  })

  let frenchZones: Record<string, ExtractedZone> = {}
  try {
    const extractRes = await extractModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: extractPrompt }, { inlineData: { mimeType, data: base64Image } }] }],
    })
    const raw = extractRes.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    frenchZones = JSON.parse(raw)
  } catch {
    return { translations: {}, extractedZones: {} }
  }

  if (Object.keys(frenchZones).length === 0) return { translations: {}, extractedZones: frenchZones }

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
      if (!hints || hints.length === 0) return `${langName} (${lang}): no specific glossary guidance for this image`
      const hintLines = hints.map((h) => `  - ${h}`).join('\n')
      return `${langName} (${lang}):\n${hintLines}`
    }

    // Fallback: full glossary + rules (expert mode, or no hints available)
    const rules = rulesByLang[lang] || []
    const glossary = glossaryByLang[lang] || []
    const ruleLines = rules.map((r) => `  - ${r}`).join('\n')
    const glossaryLines = glossary.map((t) => `  - "${t.source}" → "${t.target}"`).join('\n')
    return `${langName} (${lang}):${ruleLines ? `\n  RULES (mandatory):\n${ruleLines}` : ''}${glossaryLines ? `\n  TERMS (use exactly):\n${glossaryLines}` : ''}`
  }).join('\n\n')

  const translatePrompt = `${translateInstruction}

French source zones:
${zonesText}

${perLangGuidance}

Respond ONLY with valid JSON, no markdown:
{
  "<lang_code>": { "<zone_label>": "<translated text>" }
}`

  const translateModel = client.getGenerativeModel({
    model: getModel('model_translate'),
    generationConfig: { temperature: 0 },
  })

  try {
    const translateRes = await translateModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: translatePrompt }] }],
    })
    const raw = translateRes.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    return { translations: JSON.parse(raw) || {}, extractedZones: frenchZones }
  } catch {
    return { translations: {}, extractedZones: frenchZones }
  }
}

/**
 * Precision mode:
 * gemini-2.5-flash analyzes the source image and filters BOTH dictionary terms
 * AND language rules to only those relevant to this specific image's content.
 * One API call per unique source image path.
 */
export async function filterGlossaryForImage(
  imagePath: string,
  targetLanguages: string[],
  glossaryByLang: Record<string, { source: string; target: string }[]>,
  rulesByLang: Record<string, string[]> = {}
): Promise<GlossaryHints> {
  if (!fs.existsSync(imagePath)) return {}

  const langsWithContent = targetLanguages.filter(
    (l) => (glossaryByLang[l]?.length > 0) || (rulesByLang[l]?.length > 0)
  )
  if (langsWithContent.length === 0) return {}

  const imageBuffer = fs.readFileSync(imagePath)
  const base64Image = imageBuffer.toString('base64')
  const mimeType = getMimeType(imagePath)

  const langRef = langsWithContent
    .map((lang) => {
      const langName = LANGUAGE_NAMES[lang] || lang
      const lines: string[] = []
      const terms = glossaryByLang[lang] || []
      if (terms.length > 0) {
        lines.push('  DICTIONARY (preferred substitutions):')
        terms.forEach((t, i) => lines.push(`    ${i + 1}. "${t.source}" → "${t.target}"`))
      }
      const rules = rulesByLang[lang] || []
      if (rules.length > 0) {
        lines.push('  STYLE RULES:')
        rules.forEach((r, i) => lines.push(`    ${i + 1}. ${r}`))
      }
      return `${langName} (${lang}):\n${lines.join('\n')}`
    })
    .join('\n\n')

  const filterInstruction = getPromptFromDb('prompt_precision_filter', DEFAULT_PRECISION_FILTER)
  const prompt = `${filterInstruction}

Language reference:
${langRef}

Respond ONLY with valid JSON, no markdown:
{
  "<lang_code>": ["<hint 1>", "<hint 2>"]
}

Return an empty array for a language if none of its entries apply to this image.`

  const client = new GoogleGenerativeAI(getApiKey())
  const model = client.getGenerativeModel({
    model: getModel('model_extract'),
    generationConfig: { temperature: 0.1 },
  })

  try {
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Image } }] }],
    })
    const raw = response.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(raw)

    const result: GlossaryHints = {}
    for (const lang of langsWithContent) {
      if (Array.isArray(parsed[lang]) && parsed[lang].length > 0) {
        result[lang] = parsed[lang]
      }
    }
    return result
  } catch {
    return {}
  }
}
