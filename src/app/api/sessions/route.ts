import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getRecentSessions, createSession } from '@/lib/db/queries'

export async function GET() {
  try {
    const db = getDb()
    const sessions = getRecentSessions(db)
    return NextResponse.json({ sessions })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch sessions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, image_count, source_path, selected_paths, current_step } = body

    if (!name) {
      return NextResponse.json({ error: 'Session name is required' }, { status: 400 })
    }

    const db = getDb()
    const session = createSession(db, {
      name,
      image_count: image_count || 0,
      source_path,
      current_step,
      config: selected_paths ? JSON.stringify({ selected_paths }) : undefined,
    })

    return NextResponse.json({ session }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
