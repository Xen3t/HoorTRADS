import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { verifyTranslationsText } from '@/lib/verification/verifier'
import type { TextVerificationResult } from '@/lib/verification/verifier'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const body = await request.json()
    // Can verify a single language or all. Body: { targetLanguage?: string }
    const { targetLanguage } = body

    const db = getDb()
    const jobRow = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
    if (!jobRow) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const jobConfig = jobRow.config ? JSON.parse(jobRow.config) : {}
    const log = jobConfig.preTranslationLog
    const translations = jobConfig.approvedTranslations || log?.translations || {}
    // extractedZones can be { text, weight, case, color, size } objects — flatten to text strings for verifier
    const rawZones = log?.extractedZones || {}
    const frenchZones: Record<string, string> = Object.fromEntries(
      Object.entries(rawZones).map(([k, v]) => [k, typeof v === 'string' ? v : (v as { text: string }).text])
    )

    if (Object.keys(frenchZones).length === 0) {
      return NextResponse.json({ error: 'No extracted zones found — run Gemini Pro mode to extract text first' }, { status: 400 })
    }

    const languagesToVerify: string[] = targetLanguage
      ? [targetLanguage]
      : Object.keys(translations)

    const results: TextVerificationResult[] = await Promise.all(
      languagesToVerify.map((lang) =>
        verifyTranslationsText(frenchZones, translations[lang] || {}, lang)
      )
    )

    const totalScore = results.reduce((sum, r) => sum + r.score, 0)
    const avgScore = results.length > 0 ? Math.round((totalScore / results.length) * 10) / 10 : 0

    const summary = {
      ok: results.filter((r) => r.score >= 4).length,
      warning: results.filter((r) => r.score >= 3 && r.score < 4).length,
      error: results.filter((r) => r.score < 3).length,
      total: results.length,
      avgScore,
    }

    return NextResponse.json({ results, summary })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
