import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import type { GenerationTask } from '@/types/generation'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()

    const tasks = db.prepare(
      'SELECT * FROM generation_tasks WHERE job_id = ? ORDER BY country_code, source_image_name'
    ).all(jobId) as GenerationTask[]

    // Attach version history to each task
    const tasksWithVersions = tasks.map((task) => {
      const versions = db.prepare(
        'SELECT output_path FROM generation_task_versions WHERE task_id = ? ORDER BY created_at ASC'
      ).all(task.id) as { output_path: string }[]
      return {
        ...task,
        versions: versions.map((v) => v.output_path),
      }
    })

    // Group by country
    const grouped: Record<string, typeof tasksWithVersions> = {}
    for (const task of tasksWithVersions) {
      if (!grouped[task.country_code]) grouped[task.country_code] = []
      grouped[task.country_code].push(task)
    }

    return NextResponse.json({ tasks: tasksWithVersions, grouped, total: tasks.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch images'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
