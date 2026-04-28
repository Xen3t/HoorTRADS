import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { processJob } from '@/lib/jobs/job-processor'
import { createImageGenerator } from '@/lib/image-generator-factory'

/**
 * POST /api/generate/[jobId]/reextract
 *
 * Relaunches the full extraction + translation pipeline for the job.
 * Useful when the original extraction returned bad data and the user wants
 * to start over without recreating a session.
 *
 * Flow:
 *  1. Archive current image outputs as task versions (kept in history)
 *  2. Clear the preTranslationLog from job config (extracted zones, translations, timings)
 *  3. Reset all tasks to 'pending'
 *  4. Reset job status to 'running' (counters to 0)
 *  5. Trigger processJob — it will re-run extraction + translation, then pause at pending_text_review
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()

    const job = db.prepare('SELECT id, session_id, config, status FROM generation_jobs WHERE id = ?').get(jobId) as { id: string; session_id: string; config: string; status: string } | undefined
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    // Archive previous image outputs
    const tasks = db.prepare('SELECT id, output_path, prompt_sent FROM generation_tasks WHERE job_id = ?').all(jobId) as { id: string; output_path: string | null; prompt_sent: string | null }[]
    const archiveStmt = db.prepare(`
      INSERT INTO generation_task_versions (id, task_id, output_path, prompt_sent, regen_label, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'avant re-extraction', datetime('now'))
    `)
    for (const t of tasks) {
      if (t.output_path) {
        try { archiveStmt.run(t.id, t.output_path, t.prompt_sent) } catch {}
      }
    }

    // Clear preTranslationLog and approvedTranslations so the extraction can re-run cleanly
    const cfg = job.config ? JSON.parse(job.config) : {}
    delete cfg.preTranslationLog
    delete cfg.approvedTranslations
    delete cfg.processorError
    delete cfg.renderError
    db.prepare('UPDATE generation_jobs SET config = ?, status = \'running\', completed_tasks = 0, failed_tasks = 0, updated_at = datetime(\'now\') WHERE id = ?').run(JSON.stringify(cfg), jobId)

    // Reset all tasks
    db.prepare("UPDATE generation_tasks SET status = 'pending', error_message = NULL WHERE job_id = ?").run(jobId)

    // Update session step
    db.prepare("UPDATE sessions SET status = 'generating', current_step = 'generate', updated_at = datetime('now') WHERE id = ?").run(job.session_id)

    // Fire off the full pipeline in background
    const generator = createImageGenerator()
    processJob(db, jobId, generator).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to relaunch extraction'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
