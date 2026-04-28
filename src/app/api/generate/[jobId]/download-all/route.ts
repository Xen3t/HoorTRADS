import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import archiver from 'archiver'
import { Readable } from 'stream'
import { getDb } from '@/lib/db/database'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const db = getDb()

  const job = db.prepare('SELECT session_id FROM generation_jobs WHERE id = ?').get(jobId) as { session_id: string } | undefined
  if (!job) return new Response('Job not found', { status: 404 })

  const session = db.prepare('SELECT name FROM sessions WHERE id = ?').get(job.session_id) as { name: string } | undefined
  const sessionName = (session?.name || 'campaign').replace(/[^a-z0-9_\-]/gi, '_').slice(0, 60)

  const tasks = db.prepare(`
    SELECT t.id, t.output_path, t.target_language, t.country_code, t.source_image_name
    FROM generation_tasks t
    WHERE t.job_id = ? AND t.status = 'done' AND t.output_path IS NOT NULL
  `).all(jobId) as { id: string; output_path: string; target_language: string; country_code: string; source_image_name: string }[]

  if (tasks.length === 0) return new Response('No images to download', { status: 404 })

  const generatedDir = path.join(process.cwd(), 'data', 'generated')
  const archive = archiver('zip', { zlib: { level: 6 } })

  // Buffer the stream so we can return it as a Response
  const chunks: Buffer[] = []
  archive.on('data', (chunk: Buffer) => chunks.push(chunk))

  for (const task of tasks) {
    if (!fs.existsSync(task.output_path)) continue
    try {
      const resolved = fs.realpathSync(task.output_path)
      if (!resolved.startsWith(generatedDir)) continue
      const sourceBase = path.parse(task.source_image_name).name
      const ext = path.extname(task.output_path) || '.jpg'
      const entryName = `${task.country_code}/${sourceBase}_${task.target_language}${ext}`
      archive.file(resolved, { name: entryName })
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
