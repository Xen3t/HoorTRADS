import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getTranslationsJSON } from '@/lib/translations/json-builder'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()
    const json = getTranslationsJSON(db, jobId)

    if (!json) {
      return NextResponse.json({ error: 'No translations found' }, { status: 404 })
    }

    // Return as downloadable JSON file
    const content = JSON.stringify(json, null, 4)

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="traductions.json"',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate translations'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
