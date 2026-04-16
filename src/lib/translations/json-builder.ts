import type Database from 'better-sqlite3'
import type { GenerationTask } from '@/types/generation'

// Ad formats in priority order for reference selection
const AD_FORMAT_PRIORITY = ['1080x1080', '1080x1920', '1920x1080', '1080x1350']

interface TranslationJSON {
  [countryCode: string]: {
    [key: string]: string
  }
}

function isAdFormat(filename: string): boolean {
  return AD_FORMAT_PRIORITY.some((f) => filename.includes(f))
}

export function buildTranslationsJSON(
  db: Database.Database,
  jobId: string,
  includeNonAd = false
): TranslationJSON {
  const tasks = db.prepare(
    "SELECT * FROM generation_tasks WHERE job_id = ? AND status = 'done' ORDER BY country_code, source_image_name"
  ).all(jobId) as GenerationTask[]

  const json: TranslationJSON = {}

  // Group tasks by country
  const byCountry: Record<string, GenerationTask[]> = {}
  for (const task of tasks) {
    if (!byCountry[task.country_code]) byCountry[task.country_code] = []
    byCountry[task.country_code].push(task)
  }

  for (const [country, countryTasks] of Object.entries(byCountry)) {
    // Filter to ad formats only (unless includeNonAd)
    const eligibleTasks = includeNonAd
      ? countryTasks
      : countryTasks.filter((t) => isAdFormat(t.source_image_name))

    if (eligibleTasks.length === 0) continue

    // In mock mode: generate simulated translation entries
    // In real mode: pick reference task (eligibleTasks[0]) and call Gemini Flash text
    json[country] = generateMockTranslations(country)
  }

  return json
}

function generateMockTranslations(
  countryCode: string
): Record<string, string> {
  // Mock translations — in real mode, Gemini Flash text would extract these from the image
  const mockData: Record<string, Record<string, string>> = {
    DE: { date: 'Vom 04.11. bis 01.12.', code: 'Code BF100', delivery: 'Kostenloser Versand' },
    ES: { date: 'Del 04/11 al 01/12', code: 'codigo BF100', delivery: 'Envio gratuito' },
    IT: { date: 'Dal 04/11 al 01/12', code: 'codice BF100', delivery: 'Spedizione gratuita' },
    GB: { date: 'From 04/11 to 01/12', code: 'code BF100', delivery: 'Free delivery' },
    NL: { date: 'Van 04/11 tot 01/12', code: 'code BF100', delivery: 'Gratis levering' },
    PT: { date: 'De 04/11 a 01/12', code: 'codigo BF100', delivery: 'Entrega gratuita' },
    BE: { date: 'Van 04/11 tot 01/12', code: 'code BF100', delivery: 'Gratis levering' },
  }

  return mockData[countryCode] || {
    date: `[${countryCode}] Translated date`,
    code: `[${countryCode}] code BF100`,
    delivery: `[${countryCode}] Free delivery`,
  }
}

export function getTranslationsJSON(db: Database.Database, jobId: string): TranslationJSON | null {
  // Check if we have a cached version
  const job = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
  if (!job) return null

  const config = JSON.parse(job.config || '{}')
  const includeNonAd = config.includeNonAdJson || false

  return buildTranslationsJSON(db, jobId, includeNonAd)
}
