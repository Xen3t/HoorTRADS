import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { isValidImageFormat } from '@/lib/files/image-validator'
import type { ImportedImage } from '@/types/images'

const TEMP_DIR = path.join(process.cwd(), 'data', 'temp')

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files')

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const sessionId = randomUUID()
    const sessionDir = path.join(TEMP_DIR, sessionId)
    await mkdir(sessionDir, { recursive: true })

    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB per file
    const importedImages: ImportedImage[] = []

    for (const file of files) {
      if (!(file instanceof File)) continue
      if (!isValidImageFormat(file.name)) continue

      const buffer = Buffer.from(await file.arrayBuffer())

      // Reject files that are too large
      if (buffer.length > MAX_FILE_SIZE) continue

      // Sanitize filename: strip path separators and ".." to prevent traversal
      const safeName = path.basename(file.name).replace(/\.\./g, '_')
      const filePath = path.join(sessionDir, safeName)
      await writeFile(filePath, buffer)

      const ext = safeName.split('.').pop()?.toLowerCase() as ImportedImage['format']

      importedImages.push({
        id: randomUUID(),
        filename: safeName,
        path: filePath,
        thumbnailUrl: `/api/upload/${sessionId}/${encodeURIComponent(safeName)}`,
        format: ext,
        sizeBytes: buffer.length,
      })
    }

    return NextResponse.json({
      images: importedImages,
      source: 'drag-drop' as const,
      sessionId,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
