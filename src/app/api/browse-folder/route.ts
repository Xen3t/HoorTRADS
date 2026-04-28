import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat, realpath } from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface FolderEntry {
  name: string
  path: string
  isDirectory: boolean
  label?: string | null
  driveType?: string | null
  uncPath?: string | null
}

// Scan all letters A-Z and keep only those where a drive is mounted
const ALL_DRIVE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const ALLOWED_USER_FOLDERS = ['Desktop', 'Downloads', 'Documents']

// DriveType values from Win32_LogicalDisk:
// 2=Removable, 3=Local, 4=Network, 5=CD-ROM
const DRIVE_TYPE_LABEL: Record<number, string> = {
  2: 'Amovible',
  3: 'Local',
  4: 'Réseau',
  5: 'CD/DVD',
}

interface DriveInfo {
  letter: string
  label: string | null
  uncPath: string | null
  driveType: number
}

async function getAvailableDrives(): Promise<DriveInfo[]> {
  // Fallback: just check which letters exist on disk
  const letters: string[] = []
  await Promise.all(
    ALL_DRIVE_LETTERS.map(async (letter) => {
      try {
        await stat(`${letter}:\\`)
        letters.push(letter)
      } catch { /* drive not mounted */ }
    })
  )

  // On Windows, query Win32_LogicalDisk via PowerShell to get labels + UNC paths for network drives
  if (process.platform === 'win32') {
    try {
      const cmd = 'powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_LogicalDisk | Select-Object DeviceID, VolumeName, ProviderName, DriveType | ConvertTo-Json -Compress"'
      const { stdout } = await execAsync(cmd, { timeout: 5000 })
      const raw = stdout.trim()
      if (raw) {
        const parsed = JSON.parse(raw) as
          | { DeviceID?: string; VolumeName?: string; ProviderName?: string; DriveType?: number }
          | Array<{ DeviceID?: string; VolumeName?: string; ProviderName?: string; DriveType?: number }>
        const list = Array.isArray(parsed) ? parsed : [parsed]
        const drives: DriveInfo[] = list
          .filter((d) => d.DeviceID)
          .map((d) => ({
            letter: (d.DeviceID as string).replace(':', ''),
            label: d.VolumeName || null,
            uncPath: d.ProviderName || null,
            driveType: d.DriveType ?? 3,
          }))
          .sort((a, b) => a.letter.localeCompare(b.letter))
        if (drives.length > 0) return drives
      }
    } catch { /* fall back to plain letters */ }
  }

  return letters.sort().map((letter) => ({ letter, label: null, uncPath: null, driveType: 3 }))
}

function isUncPath(p: string): boolean {
  return /^\\\\[^\\]+\\[^\\]+/.test(p) || /^\/\/[^/]+\/[^/]+/.test(p)
}

function isPathAllowed(resolvedPath: string): boolean {
  // Allow any drive letter (A-Z) and any UNC network path
  const normalized = resolvedPath.replace(/\\/g, '/').toLowerCase()
  // Drive letter path: e.g. "c:/users/..." or "z:/data/..."
  if (/^[a-z]:\//i.test(normalized)) return true
  // UNC path: "//server/share/..."
  if (/^\/\/[^/]+\/[^/]+/.test(normalized)) return true
  // User folders (Desktop, Downloads, Documents) — relative to home
  const home = os.homedir().replace(/\\/g, '/').toLowerCase()
  if (normalized.startsWith(home + '/')) return true
  return false
}

export async function GET(request: NextRequest) {
  try {
    const folderPath = request.nextUrl.searchParams.get('path')

    // If no path provided, return common root locations (Windows drives + user folders)
    if (!folderPath) {
      const roots: FolderEntry[] = []

      // Add all available Windows drives (including network drives mapped as letters)
      const drives = await getAvailableDrives()
      for (const d of drives) {
        const typeLabel = DRIVE_TYPE_LABEL[d.driveType] || 'Disque'
        // For network drives, extract the share name from the UNC path (e.g. "\\SATURNE004\Media_Speed_1$" → "Media Speed 1")
        // For local drives, fall back to the volume label.
        let friendly: string | null = null
        if (d.uncPath) {
          const match = d.uncPath.match(/\\\\[^\\]+\\(.+)/)
          if (match) {
            friendly = match[1].replace(/\$$/, '').replace(/_/g, ' ').trim()
          }
        }
        if (!friendly) friendly = d.label
        const displayName = friendly ? `${d.letter}:\\  ${friendly}` : `${d.letter}:\\`
        roots.push({
          name: displayName,
          path: `${d.letter}:\\`,
          isDirectory: true,
          label: friendly,
          driveType: typeLabel,
          uncPath: d.uncPath,
        })
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
    // For UNC paths, realpath can fail on some systems — fall back to normalized path
    let resolvedPath: string
    try {
      resolvedPath = await realpath(folderPath)
    } catch {
      if (isUncPath(folderPath)) {
        // UNC path: verify it's accessible via stat, then use it as-is
        try {
          const s = await stat(folderPath)
          if (!s.isDirectory()) return NextResponse.json({ error: 'Not a directory' }, { status: 400 })
          resolvedPath = path.normalize(folderPath)
        } catch {
          return NextResponse.json({ error: `Chemin réseau inaccessible : "${folderPath}"` }, { status: 404 })
        }
      } else {
        return NextResponse.json({ error: `Chemin introuvable : "${folderPath}"` }, { status: 404 })
      }
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
