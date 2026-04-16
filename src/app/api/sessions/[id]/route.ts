import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getSessionById, updateSession } from '@/lib/db/queries'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    const session = getSessionById(db, id)

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({ session })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Only these fields can be updated via PATCH
const ALLOWED_PATCH_FIELDS = ['name', 'status', 'image_count', 'market_count', 'current_step', 'source_path', 'config'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const db = getDb()

    const existing = getSessionById(db, id)
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Filter body to only allowed fields
    const filtered: Record<string, unknown> = {}
    for (const key of ALLOWED_PATCH_FIELDS) {
      if (key in body) filtered[key] = body[key]
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    updateSession(db, id, filtered)
    const updated = getSessionById(db, id)

    return NextResponse.json({ session: updated })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getDb()

    const existing = getSessionById(db, id)
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    db.prepare('DELETE FROM generation_task_versions WHERE task_id IN (SELECT id FROM generation_tasks WHERE job_id IN (SELECT id FROM generation_jobs WHERE session_id = ?))').run(id)
    db.prepare('DELETE FROM generation_tasks WHERE job_id IN (SELECT id FROM generation_jobs WHERE session_id = ?)').run(id)
    db.prepare('DELETE FROM generation_jobs WHERE session_id = ?').run(id)
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
