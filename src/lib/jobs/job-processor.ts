import type Database from 'better-sqlite3'
import type { ImageGenerator, GenerationTask } from '@/types/generation'
import { buildTranslationPrompt } from '@/lib/gemini/prompt-builder'

// In-memory tracking of running jobs to prevent duplicate processing
const runningJobs = new Set<string>()

export async function processJob(
  db: Database.Database,
  jobId: string,
  generator: ImageGenerator
): Promise<void> {
  if (runningJobs.has(jobId)) return
  runningJobs.add(jobId)

  try {
    // Mark job as running
    db.prepare("UPDATE generation_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(jobId)

    // Get job config to preserve country order from user selection
    const jobRow = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
    const jobConfig = jobRow?.config ? JSON.parse(jobRow.config) : {}
    const countryOrder: string[] = (jobConfig.countries || []).filter((c: string) => c !== 'FR')

    // Get pending tasks and sort by user's country selection order
    const rawTasks = db.prepare(
      "SELECT * FROM generation_tasks WHERE job_id = ? AND status = 'pending'"
    ).all(jobId) as GenerationTask[]

    const tasks = rawTasks.sort((a, b) => {
      const aIdx = countryOrder.indexOf(a.country_code)
      const bIdx = countryOrder.indexOf(b.country_code)
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
    })

    for (const task of tasks) {
      // Mark task as running
      db.prepare("UPDATE generation_tasks SET status = 'running' WHERE id = ?").run(task.id)

      try {
        const prompt = buildTranslationPrompt({
          targetLanguage: task.target_language,
        })

        const result = await generator.generateImage(
          task.source_image_path,
          task.target_language,
          prompt
        )

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

    // Mark job as done
    db.prepare("UPDATE generation_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(jobId)

    // Mark session as done
    const jobMeta = db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined
    if (jobMeta) {
      db.prepare("UPDATE sessions SET status = 'done', current_step = 'review', updated_at = datetime('now') WHERE id = ?").run(jobMeta.session_id)
    }
  } finally {
    runningJobs.delete(jobId)
  }
}
