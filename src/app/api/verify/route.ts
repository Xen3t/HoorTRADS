import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getTranslationsJSON } from '@/lib/translations/json-builder'
import { createVerifier } from '@/lib/verification/verifier'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { jobId, provider = 'gemini' } = body

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 })
    }

    const db = getDb()
    const translations = getTranslationsJSON(db, jobId)

    if (!translations) {
      return NextResponse.json({ error: 'No translations to verify' }, { status: 404 })
    }

    const verifier = createVerifier(provider)
    const results = await verifier.verify(translations)

    // Count suspicious findings
    const suspiciousCount = results.reduce(
      (sum, r) => sum + r.findings.filter((f) => f.status === 'suspicious').length,
      0
    )

    return NextResponse.json({
      results,
      summary: {
        totalLanguages: results.length,
        suspiciousCount,
        status: suspiciousCount > 0 ? 'issues_found' : 'all_clear',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
