import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getJobBySessionId } from '@/lib/jobs/job-manager'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const db = getDb()
    const job = getJobBySessionId(db, sessionId)

    if (!job) {
      return NextResponse.json({ error: 'No generation job found for this session' }, { status: 404 })
    }

    return NextResponse.json({ jobId: job.id, status: job.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to find job'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
