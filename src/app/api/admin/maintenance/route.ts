import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getAppConfig, setAppConfig } from '@/lib/db/queries'
import { getSession, getUserByEmail, verifyPassword } from '@/lib/auth'

export async function GET() {
  const db = getDb()
  const value = getAppConfig(db, 'maintenance_mode')
  return NextResponse.json({ enabled: value === 'true' })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const db = getDb()

  // Toggle from admin panel (requires valid admin session)
  if ('enabled' in body) {
    const token = request.cookies.get('hoortrad_session')?.value
    const user = token ? getSession(token) : null
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
    setAppConfig(db, 'maintenance_mode', body.enabled ? 'true' : 'false')
    return NextResponse.json({ success: true, enabled: body.enabled })
  }

  // Disable from maintenance page (requires valid admin credentials)
  if ('email' in body && 'password' in body) {
    const dbUser = getUserByEmail(body.email)
    if (!dbUser || dbUser.role !== 'admin' || !verifyPassword(body.password, dbUser.password_hash)) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 })
    }
    setAppConfig(db, 'maintenance_mode', 'false')
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
}
