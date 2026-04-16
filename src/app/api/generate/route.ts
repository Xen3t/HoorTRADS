import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getSessionById } from '@/lib/db/queries'
import { createGenerationJob } from '@/lib/jobs/job-manager'
import { processJob } from '@/lib/jobs/job-processor'
import { GeminiClient } from '@/lib/gemini/gemini-client'
import { MockGenerator } from '@/lib/gemini/mock-generator'
import { scanFolderTree } from '@/lib/files/folder-scanner'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const db = getDb()
    const session = getSessionById(db, sessionId)

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Prevent duplicate generation — if a job already exists for this session, return it
    const existingJob = db.prepare(
      "SELECT id, total_tasks FROM generation_jobs WHERE session_id = ? AND status IN ('pending', 'running', 'done') ORDER BY rowid DESC LIMIT 1"
    ).get(sessionId) as { id: string; total_tasks: number } | undefined
    if (existingJob) {
      return NextResponse.json({ jobId: existingJob.id, totalTasks: existingJob.total_tasks })
    }

    const config = session.config ? JSON.parse(session.config) : {}
    const allCountryCodes: string[] = config.countries || []

    // Exclude FR (source language) from translation targets
    const countryCodes = allCountryCodes.filter((c: string) => c !== 'FR')

    if (countryCodes.length === 0) {
      return NextResponse.json({ error: 'No countries to translate to (FR is the source language)' }, { status: 400 })
    }

    // Get real source images from the session folder
    if (!session.source_path) {
      return NextResponse.json({ error: 'Session has no source folder' }, { status: 400 })
    }

    // Use selected subfolders if available, otherwise scan full source path
    const sessionConfig = session.config ? JSON.parse(session.config) : {}
    const selectedPaths: string[] = sessionConfig.selected_paths || [session.source_path]

    const allImages: { path: string; name: string }[] = []
    for (const folderPath of selectedPaths) {
      const scanResult = await scanFolderTree(folderPath)
      for (const img of scanResult.images) {
        allImages.push({ path: img.path, name: img.filename })
      }
    }

    if (allImages.length === 0) {
      return NextResponse.json({ error: 'No images found in selected folders' }, { status: 400 })
    }

    const sourceImages = allImages

    const job = createGenerationJob(db, {
      sessionId,
      sourceImages,
      countryCodes,
      config,
    })

    // Update session status
    db.prepare("UPDATE sessions SET status = 'generating', current_step = 'generate', updated_at = datetime('now') WHERE id = ?").run(sessionId)

    // Start processing in background (non-blocking)
    const generator = process.env.GEMINI_API_KEY
      ? new GeminiClient()
      : new MockGenerator(0.05)
    processJob(db, job.id, generator).catch(() => {
      // Job processing errors are tracked per-task in the DB
    })

    return NextResponse.json({ jobId: job.id, totalTasks: job.total_tasks })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start generation'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
