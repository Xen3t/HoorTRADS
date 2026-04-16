import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import path from 'path'
import os from 'os'

interface FolderEntry {
  name: string
  path: string
  isDirectory: boolean
}

export async function GET(request: NextRequest) {
  try {
    const folderPath = request.nextUrl.searchParams.get('path')

    // If no path provided, return common root locations (Windows drives + user folders)
    if (!folderPath) {
      const roots: FolderEntry[] = []

      // Add Windows drives
      for (const letter of ['C', 'D', 'E', 'O', 'Z']) {
        try {
          await stat(`${letter}:\\`)
          roots.push({ name: `${letter}:\\`, path: `${letter}:\\`, isDirectory: true })
        } catch {
          // Drive doesn't exist
        }
      }

      // Add user Desktop and Downloads
      const home = os.homedir()
      const userFolders = ['Desktop', 'Downloads', 'Documents']
      for (const folder of userFolders) {
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

    // Read the requested directory
    try {
      await stat(folderPath)
    } catch {
      return NextResponse.json({ error: `Path not found: "${folderPath}"` }, { status: 404 })
    }

    const entries = await readdir(folderPath, { withFileTypes: true })

    const folders: FolderEntry[] = entries
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({
        name: e.name,
        path: path.join(folderPath, e.name),
        isDirectory: true,
      }))

    // Compute parent path
    const parentPath = path.dirname(folderPath)
    const hasParent = parentPath !== folderPath

    return NextResponse.json({
      entries: folders,
      currentPath: folderPath,
      parentPath: hasParent ? parentPath : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to browse folder'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
