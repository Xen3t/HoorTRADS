import type Database from 'better-sqlite3'
import type { ImageGenerator, GenerationTask, GenerationAttempt } from '@/types/generation'
import { buildTranslationPrompt, buildGoogleModePrompt } from '@/lib/gemini/prompt-builder'
import { preValidateTranslations } from '@/lib/gemini/text-extractor'
import type { ExpertTranslations, PreTranslationResult, ExtractedZone } from '@/lib/gemini/text-extractor'
import { processBatch } from '@/lib/gemini/batch-client'
import { getApiKey, GeminiClient } from '@/lib/gemini/gemini-client'
import { uploadJobImages, deleteJobImages } from '@/lib/gemini/files-client'
import type { GeminiFile } from '@/lib/gemini/files-client'
import { createBackupImageGenerator } from '@/lib/image-generator-factory'
import { OpenAiImageClient } from '@/lib/openai/openai-image-client'

// Returns the active verification mode from app config

// NB2 (gemini-3.1-flash-image-preview) limits: 100 RPM, 200K TPM
const REQUESTS_PER_MINUTE = 95
const MAX_CONCURRENCY = 80
// gpt-image-2: ~10 input-images/min max (documented Tier 3 limit)
const REQUESTS_PER_MINUTE_OPENAI = 8
const MAX_CONCURRENCY_OPENAI = 10

// Hard cap on requests per minute — sliding window
class RateLimiter {
  private timestamps: number[] = []

  constructor(private readonly limit: number) {}

  // Number of requests fired in the last 60s — live observed RPM
  get observedRPM(): number {
    const now = Date.now()
    return this.timestamps.filter((t) => now - t < 60_000).length
  }

  async acquire(): Promise<void> {
    const windowMs = 60_000
    const now = Date.now()
    this.timestamps = this.timestamps.filter((t) => now - t < windowMs)
    if (this.timestamps.length < this.limit) {
      this.timestamps.push(Date.now())
      return
    }
    const waitMs = windowMs - (now - this.timestamps[0]) + 100
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    return this.acquire()
  }
}

// Dynamic worker pool — concurrency adjusts after each task based on observed latency.
// Formula: ideal_concurrency = ceil(targetRPM × avg_latency_s / 60)
// onStats is called after each task with live metrics (throttled by caller).
async function runDynamic(
  tasks: GenerationTask[],
  worker: (task: GenerationTask) => Promise<void>,
  rateLimiter: RateLimiter,
  targetRPM: number,
  maxConcurrency: number,
  isCancelled: () => boolean,
  onStats?: (rpm: number, concurrency: number, avgLatencyMs: number) => void
): Promise<void> {
  const queue = [...tasks]
  const latencies: number[] = []
  let active = 0
  let lastStatsSave = 0

  const getConcurrency = (): number => {
    if (latencies.length < 3) return Math.min(5, maxConcurrency)
    const avgMs = latencies.reduce((a, b) => a + b) / latencies.length
    const ideal = Math.ceil(targetRPM * avgMs / 60_000)
    return Math.max(5, Math.min(maxConcurrency, ideal))
  }

  return new Promise<void>((resolve) => {
    const tryDispatch = () => {
      while (queue.length > 0 && active < getConcurrency() && !isCancelled()) {
        const task = queue.shift()!
        active++
        const start = Date.now()
        ;(async () => {
          await rateLimiter.acquire()
          await worker(task)
        })().catch(() => {}).finally(() => {
          latencies.push(Date.now() - start)
          if (latencies.length > 50) latencies.shift()
          active--
          // Report stats at most every 3s to avoid DB spam
          if (onStats) {
            const now = Date.now()
            if (now - lastStatsSave > 3_000) {
              lastStatsSave = now
              const avgMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b) / latencies.length) : 0
              onStats(rateLimiter.observedRPM, getConcurrency(), avgMs)
            }
          }
          if (queue.length === 0 && active === 0) resolve()
          else tryDispatch()
        })
      }
      if (queue.length === 0 && active === 0) resolve()
    }
    tryDispatch()
  })
}

// In-memory tracking of running jobs to prevent duplicate processing
const runningJobs = new Set<string>()


async function processTask(
  db: Database.Database,
  jobId: string,
  task: GenerationTask,
  generator: ImageGenerator,
  customBasePrompt: string | undefined,
  customLangPrompt: string | undefined,
  resolution: string,
  expertTranslations?: ExpertTranslations,
  extractedZones?: Record<string, ExtractedZone>,
  backupGenerator?: ImageGenerator
): Promise<void> {
  db.prepare("UPDATE generation_tasks SET status = 'running', started_at = datetime('now') WHERE id = ?").run(task.id)

  try {
    // Natif pipeline: pre-translated zones by text model → quoted in image prompt with typographic hints.
    // If pre-translation returned empty (rare — would mean both Gemini + OpenAI failed), we fall back
    // to the standard translation prompt as a safety net.
    const preTranslations = expertTranslations?.[task.target_language]
    const usedPreTranslation = preTranslations && Object.keys(preTranslations).length > 0
    const prompt = usedPreTranslation
      ? buildGoogleModePrompt(preTranslations!, task.target_language, customLangPrompt || customBasePrompt, extractedZones)
      : buildTranslationPrompt({
          targetLanguage: task.target_language,
          customPrompt: customLangPrompt,
          basePrompt: customBasePrompt,
        })

    const fallbackWarning = !usedPreTranslation
      ? `[FALLBACK: text extraction returned empty — using standard prompt]\n\n`
      : ''

    // Save prompt to DB for debugging (truncated to 4000 chars to avoid bloating DB)
    const promptToSave = fallbackWarning + prompt
    db.prepare("UPDATE generation_tasks SET prompt_sent = ? WHERE id = ?").run(
      promptToSave.length > 4000 ? promptToSave.slice(0, 4000) + '\n…[truncated]' : promptToSave,
      task.id
    )

    // Accumulate attempts across primary call + retry + backup. Persist on each new attempt
    // so the user can see retries appear LIVE — not only after generateImage finally returns.
    const allAttempts: GenerationAttempt[] = []
    const persistAttempts = () => {
      try {
        db.prepare('UPDATE generation_tasks SET attempts_log = ? WHERE id = ?').run(JSON.stringify(allAttempts), task.id)
      } catch { /* best-effort */ }
    }
    const onAttempt = (a: GenerationAttempt) => {
      allAttempts.push(a)
      persistAttempts()
    }

    // Strategy: 1 Gemini call → 1 retry if it failed → fall back to OpenAI → give up.
    // No artificial 5s wait, no inner fetch-retry loop: the 10-min timeout in gemini-client is
    // generous enough to let slow-but-valid responses through, so a fast retry is only useful
    // when Google's queue genuinely shifts between calls.
    let result = await generator.generateImage(task.source_image_path, task.target_language, prompt, resolution, onAttempt)
    if (!result.success) {
      console.log(`[processTask] ${task.id} Gemini failed (${result.error}), 1 retry...`)
      result = await generator.generateImage(task.source_image_path, task.target_language, prompt, resolution, onAttempt)
      if (result.success) console.log(`[processTask] ${task.id} Gemini retry OK`)
    }

    if (!result.success && backupGenerator) {
      console.log(`[processTask] ${task.id} Gemini exhausted — falling back to OpenAI`)
      result = await backupGenerator.generateImage(task.source_image_path, task.target_language, prompt, resolution, onAttempt)
      if (result.success) console.log(`[processTask] ${task.id} OpenAI backup OK`)
    }

    if (result.success) {
      db.prepare(
        "UPDATE generation_tasks SET status = 'done', output_path = ? WHERE id = ?"
      ).run(result.outputPath, task.id)
      db.prepare(
        "UPDATE generation_jobs SET completed_tasks = completed_tasks + 1, updated_at = datetime('now') WHERE id = ?"
      ).run(jobId)
    } else {
      db.prepare(
        "UPDATE generation_tasks SET status = 'failed', error_message = ? WHERE id = ?"
      ).run(result.error || 'Unknown error', task.id)
      db.prepare(
        "UPDATE generation_jobs SET failed_tasks = failed_tasks + 1, updated_at = datetime('now') WHERE id = ?"
      ).run(jobId)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Task processing failed'
    db.prepare(
      "UPDATE generation_tasks SET status = 'failed', error_message = ? WHERE id = ?"
    ).run(message, task.id)
    db.prepare(
      "UPDATE generation_jobs SET failed_tasks = failed_tasks + 1, updated_at = datetime('now') WHERE id = ?"
    ).run(jobId)
  }
}

/**
 * renderJobTasks — second half of the pre_render pipeline.
 * Called after the user approves (and optionally edits) the text translations.
 * `approvedTranslations` overrides the preTranslationLog translations if provided.
 */
export async function renderJobTasks(
  db: Database.Database,
  jobId: string,
  generator: ImageGenerator,
  approvedTranslations?: ExpertTranslations
): Promise<void> {
  if (runningJobs.has(jobId)) return
  runningJobs.add(jobId)

  try {
    // Reset counters — pre_render inflated completed_tasks to total_tasks to signal "phase 1 done",
    // but NB2 generation needs to start at 0
    db.prepare("UPDATE generation_jobs SET status = 'running', completed_tasks = 0, failed_tasks = 0, updated_at = datetime('now') WHERE id = ?").run(jobId)

    const jobRow = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
    const jobConfig = jobRow?.config ? JSON.parse(jobRow.config) : {}
    const countryOrder: string[] = (jobConfig.countries || []).filter((c: string) => c !== 'FR')
    const generationMode: string = jobConfig.mode || 'standard'
    const resolution: string = jobConfig.resolution || '1K'
    const customPromptsByLang: Record<string, string> = jobConfig.customPrompts || {}

    const rawTasks = db.prepare(
      "SELECT * FROM generation_tasks WHERE job_id = ? AND status = 'pending'"
    ).all(jobId) as GenerationTask[]

    const tasks = rawTasks.sort((a, b) => {
      const aIdx = countryOrder.indexOf(a.country_code)
      const bIdx = countryOrder.indexOf(b.country_code)
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
    })

    // Doc config is applied at translation time (per language), not injected raw into NB2 prompts
    const customBasePrompt: string | undefined = undefined

    // Use approved translations (user-edited) or fall back to the ones from preTranslationLog
    const translations: ExpertTranslations = approvedTranslations || jobConfig.preTranslationLog?.translations || {}
    const extractedZones: Record<string, ExtractedZone> = jobConfig.preTranslationLog?.extractedZones || {}
    const imagePreTranslations = new Map<string, ExpertTranslations>()
    for (const task of tasks) {
      imagePreTranslations.set(task.source_image_path, translations)
    }

    if (generationMode === 'batch') {
      const apiKey = getApiKey()
      const batchTasks = tasks.map((task) => {
        const preTranslations = imagePreTranslations.get(task.source_image_path)
        const langTranslations = preTranslations?.[task.target_language]
        const customLangPrompt = customPromptsByLang[task.target_language] || undefined
        const usedPreTranslation = langTranslations && Object.keys(langTranslations).length > 0
        const prompt = usedPreTranslation
          ? buildGoogleModePrompt(langTranslations!, task.target_language, customLangPrompt || customBasePrompt, extractedZones)
          : buildTranslationPrompt({ targetLanguage: task.target_language, customPrompt: customLangPrompt, basePrompt: customBasePrompt })
        const promptToSave = prompt
        db.prepare("UPDATE generation_tasks SET prompt_sent = ? WHERE id = ?").run(
          promptToSave.length > 4000 ? promptToSave.slice(0, 4000) + '\n…[truncated]' : promptToSave,
          task.id
        )
        return { id: task.id, sourceImagePath: task.source_image_path, targetLanguage: task.target_language, prompt }
      })
      for (const t of tasks) {
        db.prepare("UPDATE generation_tasks SET status = 'running', started_at = datetime('now') WHERE id = ?").run(t.id)
      }
      const sessionName = db.prepare('SELECT s.name FROM sessions s JOIN generation_jobs j ON j.session_id = s.id WHERE j.id = ?').get(jobId) as { name: string } | undefined
      const displayName = `hoortrad-${sessionName?.name || jobId}`
      const results = await processBatch(batchTasks, apiKey, resolution, displayName, () => {
        db.prepare("UPDATE generation_jobs SET updated_at = datetime('now') WHERE id = ?").run(jobId)
      })
      for (const r of results) {
        const task = tasks.find((t) => t.id === r.taskId)
        if (!task) continue
        if (r.success && r.outputPath) {
          db.prepare("UPDATE generation_tasks SET status = 'done', output_path = ? WHERE id = ?").run(r.outputPath, task.id)
          db.prepare("UPDATE generation_jobs SET completed_tasks = completed_tasks + 1, updated_at = datetime('now') WHERE id = ?").run(jobId)
        } else {
          db.prepare("UPDATE generation_tasks SET status = 'failed', error_message = ? WHERE id = ?").run(r.error || 'Batch failed', task.id)
          db.prepare("UPDATE generation_jobs SET failed_tasks = failed_tasks + 1, updated_at = datetime('now') WHERE id = ?").run(jobId)
        }
      }
    } else {
      const backupGenerator = createBackupImageGenerator()
      const isOpenAI = generator instanceof OpenAiImageClient
      const rateLimiter = new RateLimiter(isOpenAI ? REQUESTS_PER_MINUTE_OPENAI : REQUESTS_PER_MINUTE)
      const maxConcurrency = isOpenAI ? MAX_CONCURRENCY_OPENAI : MAX_CONCURRENCY

      // Pre-upload source images to Gemini Files API — avoids re-encoding base64 for each request
      let uploadedFiles: GeminiFile[] = []
      if (generator instanceof GeminiClient) {
        const apiKey = getApiKey()
        const fileMap = await uploadJobImages(tasks.map((t) => t.source_image_path), apiKey)
        uploadedFiles = [...fileMap.values()]
        for (const [filePath, file] of fileMap) (generator as GeminiClient).setFileUri(filePath, file.uri)
      }

      try {
        await runDynamic(
          tasks,
          (task) => {
            const expertTranslations = imagePreTranslations.get(task.source_image_path)
            const customLangPrompt = customPromptsByLang[task.target_language] || undefined
            return processTask(db, jobId, task, generator, customBasePrompt, customLangPrompt, resolution, expertTranslations, extractedZones, backupGenerator ?? undefined)
          },
          rateLimiter,
          isOpenAI ? REQUESTS_PER_MINUTE_OPENAI : REQUESTS_PER_MINUTE,
          maxConcurrency,
          () => (db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(jobId) as { status: string } | undefined)?.status === 'cancelled',
        (rpm, concurrency, avgLatencyMs) => {
          try {
            const jr = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
            const jc = jr?.config ? JSON.parse(jr.config) : {}
            jc.runtimeStats = { observedRPM: rpm, concurrency, avgLatencyMs }
            db.prepare("UPDATE generation_jobs SET config = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(jc), jobId)
          } catch { /* best-effort */ }
        }
        )
      } finally {
        if (uploadedFiles.length > 0) deleteJobImages(uploadedFiles, getApiKey()).catch(() => {})
      }
    }

    const finalStatus = db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(jobId) as { status: string } | undefined
    if (finalStatus?.status === 'cancelled') return

    db.prepare("UPDATE generation_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(jobId)
    const jobMeta = db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined
    if (jobMeta) {
      db.prepare("UPDATE sessions SET status = 'done', current_step = 'review', updated_at = datetime('now') WHERE id = ?").run(jobMeta.session_id)
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[renderJobTasks] CRASH:', errMsg)
    try {
      const jr = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
      const jc = jr?.config ? JSON.parse(jr.config) : {}
      jc.renderError = errMsg
      db.prepare("UPDATE generation_jobs SET status = 'failed', config = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(jc), jobId)
      db.prepare("UPDATE generation_tasks SET status = 'failed', error_message = ? WHERE job_id = ? AND status = 'pending'").run(`[render] ${errMsg}`, jobId)
    } catch {}
  } finally {
    runningJobs.delete(jobId)
  }
}

export async function processJob(
  db: Database.Database,
  jobId: string,
  generator: ImageGenerator
): Promise<void> {
  if (runningJobs.has(jobId)) return
  runningJobs.add(jobId)

  try {
    db.prepare("UPDATE generation_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(jobId)

    const jobRow = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
    const jobConfig = jobRow?.config ? JSON.parse(jobRow.config) : {}
    const countryOrder: string[] = (jobConfig.countries || []).filter((c: string) => c !== 'FR')

    const generationMode: string = jobConfig.mode || 'standard'   // 'standard' | 'batch'
    const resolution: string = jobConfig.resolution || '1K'
    const customPromptsByLang: Record<string, string> = jobConfig.customPrompts || {}



    const rawTasks = db.prepare(
      "SELECT * FROM generation_tasks WHERE job_id = ? AND status = 'pending'"
    ).all(jobId) as GenerationTask[]

    const tasks = rawTasks.sort((a, b) => {
      const aIdx = countryOrder.indexOf(a.country_code)
      const bIdx = countryOrder.indexOf(b.country_code)
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
    })

    const ruleRows = db.prepare(
      'SELECT language_code, rule FROM language_rules'
    ).all() as { language_code: string; rule: string }[]

    const rulesByLang: Record<string, string[]> = {}
    for (const row of ruleRows) {
      if (!rulesByLang[row.language_code]) rulesByLang[row.language_code] = []
      rulesByLang[row.language_code].push(row.rule)
    }

    const configFileContent2: string = jobConfig.configFileContent || ''
    // The config doc is now injected intelligently per language at the translation step (preValidateTranslations).
    // NB2 generation receives only the base prompt — no raw doc dump, since the translated text already carries the right info.
    const customBasePrompt: string | undefined = undefined

    // ── Natif mode: pre-translate zones with text model ──────────────────
    const imagePreTranslations = new Map<string, ExpertTranslations>()
    const imageExtractedZones = new Map<string, Record<string, ExtractedZone>>()

    {
      // Natif pipeline (single supported mode):
      // All images in a job belong to the same French campaign — same content, different formats.
      // Extract text from ONE representative (prefer 1080x1080, fallback to first task),
      // translate to ALL target languages in one call, then share the result across every task.
      const targetLanguages = [...new Set(tasks.map((t) => t.target_language))]
      const representative = tasks.find((t) => t.source_image_name.includes('1080x1080')) || tasks[0]

      let preResult: PreTranslationResult = { translations: {}, extractedZones: {} }
      try {
        console.log('[processJob] starting preValidateTranslations with 3min timeout...')
        const timeoutStart = Date.now()
        const timeout = new Promise<PreTranslationResult>((resolve) =>
          setTimeout(() => {
            console.log('[processJob] ⏱ TIMEOUT 3min FIRED after', Math.round((Date.now() - timeoutStart) / 1000), 's')
            resolve({ translations: {}, extractedZones: {}, error: 'timeout 3min' })
          }, 180_000)
        )
        // Progress callback — persist intermediate state + per-phase timestamps for the synthesis report
        const onProgress = (phase: string, data: Partial<PreTranslationResult>) => {
          try {
            const jr = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
            const jc = jr?.config ? JSON.parse(jr.config) : {}
            const prevTimings = (jc.preTranslationLog?.timings || {}) as Record<string, string>
            const now = new Date().toISOString()
            const newTimings = { ...prevTimings, [phase + '_at']: prevTimings[phase + '_at'] || now }
            jc.preTranslationLog = {
              representativeImage: representative.source_image_name,
              ...(jc.preTranslationLog || {}),
              ...data,
              phase,
              timings: newTimings,
            }
            db.prepare('UPDATE generation_jobs SET config = ?, updated_at = datetime(\'now\') WHERE id = ?').run(JSON.stringify(jc), jobId)
          } catch { /* best-effort */ }
        }
        preResult = await Promise.race([
          preValidateTranslations(representative.source_image_path, targetLanguages, {}, {}, undefined, configFileContent2, onProgress),
          timeout,
        ])
        console.log('[processJob] preValidateTranslations resolved in', Math.round((Date.now() - timeoutStart) / 1000), 's | error:', preResult.error || 'none')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[processJob] preValidateTranslations THREW:', msg)
      }

      // Save extracted zones + translations to job config for display in logs
      const jobRow2 = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
      const jobCfg2 = jobRow2?.config ? JSON.parse(jobRow2.config) : {}
      jobCfg2.preTranslationLog = {
        representativeImage: representative.source_image_name,
        extractedZones: preResult.extractedZones,
        translations: preResult.translations,
        ...(preResult.error ? { error: preResult.error } : {}),
        ...(preResult.provider ? { provider: preResult.provider } : {}),
        ...(preResult.configDocHints && Object.keys(preResult.configDocHints).length > 0 ? { configDocHints: preResult.configDocHints } : {}),
        ...(preResult.docFilterError ? { docFilterError: preResult.docFilterError } : {}),
        ...(preResult.configDocInjected ? { configDocInjected: true } : {}),
        ...(preResult.extractionPrompt ? { extractionPrompt: preResult.extractionPrompt.slice(0, 4000) } : {}),
        ...(preResult.translationPrompt ? { translationPrompt: preResult.translationPrompt.slice(0, 6000) } : {}),
      }
      db.prepare('UPDATE generation_jobs SET config = ? WHERE id = ?').run(JSON.stringify(jobCfg2), jobId)

      // Always pause for text review — single supported pipeline ("Avant la génération").
      // The user can edit translations on the text-review page, then approve to fire NB2.
      db.prepare("UPDATE generation_jobs SET status = 'pending_text_review', updated_at = datetime('now') WHERE id = ?").run(jobId)
      const jmPre = db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined
      if (jmPre) db.prepare("UPDATE sessions SET current_step = 'text-review', updated_at = datetime('now') WHERE id = ?").run(jmPre.session_id)
      runningJobs.delete(jobId)
      return
    }

    // ── BATCH MODE — submit all tasks to Gemini Batch API ─────────────────
    if (generationMode === 'batch') {
      const apiKey = getApiKey()

      // Build prompt for every task (Natif pipeline: pre-translated zones → quoted in image prompt)
      const batchTasks = tasks.map((task) => {
        const preTranslations = imagePreTranslations.get(task.source_image_path)
        const langTranslations = preTranslations?.[task.target_language]
        const customLangPrompt = customPromptsByLang[task.target_language] || undefined

        const usedPreTranslation = langTranslations && Object.keys(langTranslations).length > 0
        const taskExtractedZones = imageExtractedZones.get(task.source_image_path)
        const prompt = usedPreTranslation
          ? buildGoogleModePrompt(langTranslations!, task.target_language, customLangPrompt || customBasePrompt, taskExtractedZones)
          : buildTranslationPrompt({
              targetLanguage: task.target_language,
              customPrompt: customLangPrompt,
              basePrompt: customBasePrompt,
            })

        const fallbackWarning = !usedPreTranslation
          ? `[FALLBACK: text extraction returned empty — using standard prompt]\n\n`
          : ''

        // Save prompt to DB
        const promptToSave = fallbackWarning + prompt
        db.prepare("UPDATE generation_tasks SET prompt_sent = ? WHERE id = ?").run(
          promptToSave.length > 4000 ? promptToSave.slice(0, 4000) + '\n…[truncated]' : promptToSave,
          task.id
        )

        return { id: task.id, sourceImagePath: task.source_image_path, targetLanguage: task.target_language, prompt }
      })

      // Mark all tasks as running
      for (const t of tasks) {
        db.prepare("UPDATE generation_tasks SET status = 'running', started_at = datetime('now') WHERE id = ?").run(t.id)
      }

      const sessionName = db.prepare('SELECT s.name FROM sessions s JOIN generation_jobs j ON j.session_id = s.id WHERE j.id = ?').get(jobId) as { name: string } | undefined
      const displayName = `hoortrad-${sessionName?.name || jobId}`

      const results = await processBatch(batchTasks, apiKey, resolution, displayName, (state) => {
        // Update job updated_at to keep it alive in status polls
        db.prepare("UPDATE generation_jobs SET updated_at = datetime('now') WHERE id = ?").run(jobId)
        // Store batch state in job config for visibility
        const jr = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
        const jc = jr?.config ? JSON.parse(jr.config) : {}
        jc.batchState = state
        db.prepare("UPDATE generation_jobs SET config = ? WHERE id = ?").run(JSON.stringify(jc), jobId)
      })

      for (const r of results) {
        const taskId = tasks.find((t) => t.id === r.taskId)?.id
        if (!taskId) continue

        if (r.success && r.outputPath) {
          db.prepare("UPDATE generation_tasks SET status = 'done', output_path = ? WHERE id = ?").run(r.outputPath, taskId)
          db.prepare("UPDATE generation_jobs SET completed_tasks = completed_tasks + 1, updated_at = datetime('now') WHERE id = ?").run(jobId)
        } else {
          db.prepare("UPDATE generation_tasks SET status = 'failed', error_message = ? WHERE id = ?").run(r.error || 'Batch failed', taskId)
          db.prepare("UPDATE generation_jobs SET failed_tasks = failed_tasks + 1, updated_at = datetime('now') WHERE id = ?").run(jobId)
        }
      }

      // Skip standard processing below
      const batchFinalStatus = db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(jobId) as { status: string } | undefined
      if (batchFinalStatus?.status !== 'cancelled') {
        db.prepare("UPDATE generation_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(jobId)
        const jmSessionId = (db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined)?.session_id
        if (jmSessionId) db.prepare("UPDATE sessions SET status = 'done', current_step = 'review', updated_at = datetime('now') WHERE id = ?").run(jmSessionId)
      }
      return
    }

    // ── STANDARD MODE — dynamic worker pool ───────────────────────────────
    const backupGenerator = createBackupImageGenerator()
    const isOpenAI = generator instanceof OpenAiImageClient
    const rateLimiter = new RateLimiter(isOpenAI ? REQUESTS_PER_MINUTE_OPENAI : REQUESTS_PER_MINUTE)
    const maxConcurrency = isOpenAI ? MAX_CONCURRENCY_OPENAI : MAX_CONCURRENCY

    // Pre-upload source images to Gemini Files API — avoids re-encoding base64 for each request
    let uploadedFiles: GeminiFile[] = []
    if (generator instanceof GeminiClient) {
      const apiKey = getApiKey()
      const fileMap = await uploadJobImages(tasks.map((t) => t.source_image_path), apiKey)
      uploadedFiles = [...fileMap.values()]
      for (const [filePath, file] of fileMap) (generator as GeminiClient).setFileUri(filePath, file.uri)
    }

    try {
      await runDynamic(
        tasks,
        (task) => {
          const expertTranslations = imagePreTranslations.get(task.source_image_path)
          const taskExtractedZones = imageExtractedZones.get(task.source_image_path)
          const customLangPrompt = customPromptsByLang[task.target_language] || undefined
          return processTask(db, jobId, task, generator, customBasePrompt, customLangPrompt, resolution, expertTranslations, taskExtractedZones, backupGenerator ?? undefined)
        },
        rateLimiter,
        isOpenAI ? REQUESTS_PER_MINUTE_OPENAI : REQUESTS_PER_MINUTE,
        maxConcurrency,
        () => (db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(jobId) as { status: string } | undefined)?.status === 'cancelled'
      )
    } finally {
      if (uploadedFiles.length > 0) deleteJobImages(uploadedFiles, getApiKey()).catch(() => {})
    }

    // Check if cancelled
    const finalStatus = db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(jobId) as { status: string } | undefined
    if (finalStatus?.status === 'cancelled') return

    // Record when image generation completed
    try {
      const jr3Config = (db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config?: string } | undefined)?.config ?? ''
      if (jr3Config) {
        const jc3 = JSON.parse(jr3Config)
        if (jc3.preTranslationLog) {
          jc3.preTranslationLog.timings = {
            ...(jc3.preTranslationLog.timings || {}),
            image_generation_done_at: new Date().toISOString(),
          }
          db.prepare('UPDATE generation_jobs SET config = ? WHERE id = ?').run(JSON.stringify(jc3), jobId)
        }
      }
    } catch { /* best-effort */ }

    db.prepare("UPDATE generation_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(jobId)

    const jobMetaSessionId = (db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined)?.session_id
    if (jobMetaSessionId) {
      db.prepare("UPDATE sessions SET status = 'done', current_step = 'review', updated_at = datetime('now') WHERE id = ?").run(jobMetaSessionId)
    }
  } catch (err: unknown) {
    // Unhandled error in job processor — write to job config so it's visible in admin logs
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[processJob] CRASH:', errMsg)
    try {
      const jr = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
      const jc = jr?.config ? JSON.parse(jr.config) : {}
      jc.processorError = errMsg
      db.prepare("UPDATE generation_jobs SET status = 'failed', config = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(jc), jobId)
      db.prepare("UPDATE generation_tasks SET status = 'failed', error_message = ? WHERE job_id = ? AND status = 'pending'").run(`[processor] ${errMsg}`, jobId)
    } catch {}
  } finally {
    runningJobs.delete(jobId)
  }
}
