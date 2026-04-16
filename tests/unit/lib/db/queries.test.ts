import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from '@/lib/db/database'
import { getRecentSessions, createSession, getSessionById, updateSession } from '@/lib/db/queries'

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
})

describe('createSession', () => {
  it('creates a session and returns it', () => {
    const session = createSession(db, {
      name: 'Summer Sale',
      image_count: 15,
      source_path: 'C:\\Campaigns\\Summer',
    })

    expect(session.id).toBeDefined()
    expect(session.name).toBe('Summer Sale')
    expect(session.image_count).toBe(15)
    expect(session.status).toBe('draft')
    expect(session.source_path).toBe('C:\\Campaigns\\Summer')
  })
})

describe('getSessionById', () => {
  it('returns session when exists', () => {
    const created = createSession(db, { name: 'Test', image_count: 5 })
    const found = getSessionById(db, created.id)
    expect(found?.name).toBe('Test')
  })

  it('returns null when not found', () => {
    expect(getSessionById(db, 'nonexistent')).toBeNull()
  })
})

describe('getRecentSessions', () => {
  it('returns sessions sorted by most recent', () => {
    createSession(db, { name: 'First', image_count: 1 })
    createSession(db, { name: 'Second', image_count: 2 })
    createSession(db, { name: 'Third', image_count: 3 })

    const sessions = getRecentSessions(db)
    expect(sessions.length).toBe(3)
    expect(sessions[0].name).toBe('Third')
  })

  it('respects limit', () => {
    createSession(db, { name: 'A', image_count: 1 })
    createSession(db, { name: 'B', image_count: 2 })
    createSession(db, { name: 'C', image_count: 3 })

    const sessions = getRecentSessions(db, 2)
    expect(sessions.length).toBe(2)
  })

  it('returns empty array when no sessions', () => {
    expect(getRecentSessions(db)).toEqual([])
  })
})

describe('updateSession', () => {
  it('updates session fields', () => {
    const session = createSession(db, { name: 'Original', image_count: 5 })
    updateSession(db, session.id, { name: 'Updated', market_count: 18 })

    const updated = getSessionById(db, session.id)
    expect(updated?.name).toBe('Updated')
    expect(updated?.market_count).toBe(18)
  })

  it('updates status', () => {
    const session = createSession(db, { name: 'Test', image_count: 1 })
    updateSession(db, session.id, { status: 'generating' })

    const updated = getSessionById(db, session.id)
    expect(updated?.status).toBe('generating')
  })
})
