import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db/database'
import { getSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('hoortrad_session')?.value
    const authUser = token ? getSession(token) : null

    const body = await request.json()
    const { message, category, page_url } = body
    if (!message || typeof message !== 'string' || message.trim().length < 3) {
      return NextResponse.json({ error: 'Message requis (min 3 caractères)' }, { status: 400 })
    }

    const db = getDb()
    db.prepare(`
      INSERT INTO feedback (id, user_id, user_email, category, message, page_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      authUser?.id || null,
      authUser?.email || null,
      (typeof category === 'string' && category.trim()) ? category.trim() : 'general',
      message.trim().slice(0, 5000),
      typeof page_url === 'string' ? page_url.slice(0, 500) : null,
    )

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('hoortrad_session')?.value
    const authUser = token ? getSession(token) : null
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const db = getDb()
    const rows = db.prepare(`
      SELECT id, user_id, user_email, category, message, page_url, created_at, status
      FROM feedback
      ORDER BY created_at DESC
      LIMIT 200
    `).all()

    return NextResponse.json({ feedback: rows })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get('hoortrad_session')?.value
    const authUser = token ? getSession(token) : null
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const all = url.searchParams.get('all')

    const db = getDb()
    if (all === '1') {
      const info = db.prepare('DELETE FROM feedback').run()
      return NextResponse.json({ success: true, deleted: info.changes })
    }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const info = db.prepare('DELETE FROM feedback WHERE id = ?').run(id)
    if (info.changes === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
