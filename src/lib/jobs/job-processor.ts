import type Database from 'better-sqlite3'
import type { ImageGenerator, GenerationTask } from '@/types/generation'
import { buildTranslationPrompt, buildGoogleModePrompt } from '@/lib/gemini/prompt-builder'
import { filterGlossaryForImage, preValidateTranslations } from '@/lib/gemini/text-extractor'
import type { GlossaryHints, ExpertTranslations, PreTranslationResult, ExtractedZone } from '@/lib/gemini/text-extractor'
import { getAppConfig } from '@/lib/db/queries'
import { processBatch } from '@/lib/gemini/batch-client'
import { getApiKey } from '@/lib/gemini/gemini-client'

// Returns the active verification mode from app config
function getVerificationMode(db: Database.Database): 'pre_render' | 'post_render' {
  try {
    const val = getAppConfig(db, 'verification_mode')
    if (val === 'pre_render') return 'pre_render'
  } catch {}
  return 'post_render'
}

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
  generationMethod: string,
  rulesByLang: Record<string, string[]>,
  customBasePrompt: string | undefined,
  customLangPrompt: string | undefined,
  resolution: string,
  glossaryHints?: GlossaryHints,
  expertTranslations?: ExpertTranslations,
  extractedZones?: Record<string, ExtractedZone>
): Promise<void> {
  db.prepare("UPDATE generation_tasks SET status = 'running' WHERE id = ?").run(task.id)

  try {
    // Classique: base prompt only — no glossary, no rules
    // Précision: filtered glossary hints + language rules per image
    // Natif: pre-translated zones by text model → quoted in image prompt with typographic hints
    const isPrecision = generationMethod === 'precision'

    const hints = isPrecision ? glossaryHints?.[task.target_language] : undefined
    const languageRules = isPrecision ? rulesByLang[task.target_language] : undefined
    const preTranslations = expertTranslations?.[task.target_language]

    const usedPreTranslation = preTranslations && Object.keys(preTranslations).length > 0
    const prompt = usedPreTranslation
      ? buildGoogleModePrompt(preTranslations!, task.target_language, customLangPrompt || customBasePrompt, extractedZones)
      : buildTranslationPrompt({
          targetLanguage: task.target_language,
          customPrompt: customLangPrompt,
          basePrompt: customBasePrompt,
          glossaryHints: hints && hints.length > 0 ? hints : undefined,
          languageRules: languageRules && languageRules.length > 0 ? languageRules : undefined,
        })

    // Prefix with fallback warning when text extraction failed (visible in admin logs)
    const fallbackWarning = (!usedPreTranslation && generationMethod === 'google')
      ? `[FALLBACK: text extraction returned empty — using standard prompt]\n\n`
      : ''

    // Save prompt to DB for debugging (truncated to 4000 chars to avoid bloating DB)
    const promptToSave = fallbackWarning + prompt
    db.prepare("UPDATE generation_tasks SET prompt_sent = ? WHERE id = ?").run(
      promptToSave.length > 4000 ? promptToSave.slice(0, 4000) + '\n…[truncated]' : promptToSave,
      task.id
    )

    const result = await generator.generateImage(task.source_image_path, task.target_language, prompt, resolution)

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
    db.prepare("UPDATE generation_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(jobId)

    const jobRow = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
    const jobConfig = jobRow?.config ? JSON.parse(jobRow.config) : {}
    const countryOrder: string[] = (jobConfig.countries || []).filter((c: string) => c !== 'FR')
    const generationMethod: string = jobConfig.generationMethod || 'standard'
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

    const ruleRows = db.prepare('SELECT language_code, rule FROM language_rules').all() as { language_code: string; rule: string }[]
    const rulesByLang: Record<string, string[]> = {}
    for (const row of ruleRows) {
      if (!rulesByLang[row.language_code]) rulesByLang[row.language_code] = []
      rulesByLang[row.language_code].push(row.rule)
    }

    const rawBasePrompt = getAppConfig(db, 'base_prompt') || undefined
    const configFileContent: string = jobConfig.configFileContent || ''
    const customBasePrompt = configFileContent
      ? [rawBasePrompt, `--- Données additionnelles ---\n${configFileContent}\n---`].filter(Boolean).join('\n\n')
      : rawBasePrompt || undefined

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
            return processTask(db, jobId, task, generator, generationMethod, rulesByLang, customBasePrompt, customLangPrompt, resolution, undefined, expertTranslations, extractedZones)
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

    const generationMethod: string = jobConfig.generationMethod || 'standard'
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

    const rawBasePrompt2 = getAppConfig(db, 'base_prompt') || undefined
    const configFileContent2: string = jobConfig.configFileContent || ''
    const customBasePrompt = configFileContent2
      ? [rawBasePrompt2, `--- Données additionnelles ---\n${configFileContent2}\n---`].filter(Boolean).join('\n\n')
      : rawBasePrompt2 || undefined

    // ── Natif mode: pre-translate zones with text model ──────────────────
    const imagePreTranslations = new Map<string, ExpertTranslations>()
    const imageExtractedZones = new Map<string, Record<string, ExtractedZone>>()

    if (generationMethod === 'google') {
      // All images in a job belong to the same French campaign — same content, different formats.
      // Extract text from ONE representative (prefer 1080x1080, fallback to first task),
      // translate to ALL target languages in one call, then share the result across every task.
      // No glossary or rules injected — pure translation by the text model.
      const targetLanguages = [...new Set(tasks.map((t) => t.target_language))]
      const representative = tasks.find((t) => t.source_image_name.includes('1080x1080')) || tasks[0]

      let preResult: PreTranslationResult = { translations: {}, extractedZones: {} }
      try {
        const timeout = new Promise<PreTranslationResult>((resolve) =>
          setTimeout(() => resolve({ translations: {}, extractedZones: {} }), 60_000)
        )
        preResult = await Promise.race([
          preValidateTranslations(representative.source_image_path, targetLanguages, {}, {}),
          timeout,
        ])
      } catch {
        // Pre-translation failed — continue with empty translations (standard prompt fallback)
      }

      // Save extracted zones + translations to job config for display in logs
      const jobRow2 = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
      const jobCfg2 = jobRow2?.config ? JSON.parse(jobRow2.config) : {}
      jobCfg2.preTranslationLog = {
        representativeImage: representative.source_image_name,
        extractedZones: preResult.extractedZones,
        translations: preResult.translations,
        ...(preResult.error ? { error: preResult.error } : {}),
      }
      db.prepare('UPDATE generation_jobs SET config = ? WHERE id = ?').run(JSON.stringify(jobCfg2), jobId)

      // Pre-render mode: pause here and wait for text review approval
      if (getVerificationMode(db) === 'pre_render') {
        db.prepare("UPDATE generation_jobs SET status = 'pending_text_review', completed_tasks = total_tasks, updated_at = datetime('now') WHERE id = ?").run(jobId)
        // Also persist current_step on the session so the layout can restore the text-review tab
        const jmPre = db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined
        if (jmPre) db.prepare("UPDATE sessions SET current_step = 'text-review', updated_at = datetime('now') WHERE id = ?").run(jmPre.session_id)
        runningJobs.delete(jobId)
        return
      }

      // Apply the same translations + zones to ALL tasks (all formats, all languages)
      for (const task of tasks) {
        imagePreTranslations.set(task.source_image_path, preResult.translations)
        imageExtractedZones.set(task.source_image_path, preResult.extractedZones)
      }
    }

    // ── Precision mode: filter glossary hints per image ────────────────────
    // Classique mode does NOT use glossary (too many tokens, no filtering)
    const imageGlossaryHints = new Map<string, GlossaryHints>()

    if (generationMethod === 'precision') {
      const glossaryRows = db.prepare('SELECT term_source, term_target, language_code FROM glossary').all() as { term_source: string; term_target: string; language_code: string }[]

      const glossaryByLang: Record<string, { source: string; target: string }[]> = {}
      for (const row of glossaryRows) {
        if (!glossaryByLang[row.language_code]) glossaryByLang[row.language_code] = []
        glossaryByLang[row.language_code].push({ source: row.term_source, target: row.term_target })
      }

      // Same logic as Gemini Pro: all formats in a job show the same French content.
      // Filter the glossary once from one representative image, share across all tasks.
      const targetLanguages = [...new Set(tasks.map((t) => t.target_language))]
      const representative = tasks.find((t) => t.source_image_name.includes('1080x1080')) || tasks[0]

      const hints = await filterGlossaryForImage(
        representative.source_image_path,
        targetLanguages,
        glossaryByLang,
        rulesByLang
      )

      for (const task of tasks) {
        imageGlossaryHints.set(task.source_image_path, hints)
      }
    }

    // ── BATCH MODE — submit all tasks to Gemini Batch API ─────────────────
    if (generationMode === 'batch') {
      const apiKey = getApiKey()

      // Build prompt for every task (same logic as standard, no generator needed yet)
      const batchTasks = tasks.map((task) => {
        const hints = imageGlossaryHints.get(task.source_image_path)
        const preTranslations = imagePreTranslations.get(task.source_image_path)
        const isPrecision = generationMethod === 'precision'
        const taskHints = isPrecision ? hints?.[task.target_language] : undefined
        const taskRules = isPrecision ? rulesByLang[task.target_language] : undefined
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
              glossaryHints: taskHints && taskHints.length > 0 ? taskHints : undefined,
              languageRules: taskRules && taskRules.length > 0 ? taskRules : undefined,
            })

        const fallbackWarning = (!usedPreTranslation && generationMethod === 'google')
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
          const hints = imageGlossaryHints.get(task.source_image_path)
          const expertTranslations = imagePreTranslations.get(task.source_image_path)
          const taskExtractedZones = imageExtractedZones.get(task.source_image_path)
          const customLangPrompt = customPromptsByLang[task.target_language] || undefined
          return processTask(
            db, jobId, task, generator,
            generationMethod, rulesByLang, customBasePrompt, customLangPrompt,
            resolution, hints, expertTranslations, taskExtractedZones
          )
        })
      )
    }

    // Check if cancelled
    const finalStatus = db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(jobId) as { status: string } | undefined
    if (finalStatus?.status === 'cancelled') return

    db.prepare("UPDATE generation_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(jobId)

    const jobMeta = db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined
    if (jobMeta) {
      db.prepare("UPDATE sessions SET status = 'done', current_step = 'review', updated_at = datetime('now') WHERE id = ?").run(jobMeta.session_id)
    }
  } catch (err: unknown) {
    // Unhandled error in job processor — write to job config so it's visible in admin logs
    const errMsg = err instanceof Error ? err.message : String(err)
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
