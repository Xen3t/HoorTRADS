import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

function isUncPath(p: string): boolean {
  return /^\\\\[^\\]+\\[^\\]+/.test(p) || /^\/\/[^/]+\/[^/]+/.test(p)
}

function applyDriveLetterMap(inputPath: string): string {
  const raw = process.env.DRIVE_LETTER_MAP || ''
  const map: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const eqIdx = entry.indexOf('=')
    if (eqIdx === -1) continue
    const letter = entry.slice(0, eqIdx).trim().toUpperCase().replace(/:$/, '')
    const unc = entry.slice(eqIdx + 1).trim()
    if (letter && unc) map[letter] = unc
  }
  const match = inputPath.match(/^([A-Za-z]):[/\\](.*)$/)
  if (match) {
    const letter = match[1].toUpperCase()
    if (map[letter]) {
      const rest = match[2].replace(/\//g, '\\')
      return rest ? `${map[letter]}\\${rest}` : map[letter]
    }
  }
  return inputPath
}

function isPathAllowed(absPath: string, generatedDir: string): boolean {
  // Always allow our own generated images
  if (absPath.startsWith(generatedDir)) return true

  const normalized = absPath.replace(/\\/g, '/').toLowerCase()
  // Any drive letter path (C:\, M:\, Z:\, etc.)
  if (/^[a-z]:\//i.test(normalized)) return true
  // UNC network path
  if (/^\/\/[^/]+\/[^/]+/.test(normalized)) return true
  // User home folder
  const home = os.homedir().replace(/\\/g, '/').toLowerCase()
  if (normalized.startsWith(home + '/')) return true
  return false
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path')

  if (!filePath) {
    return NextResponse.json({ error: 'Path required' }, { status: 400 })
  }

  const effectivePath = applyDriveLetterMap(filePath)
  const generatedDir = path.join(process.cwd(), 'data', 'generated')

  if (!fs.existsSync(effectivePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Resolve real path — fall back to normalized for UNC paths (realpath can fail on some)
  let resolved: string
  try {
    resolved = fs.realpathSync(effectivePath)
  } catch {
    if (isUncPath(effectivePath)) {
      resolved = path.normalize(effectivePath)
    } else {
      return NextResponse.json({ error: 'Cannot resolve path' }, { status: 404 })
    }
  }

  if (!isPathAllowed(resolved, generatedDir)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const ext = path.extname(resolved).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }

  const isDownload = request.nextUrl.searchParams.get('download') === '1'
  const filename = path.basename(resolved)
  const buffer = fs.readFileSync(resolved)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeTypes[ext] || 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
      ...(isDownload ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
    },
  })
}
