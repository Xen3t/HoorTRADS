import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const REPORTS_DIR = path.join(process.cwd(), 'rapports')

interface ReportData {
  kpis?: { images?: number; failures?: number; regenSource?: number; regenCorr?: number }
  quality?: { firstPass?: number; firstPassTotal?: number }
  cost?: string | null
}

function extractReportData(html: string): ReportData | null {
  try {
    const match = html.match(/const D = (\{[\s\S]*?\});\s*\/\/ ╚/)
    if (!match) return null
    return JSON.parse(match[1]) as ReportData
  } catch {
    return null
  }
}

function validateFileName(name: string): boolean {
  return !!(name && name.endsWith('.html') && !name.includes('..') && !name.includes('/') && !name.includes('\\'))
}

export async function DELETE(req: NextRequest) {
  const { file } = await req.json()
  if (!validateFileName(file)) return new NextResponse('Invalid file', { status: 400 })
  const filePath = path.join(REPORTS_DIR, file)
  if (!fs.existsSync(filePath)) return new NextResponse('Not found', { status: 404 })
  fs.unlinkSync(filePath)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const { file, newName } = await req.json()
  if (!validateFileName(file) || !validateFileName(newName)) return new NextResponse('Invalid file', { status: 400 })
  const oldPath = path.join(REPORTS_DIR, file)
  const newPath = path.join(REPORTS_DIR, newName)
  if (!fs.existsSync(oldPath)) return new NextResponse('Not found', { status: 404 })
  if (fs.existsSync(newPath)) return new NextResponse('Name already taken', { status: 409 })
  fs.renameSync(oldPath, newPath)
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file')

  if (file) {
    if (file.includes('..') || file.includes('/') || file.includes('\\') || !file.endsWith('.html')) {
      return new NextResponse('Invalid file', { status: 400 })
    }
    const filePath = path.join(REPORTS_DIR, file)
    if (!fs.existsSync(filePath)) return new NextResponse('Not found', { status: 404 })
    const content = fs.readFileSync(filePath, 'utf-8')
    return new NextResponse(content, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  if (!fs.existsSync(REPORTS_DIR)) {
    return NextResponse.json({ reports: [], stats: null })
  }

  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => {
      const stat = fs.statSync(path.join(REPORTS_DIR, f))
      return { name: f, createdAt: stat.birthtime.toISOString(), size: stat.size }
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  let totalImages = 0
  let totalFailures = 0
  let totalRegenSource = 0
  let totalRegenCorr = 0
  let totalFirstPass = 0
  let totalFirstPassBase = 0
  for (const f of files) {
    const html = fs.readFileSync(path.join(REPORTS_DIR, f.name), 'utf-8')
    const data = extractReportData(html)
    if (!data) continue
    totalImages += data.kpis?.images ?? 0
    totalFailures += data.kpis?.failures ?? 0
    totalRegenSource += data.kpis?.regenSource ?? 0
    totalRegenCorr += data.kpis?.regenCorr ?? 0
    totalFirstPass += data.quality?.firstPass ?? 0
    totalFirstPassBase += data.quality?.firstPassTotal ?? 0
  }

  const firstPassPct = totalFirstPassBase > 0
    ? Math.round((totalFirstPass / totalFirstPassBase) * 100)
    : null

  return NextResponse.json({
    reports: files,
    stats: {
      totalImages,
      totalFailures,
      totalRegenSource,
      totalRegenCorr,
      firstPassPct,
      firstPass: totalFirstPass,
      firstPassTotal: totalFirstPassBase,
      totalCost: (totalImages * 0.10).toFixed(2).replace('.', ',') + ' €',
    },
  })
}
