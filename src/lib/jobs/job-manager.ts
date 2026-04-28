import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { resolveLanguages } from '@/lib/countries/country-resolver'
import type { GenerationJob } from '@/types/generation'
import { getAppConfig } from '@/lib/db/queries'

function snapshotPipelineModels(db: Database.Database): Record<string, string> {
  const read = (key: string) => { try { return getAppConfig(db, key) || '' } catch { return '' } }
  return {
    primary_extract: read('primary_model_extract') || read('model_extract'),
    primary_doc_filter: read('primary_model_doc_filter') || read('primary_model_extract') || read('model_extract'),
    primary_translate: read('primary_model_translate') || read('model_translate'),
    primary_generate: read('primary_model_generate') || read('model_generate'),
    backup_extract: read('backup_model_extract'),
    backup_doc_filter: read('backup_model_doc_filter') || read('backup_model_extract'),
    backup_translate: read('backup_model_translate'),
    backup_generate: read('backup_model_generate'),
  }
}

interface CreateJobInput {
  sessionId: string
  sourceImages: { path: string; name: string }[]
  countryCodes: string[]
  config: Record<string, unknown>
}

export function createGenerationJob(db: Database.Database, input: CreateJobInput): GenerationJob {
  const { sessionId, sourceImages, countryCodes, config } = input
  const jobId = randomUUID()
  const now = new Date().toISOString()

  const resolvedLangs = resolveLanguages(countryCodes)

  // Exclude source language (French) — no need to translate to the same language
  const SOURCE_LANGUAGE = 'fr'

  // Create tasks: each source image × each unique language (excluding source)
  // One task per language — the export will handle copying to each country that shares that language
  const tasks: { id: string; sourcePath: string; sourceName: string; lang: string; country: string }[] = []

  for (const image of sourceImages) {
    for (const lang of resolvedLangs) {
      // Skip the source language — images are already in French
      if (lang.code === SOURCE_LANGUAGE) continue

      // Use the first country as the representative country for this language task
      // All countries sharing this language will get a copy at export time
      const representativeCountry = lang.sourceCountries[0]
      tasks.push({
        id: randomUUID(),
        sourcePath: image.path,
        sourceName: image.name,
        lang: lang.code,
        country: representativeCountry,
      })
    }
  }

  // Build language→countries mapping for export use
  const langToCountries: Record<string, string[]> = {}
  for (const lang of resolvedLangs) {
    if (lang.code !== SOURCE_LANGUAGE) {
      langToCountries[lang.code] = lang.sourceCountries
    }
  }

  // Insert job
  const jobConfig = { ...config, langToCountries, pipelineSnapshot: snapshotPipelineModels(db) }
  db.prepare(`
    INSERT INTO generation_jobs (id, session_id, status, total_tasks, completed_tasks, failed_tasks, config, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, 0, 0, ?, ?, ?)
  `).run(jobId, sessionId, tasks.length, JSON.stringify(jobConfig), now, now)

  // Insert tasks
  const insertTask = db.prepare(`
    INSERT INTO generation_tasks (id, job_id, source_image_path, source_image_name, target_language, country_code, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `)

  const insertMany = db.transaction(() => {
    for (const task of tasks) {
      insertTask.run(task.id, jobId, task.sourcePath, task.sourceName, task.lang, task.country, now)
    }
  })
  insertMany()

  return db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId) as GenerationJob
}

export function getJobProgress(db: Database.Database, jobId: string) {
  const job = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId) as GenerationJob | undefined
  if (!job) return null

  const completedCountries = db.prepare(`
    SELECT DISTINCT country_code FROM generation_tasks
    WHERE job_id = ? AND status = 'done'
    AND country_code NOT IN (
      SELECT DISTINCT country_code FROM generation_tasks
      WHERE job_id = ? AND status IN ('pending', 'running')
    )
  `).all(jobId, jobId) as { country_code: string }[]

  const pendingCountries = db.prepare(`
    SELECT DISTINCT country_code FROM generation_tasks
    WHERE job_id = ? AND status IN ('pending', 'running')
  `).all(jobId) as { country_code: string }[]

  const jobConfig = job.config ? JSON.parse(job.config) : {}

  return {
    jobId: job.id,
    status: job.status,
    totalTasks: job.total_tasks,
    completedTasks: job.completed_tasks,
    failedTasks: job.failed_tasks,
    completedCountries: completedCountries.map((c) => c.country_code),
    pendingCountries: pendingCountries.map((c) => c.country_code),
    langToCountries: jobConfig.langToCountries || {},
  }
}

export function getJobBySessionId(db: Database.Database, sessionId: string): GenerationJob | null {
  return (db.prepare('SELECT * FROM generation_jobs WHERE session_id = ? ORDER BY rowid DESC LIMIT 1').get(sessionId) as GenerationJob) || null
}
