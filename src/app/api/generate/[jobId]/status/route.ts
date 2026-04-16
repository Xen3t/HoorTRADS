import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getJobProgress } from '@/lib/jobs/job-manager'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()
    const progress = getJobProgress(db, jobId)

    if (!progress) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json(progress)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get job status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
