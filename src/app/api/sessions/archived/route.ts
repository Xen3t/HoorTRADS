import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getArchivedSessions } from '@/lib/db/queries'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('hoortrad_session')?.value
    const authUser = token ? getSession(token) : null
    if (!authUser) return NextResponse.json({ sessions: [] })
    const db = getDb()
    const sessions = getArchivedSessions(db, authUser.id)
    return NextResponse.json({ sessions })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch archived sessions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
