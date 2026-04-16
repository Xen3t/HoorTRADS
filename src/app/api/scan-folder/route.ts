import { NextRequest, NextResponse } from 'next/server'
import { stat, realpath } from 'fs/promises'
import path from 'path'
import { scanFolderRequestSchema } from '@/types/images'
import { scanFolderTree } from '@/lib/files/folder-scanner'

// Reject paths that attempt to escape via .. or navigate to sensitive system directories
function isSafePath(resolvedPath: string): boolean {
  const normalized = resolvedPath.replace(/\\/g, '/').toLowerCase()
  const blocked = ['/windows', '/program files', '/programdata', '/system volume information']
  return !blocked.some((b) => normalized.includes(b))
}

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

    // Reject relative paths and paths with ..
    if (folderPath.includes('..') || !path.isAbsolute(folderPath)) {
      return NextResponse.json(
        { error: 'Invalid path: must be absolute without ".." segments' },
        { status: 400 }
      )
    }

    let resolvedPath: string
    try {
      const folderStat = await stat(folderPath)
      if (!folderStat.isDirectory()) {
        return NextResponse.json(
          { error: `Path is not a directory: "${folderPath}"` },
          { status: 400 }
        )
      }
      resolvedPath = await realpath(folderPath)
    } catch {
      return NextResponse.json(
        { error: `Folder not found or inaccessible: "${folderPath}"` },
        { status: 404 }
      )
    }

    if (!isSafePath(resolvedPath)) {
      return NextResponse.json(
        { error: 'Access denied: cannot scan system directories' },
        { status: 403 }
      )
    }

    const result = await scanFolderTree(resolvedPath)

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
