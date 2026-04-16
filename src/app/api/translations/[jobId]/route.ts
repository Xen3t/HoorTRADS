import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()

    const job = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const config = job.config ? JSON.parse(job.config) : {}

    // Priority: approvedTranslations (text-review) → preTranslationLog → translationsJSON (auto-correct)
    const translations =
      config.approvedTranslations ||
      config.preTranslationLog?.translations ||
      config.translationsJSON ||
      null

    if (!translations || Object.keys(translations).length === 0) {
      return NextResponse.json(
        { error: 'Aucune traduction disponible pour ce job.' },
        { status: 404 }
      )
    }

    const content = JSON.stringify(translations, null, 2)

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="traductions.json"',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get translations'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
