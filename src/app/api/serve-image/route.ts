import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path')

  if (!filePath) {
    return NextResponse.json({ error: 'Path required' }, { status: 400 })
  }

  // Security: only serve from data/generated — use realpath to resolve symlinks
  const generatedDir = path.join(process.cwd(), 'data', 'generated')

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const resolved = fs.realpathSync(filePath)

  if (!resolved.startsWith(generatedDir)) {
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
