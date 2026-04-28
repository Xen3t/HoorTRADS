import type Database from 'better-sqlite3'
import type { ImageGenerator, GenerationTask } from '@/types/generation'
import { buildTranslationPrompt, buildGoogleModePrompt } from '@/lib/gemini/prompt-builder'
import { preValidateTranslations } from '@/lib/gemini/text-extractor'
import type { ExpertTranslations, PreTranslationResult, ExtractedZone } from '@/lib/gemini/text-extractor'
import { processBatch } from '@/lib/gemini/batch-client'
import { getApiKey } from '@/lib/gemini/gemini-client'

// Returns the active verification mode from app config

// NB2 (gemini-3.1-flash-image-preview) limits: 100 RPM, 200K TPM
const CONCURRENCY_STANDARD = 20
const REQUESTS_PER_MINUTE = 95

// Sliding window rate limiter — ensures we never exceed REQUESTS_PER_MINUTE
class RateLimiter {
  private timestamps: number[] = []

  async acquire(): Promise<void> {
    const windowMs = 60_000
    const now = Date.now()
    // Remove expired timestamps
    this.timestamps = this.timestamps.filter((t) => now - t < windowMs)
    if (this.timestamps.length < REQUESTS_PER_MINUTE) {
      this.timestamps.push(Date.now())
      return
    }
    // Wait until the oldest request expires + small buffer
    const waitMs = windowMs - (now - this.timestamps[0]) + 100
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    // Retry after wait
    return this.acquire()
  }
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
  extractedZones?: Record<string, ExtractedZone>
): Promise<void> {
  db.prepare("UPDATE generation_tasks SET status = 'running' WHERE id = ?").run(task.id)

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

    // Try generation — on failure, auto-retry once after a short delay
    let result = await generator.generateImage(task.source_image_path, task.target_language, prompt, resolution)
    if (!result.success) {
      console.log(`[processTask] ${task.id} failed (${result.error}), auto-retry in 5s...`)
      await new Promise((r) => setTimeout(r, 5000))
      result = await generator.generateImage(task.source_image_path, task.target_language, prompt, resolution)
      if (result.success) console.log(`[processTask] ${task.id} retry OK`)
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
        db.prepare("UPDATE generation_tasks SET status = 'running' WHERE id = ?").run(t.id)
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
      const rateLimiter = new RateLimiter()
      for (let i = 0; i < tasks.length; i += CONCURRENCY_STANDARD) {
        const jobStatus = db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(jobId) as { status: string } | undefined
        if (jobStatus?.status === 'cancelled') break
        const batch = tasks.slice(i, i + CONCURRENCY_STANDARD)
        await Promise.allSettled(
          batch.map(async (task) => {
            await rateLimiter.acquire()
            const expertTranslations = imagePreTranslations.get(task.source_image_path)
            const customLangPrompt = customPromptsByLang[task.target_language] || undefined
            return processTask(db, jobId, task, generator, customBasePrompt, customLangPrompt, resolution, expertTranslations, extractedZones)
          })
        )
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

    const CONCURRENCY = CONCURRENCY_STANDARD

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
        db.prepare("UPDATE generation_tasks SET status = 'running' WHERE id = ?").run(t.id)
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
        const jm = db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined
        if (jm) db.prepare("UPDATE sessions SET status = 'done', current_step = 'review', updated_at = datetime('now') WHERE id = ?").run(jm.session_id)
      }
      return
    }

    // ── STANDARD MODE — process in parallel batches ────────────────────────
    const rateLimiter = new RateLimiter()

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const jobStatus = db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(jobId) as { status: string } | undefined
      if (jobStatus?.status === 'cancelled') break

      const batch = tasks.slice(i, i + CONCURRENCY)
      await Promise.allSettled(
        batch.map(async (task) => {
          await rateLimiter.acquire()
          const expertTranslations = imagePreTranslations.get(task.source_image_path)
          const taskExtractedZones = imageExtractedZones.get(task.source_image_path)
          const customLangPrompt = customPromptsByLang[task.target_language] || undefined
          return processTask(
            db, jobId, task, generator,
            customBasePrompt, customLangPrompt,
            resolution, expertTranslations, taskExtractedZones
          )
        })
      )
    }

    // Check if cancelled
    const finalStatus = db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(jobId) as { status: string } | undefined
    if (finalStatus?.status === 'cancelled') return

    // Record when image generation completed
    try {
      const jr3 = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
      if (jr3!.config) {
        const jc3 = JSON.parse(jr3!.config)
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

    const jobMeta = db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined
    if (jobMeta) {
      db.prepare("UPDATE sessions SET status = 'done', current_step = 'review', updated_at = datetime('now') WHERE id = ?").run(jobMeta.session_id)
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
