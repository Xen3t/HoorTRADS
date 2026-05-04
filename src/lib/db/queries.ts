import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { Session, CreateSessionInput } from '@/types/session'

export function getRecentSessions(db: Database.Database, limit = 10, userId?: string | null): Session[] {
  if (userId) {
    const stmt = db.prepare('SELECT * FROM sessions WHERE user_id = ? AND (archived IS NULL OR archived = 0) ORDER BY rowid DESC LIMIT ?')
    return stmt.all(userId, limit) as Session[]
  }
  const stmt = db.prepare('SELECT * FROM sessions WHERE (archived IS NULL OR archived = 0) ORDER BY rowid DESC LIMIT ?')
  return stmt.all(limit) as Session[]
}

export function getArchivedSessions(db: Database.Database, userId?: string | null): Session[] {
  if (userId) {
    const stmt = db.prepare('SELECT * FROM sessions WHERE user_id = ? AND archived = 1 ORDER BY rowid DESC')
    return stmt.all(userId) as Session[]
  }
  const stmt = db.prepare('SELECT * FROM sessions WHERE archived = 1 ORDER BY rowid DESC')
  return stmt.all() as Session[]
}

export function createSession(db: Database.Database, input: CreateSessionInput): Session {
  const id = randomUUID()
  const now = new Date().toISOString()

  const stmt = db.prepare(`
    INSERT INTO sessions (id, name, created_at, updated_at, status, image_count, market_count, current_step, source_path, config, user_id)
    VALUES (?, ?, ?, ?, 'draft', ?, 0, ?, ?, NULL, ?)
  `)

  stmt.run(
    id,
    input.name,
    now,
    now,
    input.image_count,
    input.current_step || 'configure',
    input.source_path || null,
    input.user_id || null
  )

  if (input.config) {
    db.prepare('UPDATE sessions SET config = ? WHERE id = ?').run(input.config, id)
  }

  return getSessionById(db, id) as Session
}

export function getSessionById(db: Database.Database, id: string): Session | null {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?')
  return (stmt.get(id) as Session) || null
}

export function getAppConfig(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setAppConfig(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value)
}

export function updateSession(
  db: Database.Database,
  id: string,
  data: Partial<Omit<Session, 'id' | 'created_at'>>
): void {
  const fields: string[] = []
  const values: unknown[] = []

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.status !== undefined) {
    fields.push('status = ?')
    values.push(data.status)
  }
  if (data.image_count !== undefined) {
    fields.push('image_count = ?')
    values.push(data.image_count)
  }
  if (data.market_count !== undefined) {
    fields.push('market_count = ?')
    values.push(data.market_count)
  }
  if (data.current_step !== undefined) {
    fields.push('current_step = ?')
    values.push(data.current_step)
  }
  if (data.source_path !== undefined) {
    fields.push('source_path = ?')
    values.push(data.source_path)
  }
  if (data.config !== undefined) {
    fields.push('config = ?')
    values.push(data.config)
  }
  if (data.archived !== undefined) {
    fields.push('archived = ?')
    values.push(data.archived)
  }

  if (fields.length === 0) return

  fields.push("updated_at = datetime('now')")

  const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`)
  stmt.run(...values, id)
}
