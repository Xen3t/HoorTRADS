import { NextRequest, NextResponse } from 'next/server'
import { getSession, listUsers, createUser, deleteUser, updateUserRole, changePassword } from '@/lib/auth'

function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('hoortrad_session')?.value
  if (!token) return null
  const user = getSession(token)
  if (!user || user.role !== 'admin') return null
  return user
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  return NextResponse.json({ users: listUsers() })
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  try {
    const { email, name, password, role } = await request.json()
    if (!email || !name || !password) return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    const user = createUser(email, name, password, role || 'graphiste')
    return NextResponse.json({ user })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg.includes('UNIQUE')) return NextResponse.json({ error: 'Email déjà utilisé' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  try {
    const { userId, role, password } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 })
    if (role) updateUserRole(userId, role)
    if (password) changePassword(userId, password)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const admin = requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 })
    if (userId === admin.id) return NextResponse.json({ error: 'Impossible de supprimer votre propre compte' }, { status: 400 })
    deleteUser(userId)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
