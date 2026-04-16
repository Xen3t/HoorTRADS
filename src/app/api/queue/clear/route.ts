import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'

// Marque une session comme "vue" — disparaît des notifications
export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()
    if (!sessionId) return NextResponse.json({ error: 'sessionId requis' }, { status: 400 })

    const db = getDb()
    db.prepare(`
      UPDATE sessions SET current_step = 'reviewing', updated_at = datetime('now')
      WHERE id = ? AND status = 'done' AND current_step = 'review'
    `).run(sessionId)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
