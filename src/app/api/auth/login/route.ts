import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail, verifyPassword, createSession, seedInitialAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // Seed initial admin on first call if needed
    seedInitialAdmin()

    const { email, password } = await request.json()

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
    }

    const user = getUserByEmail(email)
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 })
    }

    const token = createSession(user.id)

    const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
    response.cookies.set('hoortrad_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
