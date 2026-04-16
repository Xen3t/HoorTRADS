import { NextRequest, NextResponse } from 'next/server'
import { getSession, verifyPassword, changePassword } from '@/lib/auth'
import { getDb } from '@/lib/db/database'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hoortrad_session')?.value
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const user = getSession(token)
  if (!user) return NextResponse.json({ error: 'Session invalide' }, { status: 401 })

  try {
    const { currentPassword, newPassword } = await request.json()
    if (!currentPassword || !newPassword) return NextResponse.json({ error: 'Champs requis' }, { status: 400 })
    if (newPassword.length < 4) return NextResponse.json({ error: 'Minimum 4 caractères' }, { status: 400 })

    const db = getDb()
    const fullUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string } | undefined
    if (!fullUser || !verifyPassword(currentPassword, fullUser.password_hash)) {
      return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 401 })
    }

    changePassword(user.id, newPassword)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
