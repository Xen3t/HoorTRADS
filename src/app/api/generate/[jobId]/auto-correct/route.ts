import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db/database'
import { verifyTaskImage } from '@/lib/verification/verifier'
import { GeminiClient } from '@/lib/gemini/gemini-client'
import { buildTranslationPrompt } from '@/lib/gemini/prompt-builder'
import { getAppConfig } from '@/lib/db/queries'
import type { GenerationTask } from '@/types/generation'

const SCORE_THRESHOLD = 4.0
const CONCURRENCY = 5

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()

    const tasks = db.prepare(
      "SELECT * FROM generation_tasks WHERE job_id = ? AND status = 'done' AND output_path IS NOT NULL AND output_path NOT LIKE 'mock_%'"
    ).all(jobId) as GenerationTask[]

    if (tasks.length === 0) {
      return NextResponse.json({ verified: 0, corrected: 0 })
    }

    // Step 1 — Verify all tasks in batches
    const verificationResults: { taskId: string; score: number; issues: string[]; summary: string }[] = []

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        batch.map((t) => verifyTaskImage(t.id, t.output_path!, t.target_language))
      )
      for (const r of results) {
        db.prepare(
          'UPDATE generation_tasks SET verification_status = ?, verification_notes = ? WHERE id = ?'
        ).run(
          String(r.score),
          JSON.stringify({ score: r.score, issues: r.issues, summary: r.summary, extractedText: r.extractedText }),
          r.taskId
        )
        verificationResults.push(r)
      }
    }

    // Step 2 — Regenerate tasks below threshold from original French source
    const toCorrect = verificationResults.filter((r) => r.score < SCORE_THRESHOLD)
    const generator = new GeminiClient()

    const ruleRows = db.prepare('SELECT language_code, rule FROM language_rules').all() as { language_code: string; rule: string }[]
    const rulesByLang: Record<string, string[]> = {}
    for (const row of ruleRows) {
      if (!rulesByLang[row.language_code]) rulesByLang[row.language_code] = []
      rulesByLang[row.language_code].push(row.rule)
    }

    const glossaryRows = db.prepare('SELECT term_source, term_target, language_code FROM glossary').all() as { term_source: string; term_target: string; language_code: string }[]
    const customBasePrompt = getAppConfig(db, 'base_prompt') || undefined

    for (const bad of toCorrect) {
      const task = tasks.find((t) => t.id === bad.taskId)
      if (!task) continue

      // Build correction prompt from verifier issues
      const correctionNotes = bad.issues.length > 0
        ? `Corrections required based on quality review:\n${bad.issues.map((i) => `- ${i}`).join('\n')}`
        : bad.summary

      const glossaryTerms = glossaryRows
        .filter((r) => r.language_code === task.target_language)
        .map((r) => ({ source: r.term_source, target: r.term_target }))

      const prompt = buildTranslationPrompt({
        targetLanguage: task.target_language,
        customPrompt: correctionNotes,
        basePrompt: customBasePrompt,
        glossaryTerms: glossaryTerms.length > 0 ? glossaryTerms : undefined,
        languageRules: rulesByLang[task.target_language],
      })

      // Always regenerate from the original French source
      db.prepare("UPDATE generation_tasks SET status = 'running' WHERE id = ?").run(task.id)
      const result = await generator.generateImage(task.source_image_path, task.target_language, prompt)

      if (result.success) {
        // Archive old output
        if (task.output_path) {
          db.prepare(
            'INSERT INTO generation_task_versions (id, task_id, output_path, prompt_sent, regen_label) VALUES (?, ?, ?, ?, ?)'
          ).run(randomUUID(), task.id, task.output_path, task.prompt_sent ?? null, 'auto-correct')
        }
        db.prepare("UPDATE generation_tasks SET status = 'done', output_path = ?, verification_status = NULL, verification_notes = NULL WHERE id = ?")
          .run(result.outputPath, task.id)
      } else {
        db.prepare("UPDATE generation_tasks SET status = 'done' WHERE id = ?").run(task.id)
      }
    }

    // Step 3 — Re-verify corrected tasks
    const correctedTaskIds = new Set(toCorrect.map((r) => r.taskId))
    const correctedTasks = db.prepare(
      "SELECT * FROM generation_tasks WHERE job_id = ? AND status = 'done' AND output_path IS NOT NULL"
    ).all(jobId) as GenerationTask[]
    const reTasks = correctedTasks.filter((t) => correctedTaskIds.has(t.id))

    for (let i = 0; i < reTasks.length; i += CONCURRENCY) {
      const batch = reTasks.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        batch.map((t) => verifyTaskImage(t.id, t.output_path!, t.target_language))
      )
      for (const r of results) {
        db.prepare(
          'UPDATE generation_tasks SET verification_status = ?, verification_notes = ? WHERE id = ?'
        ).run(
          String(r.score),
          JSON.stringify({ score: r.score, issues: r.issues, summary: r.summary, extractedText: r.extractedText }),
          r.taskId
        )
      }
    }

    // Build translations JSON from best 1080x1080 verified tasks
    const allVerified = db.prepare(
      "SELECT * FROM generation_tasks WHERE job_id = ? AND status = 'done' AND verification_status IS NOT NULL"
    ).all(jobId) as GenerationTask[]

    const translationsJSON: Record<string, Record<string, string>> = {}
    const tasksByLang: Record<string, GenerationTask[]> = {}
    for (const t of allVerified) {
      if (!tasksByLang[t.target_language]) tasksByLang[t.target_language] = []
      tasksByLang[t.target_language].push(t)
    }
    for (const [lang, langTasks] of Object.entries(tasksByLang)) {
      const canonical = langTasks.find((t) => t.source_image_name.includes('1080x1080')) || langTasks[0]
      const notes = canonical.verification_notes ? JSON.parse(canonical.verification_notes) : null
      if (notes?.extractedText && Object.keys(notes.extractedText).length > 0) {
        translationsJSON[lang.toUpperCase()] = notes.extractedText
      }
    }

    if (Object.keys(translationsJSON).length > 0) {
      const jobRow = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
      const jobConfig = jobRow?.config ? JSON.parse(jobRow.config) : {}
      jobConfig.translationsJSON = translationsJSON
      db.prepare("UPDATE generation_jobs SET config = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(jobConfig), jobId)
    }

    return NextResponse.json({
      verified: verificationResults.length,
      corrected: toCorrect.length,
      translationsJSON,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Auto-correct failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
