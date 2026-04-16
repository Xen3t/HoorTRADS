import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()

    const jobRow = db.prepare('SELECT config, status FROM generation_jobs WHERE id = ?').get(jobId) as { config: string; status: string } | undefined
    if (!jobRow) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const jobConfig = jobRow.config ? JSON.parse(jobRow.config) : {}
    const log = jobConfig.preTranslationLog || null
    const approvedTranslations = jobConfig.approvedTranslations || null

    return NextResponse.json({
      status: jobRow.status,
      extractedZones: log?.extractedZones || {},
      translations: approvedTranslations || log?.translations || {},
      representativeImage: log?.representativeImage || null,
      hasApproved: !!approvedTranslations,
      preTranslationError: log?.error || null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load text review'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
