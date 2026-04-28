import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const db = getDb()

    if (jobId) {
      // Return all tasks for a specific job with their prompts
      const tasks = db.prepare(`
        SELECT
          t.id, t.source_image_name, t.target_language, t.country_code,
          t.status, t.output_path, t.error_message,
          t.prompt_sent, t.verification_status, t.verification_notes,
          t.created_at
        FROM generation_tasks t
        WHERE t.job_id = ?
        ORDER BY t.country_code, t.source_image_name
      `).all(jobId) as {
        id: string
        source_image_name: string
        target_language: string
        country_code: string
        status: string
        output_path: string | null
        error_message: string | null
        prompt_sent: string | null
        verification_status: string | null
        verification_notes: string | null
        created_at: string
      }[]

      // Attach version history (with prompts) to each task
      const tasksWithVersions = tasks.map((task) => {
        const versions = db.prepare(
          'SELECT id, output_path, prompt_sent, regen_label, created_at FROM generation_task_versions WHERE task_id = ? ORDER BY created_at ASC'
        ).all(task.id) as { id: string; output_path: string; prompt_sent: string | null; regen_label: string | null; created_at: string }[]
        return { ...task, versions }
      })

      return NextResponse.json({ tasks: tasksWithVersions })
    }

    // Return list of recent jobs with session info + creator user
    const jobs = db.prepare(`
      SELECT
        j.id, j.status, j.total_tasks, j.completed_tasks, j.failed_tasks,
        j.config, j.created_at, j.updated_at,
        s.name as session_name,
        u.name as user_name,
        u.email as user_email
      FROM generation_jobs j
      LEFT JOIN sessions s ON s.id = j.session_id
      LEFT JOIN users u ON u.id = s.user_id
      ORDER BY j.created_at DESC
      LIMIT 30
    `).all() as {
      id: string
      status: string
      total_tasks: number
      completed_tasks: number
      failed_tasks: number
      config: string
      created_at: string
      updated_at: string
      session_name: string
      user_name: string | null
      user_email: string | null
    }[]

    return NextResponse.json({ jobs })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch logs'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/logs — wipe log fields (preTranslationLog, processorError, renderError,
 * task error_messages) for ALL jobs. Doesn't touch task statuses or output_paths.
 */
export async function DELETE() {
  try {
    const db = getDb()
    const jobs = db.prepare('SELECT id, config FROM generation_jobs').all() as { id: string; config: string }[]
    let cleaned = 0
    const update = db.prepare('UPDATE generation_jobs SET config = ?, updated_at = datetime(\'now\') WHERE id = ?')
    for (const j of jobs) {
      try {
        const cfg = j.config ? JSON.parse(j.config) : {}
        let changed = false
        if (cfg.preTranslationLog) { delete cfg.preTranslationLog; changed = true }
        if (cfg.processorError) { delete cfg.processorError; changed = true }
        if (cfg.renderError) { delete cfg.renderError; changed = true }
        if (changed) {
          update.run(JSON.stringify(cfg), j.id)
          cleaned++
        }
      } catch {}
    }
    db.prepare('UPDATE generation_tasks SET error_message = NULL WHERE error_message IS NOT NULL').run()
    return NextResponse.json({ success: true, jobsCleaned: cleaned })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear logs'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
