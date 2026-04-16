import { NextRequest, NextResponse } from 'next/server'
import { stat } from 'fs/promises'
import { scanFolderRequestSchema } from '@/types/images'
import { scanFolderTree } from '@/lib/files/folder-scanner'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = scanFolderRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request: folder path is required' },
        { status: 400 }
      )
    }

    const { folderPath } = parsed.data

    try {
      const folderStat = await stat(folderPath)
      if (!folderStat.isDirectory()) {
        return NextResponse.json(
          { error: `Path is not a directory: "${folderPath}"` },
          { status: 400 }
        )
      }
    } catch {
      return NextResponse.json(
        { error: `Folder not found or inaccessible: "${folderPath}"` },
        { status: 404 }
      )
    }

    const result = await scanFolderTree(folderPath)

    if (result.totalImages === 0) {
      return NextResponse.json(
        {
          ...result,
          source: 'folder' as const,
          warning: 'No supported images found in this folder (PNG, JPG, JPEG, WebP)',
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      ...result,
      source: 'folder' as const,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Scan failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
