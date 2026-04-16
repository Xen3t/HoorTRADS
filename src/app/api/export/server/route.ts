import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { getDb } from '@/lib/db/database'
import { getSessionById } from '@/lib/db/queries'
import { getJobBySessionId } from '@/lib/jobs/job-manager'
import type { GenerationTask } from '@/types/generation'

const ADS_FORMATS = ['1920x1080', '1080x1080', '1080x1920', '1080x1350']

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
}

async function detectDimensions(sourceName: string, outputPath: string): Promise<string> {
  // 1. Try to extract from source filename
  const match = sourceName.match(/(\d{3,4}x\d{3,4})/i)
  if (match) return match[1]

  // 2. Detect real dimensions with Sharp
  const meta = await sharp(outputPath).metadata()
  const dims = `${meta.width}x${meta.height}`

  // 3. If it matches a known ads format, use it
  if (ADS_FORMATS.includes(dims)) return dims

  // 4. Otherwise use real dimensions
  return dims
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, customPath, compressionTarget, campaignName } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const db = getDb()
    const session = getSessionById(db, sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const job = getJobBySessionId(db, sessionId)
    if (!job) {
      return NextResponse.json({ error: 'No generation job found' }, { status: 404 })
    }

    // Get all completed tasks
    const tasks = db.prepare(
      "SELECT * FROM generation_tasks WHERE job_id = ? AND status = 'done'"
    ).all(job.id) as GenerationTask[]

    if (tasks.length === 0) {
      return NextResponse.json({ error: 'No completed images to export' }, { status: 400 })
    }

    // Get language→countries mapping from job config
    const jobConfig = job.config ? JSON.parse(job.config) : {}
    const langToCountries: Record<string, string[]> = jobConfig.langToCountries || {}

    // Validate customPath if provided — must be absolute, no ".." segments
    if (customPath) {
      const trimmed = customPath.trim()
      if (trimmed.includes('..') || !path.isAbsolute(trimmed)) {
        return NextResponse.json(
          { error: 'Invalid export path: must be absolute without ".." segments' },
          { status: 400 }
        )
      }
    }

    const maxSizeBytes = (parseFloat(compressionTarget) || 1) * 1024 * 1024
    let exportedCount = 0
    const errors: string[] = []
    // Track the first destination used for the success message
    let firstDestinationRoot: string | null = null

    for (const task of tasks) {
      if (!task.output_path || !fs.existsSync(task.output_path)) {
        errors.push(`File not found: ${task.source_image_name}`)
        continue
      }

      try {
        // Destination rooted at the source image's own folder — not the session root.
        // This ensures e.g. C:\Campagnes\visuel_générique\ → C:\Campagnes\visuel_générique\RENDU\
        // even when multiple subfolders are part of the same job.
        const sourceDir = path.dirname(task.source_image_path)
        // If the source is already inside a RENDU folder (ADS structure), use it directly
        const isAlreadyInRendu = path.basename(sourceDir).toUpperCase() === 'RENDU'
        const destinationRoot = customPath?.trim() || (isAlreadyInRendu ? sourceDir : path.join(sourceDir, 'RENDU'))
        if (!firstDestinationRoot) firstDestinationRoot = destinationRoot

        const ext = path.extname(task.source_image_name).toLowerCase()
        const opName = sanitizeFilename(campaignName || session.name)
        const dimensions = await detectDimensions(task.source_image_name, task.output_path)

        // Compress once if needed
        let processedBuffer: Buffer
        const stats = fs.statSync(task.output_path)
        if (stats.size > maxSizeBytes) {
          const quality = Math.max(20, Math.round((maxSizeBytes / stats.size) * 85))
          processedBuffer = await sharp(task.output_path).jpeg({ quality }).toBuffer()
        } else {
          processedBuffer = fs.readFileSync(task.output_path)
        }

        // Get all countries for this language
        const countries = langToCountries[task.target_language] || [task.country_code]

        for (const countryCode of countries) {
          // If multiple countries share this language, suffix with COUNTRY_LANG (e.g. BE_NL)
          const countryLabel = countries.length > 1
            ? `${countryCode}_${task.target_language.toUpperCase()}`
            : countryCode

          // {nom_op}_{largeur}x{hauteur}_{code_pays}.{ext}
          const outputFilename = `${opName}_${dimensions}_${countryLabel}${ext}`
          const outputDir = path.join(destinationRoot, countryCode)
          fs.mkdirSync(outputDir, { recursive: true })
          const outputPath = path.join(outputDir, outputFilename)
          fs.writeFileSync(outputPath, processedBuffer)
          exportedCount++
        }
      } catch (err) {
        errors.push(`Failed ${task.source_image_name}: ${err instanceof Error ? err.message : 'unknown'}`)
      }
    }

    // Write translations.json alongside the images
    if (firstDestinationRoot) {
      try {
        const preTranslationLog = jobConfig.preTranslationLog
        const approvedTranslations = jobConfig.approvedTranslations || preTranslationLog?.translations || jobConfig.translationsJSON
        if (approvedTranslations && Object.keys(approvedTranslations).length > 0) {
          const jsonPath = path.join(firstDestinationRoot, 'translations.json')
          fs.writeFileSync(jsonPath, JSON.stringify(approvedTranslations, null, 2), 'utf-8')
        }
      } catch { /* non-bloquant */ }
    }

    // Mark session as exported
    db.prepare(
      "UPDATE sessions SET status = 'exported', current_step = 'export', updated_at = datetime('now') WHERE id = ?"
    ).run(sessionId)

    return NextResponse.json({
      success: true,
      destinationPath: firstDestinationRoot,
      exportedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `${exportedCount} images exportées vers ${firstDestinationRoot}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Export failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
