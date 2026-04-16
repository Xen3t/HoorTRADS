import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db/database'
import { GeminiClient } from '@/lib/gemini/gemini-client'
import { MockGenerator } from '@/lib/gemini/mock-generator'
import { buildTranslationPrompt } from '@/lib/gemini/prompt-builder'
import type { GenerationTask } from '@/types/generation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const body = await request.json()
    const { taskId, customPrompt } = body

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    const db = getDb()

    const task = db.prepare(
      'SELECT * FROM generation_tasks WHERE id = ? AND job_id = ?'
    ).get(taskId, jobId) as GenerationTask | undefined

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Mark as running
    db.prepare("UPDATE generation_tasks SET status = 'running' WHERE id = ?").run(taskId)

    // Build prompt with optional custom correction
    const prompt = buildTranslationPrompt({
      targetLanguage: task.target_language,
      customPrompt: customPrompt || undefined,
    })

    // Regenerate with real Gemini or mock
    const generator = process.env.GEMINI_API_KEY
      ? new GeminiClient()
      : new MockGenerator(0)
    // Use the previously generated image as source, not the original FR
    const imageToEdit = task.output_path || task.source_image_path
    const result = await generator.generateImage(
      imageToEdit,
      task.target_language,
      prompt
    )

    if (result.success) {
      // Save previous version to history before overwriting
      if (task.output_path) {
        db.prepare(
          'INSERT INTO generation_task_versions (id, task_id, output_path) VALUES (?, ?, ?)'
        ).run(randomUUID(), taskId, task.output_path)
      }

      db.prepare(
        "UPDATE generation_tasks SET status = 'done', output_path = ?, error_message = NULL WHERE id = ?"
      ).run(result.outputPath, taskId)

      // Fetch all versions for this task
      const versions = db.prepare(
        'SELECT output_path FROM generation_task_versions WHERE task_id = ? ORDER BY created_at ASC'
      ).all(taskId) as { output_path: string }[]

      return NextResponse.json({
        success: true,
        outputPath: result.outputPath,
        versions: versions.map((v) => v.output_path),
      })
    } else {
      db.prepare(
        "UPDATE generation_tasks SET status = 'failed', error_message = ? WHERE id = ?"
      ).run(result.error || 'Regeneration failed', taskId)

      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Regeneration failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
