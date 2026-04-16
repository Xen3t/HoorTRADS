import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import path from 'path'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import { DEFAULT_GOOGLE_EXTRACT, DEFAULT_GOOGLE_TRANSLATE } from '@/lib/gemini/text-extractor'

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French', nl: 'Dutch', de: 'German', cs: 'Czech', da: 'Danish',
  es: 'Spanish', fi: 'Finnish', en: 'English', el: 'Greek', hr: 'Croatian',
  hu: 'Hungarian', it: 'Italian', lt: 'Lithuanian', lv: 'Latvian',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', sv: 'Swedish',
  sl: 'Slovenian', sk: 'Slovak',
}

function getApiKey(): string {
  let key: string | null = null
  try { key = getAppConfig(getDb(), 'gemini_api_key') } catch {}
  if (!key) key = process.env.GEMINI_API_KEY ?? null
  if (!key) throw new Error('Clé API Gemini non configurée')
  return key
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || 'image/jpeg'
}

function getPromptFromDb(key: string, defaultValue: string): string {
  try { return getAppConfig(getDb(), key) || defaultValue } catch { return defaultValue }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const imageFile = formData.get('image') as File | null
    const extractModel = (formData.get('extractModel') as string) || 'gemini-2.5-flash'
    const translateModel = (formData.get('translateModel') as string) || 'gemini-2.5-pro'
    const targetLanguages: string[] = JSON.parse((formData.get('targetLanguages') as string) || '["es","de"]')

    if (!imageFile) {
      return NextResponse.json({ error: 'Aucune image fournie' }, { status: 400 })
    }

    const arrayBuffer = await imageFile.arrayBuffer()
    const base64Image = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = getMimeType(imageFile.name)

    const apiKey = getApiKey()
    const client = new GoogleGenerativeAI(apiKey)

    // ── Étape 1 : Extraction du texte français ──────────────────────────────
    const extractInstruction = getPromptFromDb('prompt_google_extract', DEFAULT_GOOGLE_EXTRACT)
    const extractPrompt = `${extractInstruction}\n\nRespond ONLY with valid JSON, no markdown:\n{\n  "<label>": {\n    "text": "<exact text as seen>",\n    "weight": "bold|semibold|regular|light|thin",\n    "case": "uppercase|lowercase|titlecase|mixed",\n    "color": "<hex code or color name>",\n    "size": "large|medium|small"\n  }\n}`

    const extractClient = client.getGenerativeModel({
      model: extractModel,
      generationConfig: { temperature: 0 },
    })

    let frenchZones: Record<string, { text: string; weight: string; case: string; color: string; size: string }> = {}
    let extractError: string | undefined
    let extractRaw = ''
    let extractDurationMs = 0

    const extractStart = Date.now()
    try {
      const res = await extractClient.generateContent({
        contents: [{ role: 'user', parts: [{ text: extractPrompt }, { inlineData: { mimeType, data: base64Image } }] }],
      })
      extractDurationMs = Date.now() - extractStart
      extractRaw = res.response.text().trim()
      const cleaned = extractRaw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
      frenchZones = JSON.parse(cleaned)
    } catch (e) {
      extractDurationMs = Date.now() - extractStart
      extractError = e instanceof Error ? e.message : 'Extraction échouée'
    }

    if (Object.keys(frenchZones).length === 0) {
      return NextResponse.json({
        extractModel, translateModel,
        extractPrompt, extractRaw, extractError, extractDurationMs,
        extractedZones: frenchZones,
        translatePrompt: null, translateRaw: null, translateError: 'Ignoré — aucune zone extraite',
        translations: null, translateDurationMs: 0,
      })
    }

    // ── Étape 2 : Traduction dans toutes les langues cibles ─────────────────
    const db = getDb()

    const glossaryRows = db.prepare('SELECT term_source, term_target, language_code FROM glossary').all() as { term_source: string; term_target: string; language_code: string }[]
    const glossaryByLang: Record<string, { source: string; target: string }[]> = {}
    for (const row of glossaryRows) {
      if (!glossaryByLang[row.language_code]) glossaryByLang[row.language_code] = []
      glossaryByLang[row.language_code].push({ source: row.term_source, target: row.term_target })
    }

    const ruleRows = db.prepare('SELECT language_code, rule FROM language_rules').all() as { language_code: string; rule: string }[]
    const rulesByLang: Record<string, string[]> = {}
    for (const row of ruleRows) {
      if (!rulesByLang[row.language_code]) rulesByLang[row.language_code] = []
      rulesByLang[row.language_code].push(row.rule)
    }

    const translateInstruction = getPromptFromDb('prompt_google_translate', DEFAULT_GOOGLE_TRANSLATE)
    const zonesText = Object.entries(frenchZones).map(([zone, zoneData]) => `  "${zone}": "${zoneData.text}"`).join('\n')

    const perLangGuidance = targetLanguages.map((lang) => {
      const langName = LANGUAGE_NAMES[lang] || lang
      const rules = rulesByLang[lang] || []
      const glossary = glossaryByLang[lang] || []
      const ruleLines = rules.map((r) => `  - ${r}`).join('\n')
      const glossaryLines = glossary.map((t) => `  - "${t.source}" → "${t.target}"`).join('\n')
      return `${langName} (${lang}):${ruleLines ? `\n  RULES (mandatory):\n${ruleLines}` : ''}${glossaryLines ? `\n  TERMS (use exactly):\n${glossaryLines}` : ''}`
    }).join('\n\n')

    const translatePrompt = `${translateInstruction}\n\nFrench source zones:\n${zonesText}\n\n${perLangGuidance}\n\nRespond ONLY with valid JSON, no markdown:\n{\n  "<lang_code>": { "<zone_label>": "<translated text>" }\n}`

    const translateClient = client.getGenerativeModel({
      model: translateModel,
      generationConfig: { temperature: 0 },
    })

    let translations: Record<string, Record<string, string>> = {}
    let translateError: string | undefined
    let translateRaw = ''
    let translateDurationMs = 0

    const translateStart = Date.now()
    try {
      const res = await translateClient.generateContent({
        contents: [{ role: 'user', parts: [{ text: translatePrompt }] }],
      })
      translateDurationMs = Date.now() - translateStart
      translateRaw = res.response.text().trim()
      const cleaned = translateRaw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
      translations = JSON.parse(cleaned)
    } catch (e) {
      translateDurationMs = Date.now() - translateStart
      translateError = e instanceof Error ? e.message : 'Traduction échouée'
    }

    return NextResponse.json({
      extractModel, translateModel,
      extractPrompt, extractRaw, extractError, extractDurationMs,
      extractedZones: frenchZones,
      translatePrompt, translateRaw, translateError, translateDurationMs,
      translations,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Test échoué' }, { status: 500 })
  }
}
