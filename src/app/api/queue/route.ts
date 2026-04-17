import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getSession } from '@/lib/auth'

// GET /api/queue — sessions en cours de génération + terminées non encore consultées
// "Non consultée" = status 'done' et current_step = 'review' (l'utilisateur n'a pas encore ouvert la page de revue)
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('hoortrad_session')?.value
    const authUser = token ? getSession(token) : null
    if (!authUser) return NextResponse.json({ sessions: [] })
    const db = getDb()

    // Répare les sessions bloquées en 'generating' dont le job est terminé
    db.prepare(`
      UPDATE sessions SET status = 'done', current_step = 'review', updated_at = datetime('now')
      WHERE status = 'generating'
        AND id IN (
          SELECT s.id FROM sessions s
          JOIN generation_jobs g ON g.session_id = s.id
            AND g.rowid = (SELECT MAX(rowid) FROM generation_jobs WHERE session_id = s.id)
          WHERE g.status = 'done'
        )
    `).run()

    const sessions = db.prepare(`
      SELECT
        s.id, s.name, s.status, s.created_at, s.updated_at,
        s.image_count, s.market_count, s.current_step,
        g.id as job_id, g.status as job_status,
        g.total_tasks, g.completed_tasks, g.failed_tasks
      FROM sessions s
      LEFT JOIN generation_jobs g ON g.session_id = s.id
        AND g.rowid = (SELECT MAX(rowid) FROM generation_jobs WHERE session_id = s.id)
      WHERE ((s.status = 'generating' AND g.job_status IN ('pending', 'running'))
         OR (s.status = 'done' AND s.current_step = 'review')
         OR (s.current_step = 'text-review'))
        AND s.user_id = ?
      ORDER BY
        CASE s.status WHEN 'generating' THEN 0 ELSE 1 END ASC,
        s.updated_at DESC
    `).all(authUser.id) as {
      id: string; name: string; status: string; created_at: string; updated_at: string
      image_count: number; market_count: number; current_step: string
      job_id: string | null; job_status: string | null
      total_tasks: number | null; completed_tasks: number | null; failed_tasks: number | null
    }[]

    return NextResponse.json({ sessions })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
