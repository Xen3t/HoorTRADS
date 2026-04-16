import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db/database'

export async function GET() {
  try {
    const db = getDb()
    const terms = db.prepare('SELECT * FROM glossary ORDER BY language_code, term_source').all()
    return NextResponse.json({ terms })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { term_source, term_target, language_code } = await request.json()
    if (!term_source?.trim() || !term_target?.trim() || !language_code) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    const db = getDb()
    const id = randomUUID()
    db.prepare(
      'INSERT INTO glossary (id, term_source, term_target, language_code) VALUES (?, ?, ?, ?)'
    ).run(id, term_source.trim(), term_target.trim(), language_code)
    const term = db.prepare('SELECT * FROM glossary WHERE id = ?').get(id)
    return NextResponse.json({ term })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
