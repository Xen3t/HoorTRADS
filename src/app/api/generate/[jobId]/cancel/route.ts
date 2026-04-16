import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()

    const job = db.prepare('SELECT id, status FROM generation_jobs WHERE id = ?').get(jobId) as { id: string; status: string } | undefined
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    db.prepare(
      "UPDATE generation_tasks SET status = 'failed', error_message = 'Cancelled by user' WHERE job_id = ? AND status IN ('pending', 'running')"
    ).run(jobId)

    db.prepare(
      "UPDATE generation_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?"
    ).run(jobId)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Cancel failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
