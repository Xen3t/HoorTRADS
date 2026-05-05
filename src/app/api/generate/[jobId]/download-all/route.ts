import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import archiver from 'archiver'
import { Readable } from 'stream'
import { getDb } from '@/lib/db/database'

function extractDimensions(sourceName: string): string {
  const match = sourceName.match(/(\d{3,4}x\d{3,4})/i)
  return match ? match[1] : path.parse(sourceName).name
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const db = getDb()

  const jobRow = db.prepare('SELECT session_id, config FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string; config: string } | undefined
  if (!jobRow) return new Response('Job not found', { status: 404 })

  const session = db.prepare('SELECT name, config FROM sessions WHERE id = ?').get(jobRow.session_id) as { name: string; config: string } | undefined
  const sessionName = (session?.name || 'campaign').replace(/[^a-z0-9_\-]/gi, '_').slice(0, 60)

  const jobConfig = jobRow.config ? JSON.parse(jobRow.config) : {}
  const langToCountries: Record<string, string[]> = jobConfig.langToCountries || {}

  // Use campaign name from session config if set, otherwise session name
  let opName = sessionName
  try {
    const sessCfg = session?.config ? JSON.parse(session.config) : {}
    if (sessCfg.campaignName) opName = sanitizeFilename(sessCfg.campaignName)
  } catch { /* fallback */ }

  const tasks = db.prepare(`
    SELECT t.id, t.output_path, t.target_language, t.country_code, t.source_image_name
    FROM generation_tasks t
    WHERE t.job_id = ? AND t.status = 'done' AND t.output_path IS NOT NULL
  `).all(jobId) as { id: string; output_path: string; target_language: string; country_code: string; source_image_name: string }[]

  if (tasks.length === 0) return new Response('No images to download', { status: 404 })

  // path.relative is used for the security check — robust on Windows (no startsWith casing issues)
  const generatedDir = path.resolve(process.cwd(), 'data', 'generated')
  const archive = archiver('zip', { zlib: { level: 6 } })

  const chunks: Buffer[] = []
  archive.on('data', (chunk: Buffer) => chunks.push(chunk))

  const writtenEntries = new Set<string>()

  for (const task of tasks) {
    if (!fs.existsSync(task.output_path)) continue
    try {
      const resolved = path.resolve(task.output_path)
      const rel = path.relative(generatedDir, resolved)
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue

      const ext = path.extname(task.output_path) || '.jpg'
      const dimensions = extractDimensions(task.source_image_name)
      const countries = langToCountries[task.target_language] || [task.country_code]

      for (const countryCode of countries) {
        const countryLabel = countries.length > 1
          ? `${countryCode}_${task.target_language.toUpperCase()}`
          : countryCode
        let entryName = `${countryCode}/${opName}_${dimensions}_${countryLabel}${ext}`
        // Disambiguate if two source images share the same dimensions
        if (writtenEntries.has(entryName)) {
          const sourceBase = sanitizeFilename(path.parse(task.source_image_name).name)
          entryName = `${countryCode}/${opName}_${dimensions}_${sourceBase}_${countryLabel}${ext}`
        }
        writtenEntries.add(entryName)
        archive.file(resolved, { name: entryName })
      }
    } catch { /* skip bad paths */ }
  }

  await archive.finalize()

  const buffer = Buffer.concat(chunks)
  const filename = `${sessionName}_${jobId.slice(0, 8)}.zip`

  return new Response(Readable.toWeb(Readable.from(buffer)) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
