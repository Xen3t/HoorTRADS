import crypto from 'crypto'
import { getDb } from '@/lib/db/database'

export type UserRole = 'admin' | 'graphiste'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
}

// ── Password hashing with Node built-in crypto ──────────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'))
}

// ── Session management ───────────────────────────────────────────────────────

const SESSION_DURATION_DAYS = 30

export function createSession(userId: string): string {
  const db = getDb()
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS)

  db.prepare(`
    INSERT INTO auth_sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, userId, expiresAt.toISOString())

  return token
}

export function getSession(token: string): AuthUser | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as AuthUser | undefined
  return row ?? null
}

export function deleteSession(token: string): void {
  const db = getDb()
  db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token)
}

// ── User management ──────────────────────────────────────────────────────────

export function createUser(email: string, name: string, password: string, role: UserRole = 'graphiste'): AuthUser {
  const db = getDb()
  const id = crypto.randomUUID()
  const passwordHash = hashPassword(password)
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase().trim(), name.trim(), passwordHash, role)
  return { id, email: email.toLowerCase().trim(), name: name.trim(), role }
}

export function getUserByEmail(email: string): { id: string; email: string; name: string; role: UserRole; password_hash: string } | null {
  const db = getDb()
  const row = db.prepare('SELECT id, email, name, role, password_hash FROM users WHERE email = ?').get(email.toLowerCase().trim()) as {
    id: string; email: string; name: string; role: UserRole; password_hash: string
  } | undefined
  return row ?? null
}

export function listUsers(): { id: string; email: string; name: string; role: UserRole; created_at: string }[] {
  const db = getDb()
  return db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC').all() as {
    id: string; email: string; name: string; role: UserRole; created_at: string
  }[]
}

export function deleteUser(userId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM users WHERE id = ?').run(userId)
}

export function updateUserRole(userId: string, role: UserRole): void {
  const db = getDb()
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId)
}

export function changePassword(userId: string, newPassword: string): void {
  const db = getDb()
  const hash = hashPassword(newPassword)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId)
}

// ── Seed initial admin if no users exist ────────────────────────────────────

export function seedInitialAdmin(): void {
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  if (count > 0) return

  const email = process.env.INITIAL_ADMIN_EMAIL
  const password = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD

  if (email && password) {
    createUser(email, 'Admin', password, 'admin')
  }
}
