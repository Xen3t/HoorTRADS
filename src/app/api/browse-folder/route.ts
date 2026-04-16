import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat, realpath } from 'fs/promises'
import path from 'path'
import os from 'os'

interface FolderEntry {
  name: string
  path: string
  isDirectory: boolean
}

// Allowed root paths — only these drives/folders can be browsed
const ALLOWED_DRIVES = ['C', 'D', 'E', 'O', 'Z']
const ALLOWED_USER_FOLDERS = ['Desktop', 'Downloads', 'Documents']

function getAllowedRoots(): string[] {
  const roots: string[] = ALLOWED_DRIVES.map((d) => `${d}:\\`)
  const home = os.homedir()
  for (const folder of ALLOWED_USER_FOLDERS) {
    roots.push(path.join(home, folder))
  }
  return roots
}

function isPathAllowed(resolvedPath: string): boolean {
  const roots = getAllowedRoots()
  const normalized = resolvedPath.replace(/\\/g, '/').toLowerCase()
  return roots.some((root) => {
    const normalizedRoot = root.replace(/\\/g, '/').toLowerCase()
    return normalized === normalizedRoot.replace(/\/$/, '') || normalized.startsWith(normalizedRoot.replace(/\/$/, '') + '/')
  })
}

export async function GET(request: NextRequest) {
  try {
    const folderPath = request.nextUrl.searchParams.get('path')

    // If no path provided, return common root locations (Windows drives + user folders)
    if (!folderPath) {
      const roots: FolderEntry[] = []

      // Add Windows drives
      for (const letter of ALLOWED_DRIVES) {
        try {
          await stat(`${letter}:\\`)
          roots.push({ name: `${letter}:\\`, path: `${letter}:\\`, isDirectory: true })
        } catch {
          // Drive doesn't exist
        }
      }

      // Add user Desktop and Downloads
      const home = os.homedir()
      for (const folder of ALLOWED_USER_FOLDERS) {
        const p = path.join(home, folder)
        try {
          await stat(p)
          roots.push({ name: folder, path: p, isDirectory: true })
        } catch {
          // Folder doesn't exist
        }
      }

      return NextResponse.json({ entries: roots, currentPath: '' })
    }

    // Resolve real path to prevent symlink/.. traversal
    let resolvedPath: string
    try {
      resolvedPath = await realpath(folderPath)
    } catch {
      return NextResponse.json({ error: `Path not found: "${folderPath}"` }, { status: 404 })
    }

    // Security: only allow browsing within allowed roots
    if (!isPathAllowed(resolvedPath)) {
      return NextResponse.json({ error: 'Access denied: path outside allowed directories' }, { status: 403 })
    }

    const entries = await readdir(resolvedPath, { withFileTypes: true })

    const folders: FolderEntry[] = entries
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({
        name: e.name,
        path: path.join(resolvedPath, e.name),
        isDirectory: true,
      }))

    // Compute parent path — stop at allowed roots
    const parentPath = path.dirname(resolvedPath)
    const hasParent = parentPath !== resolvedPath && isPathAllowed(parentPath)

    return NextResponse.json({
      entries: folders,
      currentPath: resolvedPath,
      parentPath: hasParent ? parentPath : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to browse folder'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
