import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getAppConfig } from '@/lib/db/queries'
import { getModel } from '@/lib/gemini/gemini-client'

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French', nl: 'Dutch', de: 'German', cs: 'Czech', da: 'Danish',
  es: 'Spanish', fi: 'Finnish', en: 'English', el: 'Greek', hr: 'Croatian',
  hu: 'Hungarian', it: 'Italian', lt: 'Lithuanian', lv: 'Latvian',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', sv: 'Swedish',
  sl: 'Slovenian', sk: 'Slovak',
}

function getApiKey(db: ReturnType<typeof getDb>): string {
  let key: string | null = null
  try { key = getAppConfig(db, 'gemini_api_key') } catch {}
  if (!key) key = process.env.GEMINI_API_KEY ?? null
  if (!key) throw new Error('Gemini API key not configured')
  return key
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const body = await request.json()
    const { targetLanguage, comment } = body as { targetLanguage: string; comment: string }

    if (!targetLanguage) return NextResponse.json({ error: 'targetLanguage is required' }, { status: 400 })

    const db = getDb()
    const jobRow = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
    if (!jobRow) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const jobConfig = jobRow.config ? JSON.parse(jobRow.config) : {}
    const log = jobConfig.preTranslationLog
    const rawZones = log?.extractedZones || {}
    const frenchZones: Record<string, string> = Object.fromEntries(
      Object.entries(rawZones).map(([k, v]) => [k, typeof v === 'string' ? v : (v as { text: string }).text])
    )
    const currentTranslations: Record<string, string> = (jobConfig.approvedTranslations || log?.translations || {})[targetLanguage] || {}

    if (Object.keys(frenchZones).length === 0) {
      return NextResponse.json({ error: 'No extracted zones found' }, { status: 400 })
    }

    const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage
    const sourceLines = Object.entries(frenchZones).map(([k, v]) => `  "${k}": "${v}"`).join('\n')
    const currentLines = Object.entries(currentTranslations).map(([k, v]) => `  "${k}": "${v}"`).join('\n')

    const prompt = `You are a native marketing copywriter for ${langName}.

French source zones:
${sourceLines}

Current ${langName} translation:
${currentLines}

User feedback: ${comment || 'Please improve the translation.'}

Please re-translate the French source zones into ${langName} taking the user feedback into account.
Keep the same zone labels. Preserve typographic case (ALL CAPS stays ALL CAPS).

Respond ONLY with valid JSON, no markdown:
{ "<zone_label>": "<translated text>" }`

    const client = new GoogleGenerativeAI(getApiKey(db))
    const model = client.getGenerativeModel({
      model: getModel('model_translate'),
      generationConfig: { temperature: 0.3 },
    })

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    })
    const raw = response.response.text().trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    const newTranslations: Record<string, string> = JSON.parse(raw)

    // Persist the new translations for this language into approvedTranslations
    const approved = jobConfig.approvedTranslations || { ...(log?.translations || {}) }
    approved[targetLanguage] = newTranslations
    jobConfig.approvedTranslations = approved
    db.prepare('UPDATE generation_jobs SET config = ? WHERE id = ?').run(JSON.stringify(jobConfig), jobId)

    return NextResponse.json({ translations: newTranslations })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Retranslation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
