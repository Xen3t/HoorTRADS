import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { verifyTaskImage } from '@/lib/verification/verifier'
import type { GenerationTask } from '@/types/generation'

// Prefer 1080x1080 as the canonical format for translations JSON
const PREFERRED_FORMAT = '1080x1080'

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()
    if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

    const db = getDb()

    const tasks = db.prepare(
      "SELECT * FROM generation_tasks WHERE job_id = ? AND status = 'done' AND output_path IS NOT NULL AND output_path NOT LIKE 'mock_%'"
    ).all(jobId) as GenerationTask[]

    if (tasks.length === 0) {
      return NextResponse.json({ error: 'No completed real tasks to verify' }, { status: 400 })
    }

    let totalScore = 0
    let okCount = 0       // ≥4 (VALIDE)
    let warningCount = 0  // ≥3 (LIMITE)
    let errorCount = 0    // <3 (À CORRIGER)

    // Verify all tasks (concurrency limited to 5 to avoid hammering Flash API)
    const CONCURRENCY = 5
    const results = []

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map((task) => verifyTaskImage(task.id, task.output_path!, task.target_language))
      )

      for (const result of batchResults) {
        // Persist in DB
        db.prepare(
          'UPDATE generation_tasks SET verification_status = ?, verification_notes = ? WHERE id = ?'
        ).run(
          String(result.score),
          JSON.stringify({ score: result.score, issues: result.issues, summary: result.summary, extractedText: result.extractedText }),
          result.taskId
        )

        results.push(result)
        totalScore += result.score
        if (result.score >= 4) okCount++
        else if (result.score >= 3) warningCount++
        else errorCount++
      }
    }

    // Build real translations JSON from the preferred format (1080x1080)
    // Fallback to first available format if no 1080x1080 exists
    const translationsJSON: Record<string, Record<string, string>> = {}

    const tasksByLang: Record<string, GenerationTask[]> = {}
    for (const task of tasks) {
      if (!tasksByLang[task.target_language]) tasksByLang[task.target_language] = []
      tasksByLang[task.target_language].push(task)
    }

    for (const [lang, langTasks] of Object.entries(tasksByLang)) {
      // Prefer 1080x1080, then fall back to first task
      const canonical = langTasks.find((t) => t.source_image_name.includes(PREFERRED_FORMAT)) || langTasks[0]
      const resultForCanonical = results.find((r) => r.taskId === canonical.id)

      if (resultForCanonical && Object.keys(resultForCanonical.extractedText).length > 0) {
        translationsJSON[lang.toUpperCase()] = resultForCanonical.extractedText
      }
    }

    // Save translations JSON to job config
    if (Object.keys(translationsJSON).length > 0) {
      const jobRow = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
      const jobConfig = jobRow?.config ? JSON.parse(jobRow.config) : {}
      jobConfig.translationsJSON = translationsJSON
      db.prepare("UPDATE generation_jobs SET config = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(jobConfig), jobId)
    }

    const avgScore = results.length > 0 ? Math.round((totalScore / results.length) * 10) / 10 : 0

    return NextResponse.json({
      summary: {
        total: tasks.length,
        ok: okCount,
        warning: warningCount,
        error: errorCount,
        avgScore,
        status: errorCount > 0 ? 'errors_found' : warningCount > 0 ? 'warnings_found' : 'all_clear',
      },
      translationsJSON,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
