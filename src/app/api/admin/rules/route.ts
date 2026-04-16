import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db/database'

export async function GET() {
  try {
    const db = getDb()
    const rules = db.prepare('SELECT * FROM language_rules ORDER BY language_code, created_at').all()
    return NextResponse.json({ rules })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { language_code, rule } = await request.json()
    if (!rule?.trim() || !language_code) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    const db = getDb()
    const id = randomUUID()
    db.prepare(
      'INSERT INTO language_rules (id, language_code, rule) VALUES (?, ?, ?)'
    ).run(id, language_code, rule.trim())
    const created = db.prepare('SELECT * FROM language_rules WHERE id = ?').get(id)
    return NextResponse.json({ rule: created })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
