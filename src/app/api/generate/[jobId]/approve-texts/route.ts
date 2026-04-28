import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { renderJobTasks } from '@/lib/jobs/job-processor'
import { createImageGenerator } from '@/lib/image-generator-factory'
import type { ExpertTranslations } from '@/lib/gemini/text-extractor'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const body = await request.json()
    const translations: ExpertTranslations = body.translations || {}

    const db = getDb()
    const jobRow = db.prepare('SELECT id, session_id, config, status FROM generation_jobs WHERE id = ?').get(jobId) as { id: string; session_id: string; config: string; status: string } | undefined
    if (!jobRow) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    // Allowed entry points:
    //  - pending_text_review: classic flow (after pre-translation, awaiting user approval)
    //  - done: re-run with edited translations (user came back to /text-review on a finished session)
    //  - failed: same — let user retry with new translations
    const canRelaunch = ['pending_text_review', 'done', 'failed'].includes(jobRow.status)
    if (!canRelaunch) {
      return NextResponse.json({ error: `Job ne peut pas être relancé (statut: ${jobRow.status})` }, { status: 400 })
    }

    // Save the approved (user-edited) translations to job config
    const jobConfig = jobRow.config ? JSON.parse(jobRow.config) : {}
    const previousTranslations: ExpertTranslations = (jobConfig.approvedTranslations || jobConfig.preTranslationLog?.translations || {}) as ExpertTranslations
    jobConfig.approvedTranslations = translations
    db.prepare('UPDATE generation_jobs SET config = ? WHERE id = ?').run(JSON.stringify(jobConfig), jobId)

    // If the job already finished, reset only the tasks whose language translations have changed.
    if (jobRow.status === 'done' || jobRow.status === 'failed') {
      // Detect which languages actually changed
      const changedLangs = new Set<string>()
      const allLangs = new Set([...Object.keys(translations), ...Object.keys(previousTranslations)])
      for (const lang of allLangs) {
        const prev = previousTranslations[lang] || {}
        const next = translations[lang] || {}
        if (JSON.stringify(prev) !== JSON.stringify(next)) changedLangs.add(lang)
      }

      if (changedLangs.size === 0) {
        return NextResponse.json({ success: true, message: 'Aucune traduction modifiée — rien à régénérer.', regeneratedLangs: [] })
      }

      const langsArray = Array.from(changedLangs)
      const placeholders = langsArray.map(() => '?').join(',')

      // Archive previous outputs only for tasks of changed languages
      const tasksToReset = db.prepare(`
        SELECT id, output_path, prompt_sent FROM generation_tasks
        WHERE job_id = ? AND target_language IN (${placeholders})
      `).all(jobId, ...langsArray) as { id: string; output_path: string | null; prompt_sent: string | null }[]

      const archiveStmt = db.prepare(`
        INSERT INTO generation_task_versions (id, task_id, output_path, prompt_sent, regen_label, created_at)
        VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'avant re-validation textes', datetime('now'))
      `)
      for (const t of tasksToReset) {
        if (t.output_path) {
          try { archiveStmt.run(t.id, t.output_path, t.prompt_sent) } catch {}
        }
      }

      // Reset only the tasks for changed languages
      db.prepare(`
        UPDATE generation_tasks
        SET status = 'pending', error_message = NULL
        WHERE job_id = ? AND target_language IN (${placeholders})
      `).run(jobId, ...langsArray)

      // Recompute job counters from current state
      const remainingDone = db.prepare("SELECT COUNT(*) as c FROM generation_tasks WHERE job_id = ? AND status = 'done'").get(jobId) as { c: number }
      const remainingFailed = db.prepare("SELECT COUNT(*) as c FROM generation_tasks WHERE job_id = ? AND status = 'failed'").get(jobId) as { c: number }
      db.prepare(`
        UPDATE generation_jobs
        SET status = 'running', completed_tasks = ?, failed_tasks = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(remainingDone.c, remainingFailed.c, jobId)

      // Update session step
      db.prepare("UPDATE sessions SET status = 'generating', current_step = 'generate', updated_at = datetime('now') WHERE id = ?").run(jobRow.session_id)

      // Fire off image rendering in background — renderJobTasks picks up only 'pending' tasks
      const generator = createImageGenerator()
      renderJobTasks(db, jobId, generator, translations).catch(() => {})

      return NextResponse.json({ success: true, regeneratedLangs: langsArray })
    }

    // Classic flow (pending_text_review): start the full render
    const generator = createImageGenerator()
    renderJobTasks(db, jobId, generator, translations).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to approve texts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
