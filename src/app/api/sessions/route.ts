import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getRecentSessions, createSession } from '@/lib/db/queries'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('hoortrad_session')?.value
    const authUser = token ? getSession(token) : null
    if (!authUser) return NextResponse.json({ sessions: [] })
    const db = getDb()
    const sessions = getRecentSessions(db, 10, authUser.id)
    return NextResponse.json({ sessions })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch sessions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, image_count, source_path, selected_paths, current_step, configFileName, configFileContent } = body

    if (!name) {
      return NextResponse.json({ error: 'Session name is required' }, { status: 400 })
    }

    const token = request.cookies.get('hoortrad_session')?.value
    const authUser = token ? getSession(token) : null

    const db = getDb()
    const session = createSession(db, {
      name,
      image_count: image_count || 0,
      source_path,
      current_step,
      user_id: authUser?.id || null,
      config: (selected_paths || configFileName)
        ? JSON.stringify({
            ...(selected_paths ? { selected_paths } : {}),
            ...(configFileName ? { configFileName, configFileContent } : {}),
          })
        : undefined,
    })

    return NextResponse.json({ session }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
