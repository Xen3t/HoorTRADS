import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { renderJobTasks } from '@/lib/jobs/job-processor'
import { GeminiClient } from '@/lib/gemini/gemini-client'
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
    const jobRow = db.prepare('SELECT config, status FROM generation_jobs WHERE id = ?').get(jobId) as { config: string; status: string } | undefined
    if (!jobRow) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (jobRow.status !== 'pending_text_review') {
      return NextResponse.json({ error: `Job is not awaiting text review (status: ${jobRow.status})` }, { status: 400 })
    }

    // Save the approved (user-edited) translations to job config
    const jobConfig = jobRow.config ? JSON.parse(jobRow.config) : {}
    jobConfig.approvedTranslations = translations
    db.prepare('UPDATE generation_jobs SET config = ? WHERE id = ?').run(JSON.stringify(jobConfig), jobId)

    // Fire off NB2 rendering in background
    const generator = new GeminiClient()
    renderJobTasks(db, jobId, generator, translations).catch(() => {
      // Best-effort — job status in DB reflects failures
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to approve texts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
