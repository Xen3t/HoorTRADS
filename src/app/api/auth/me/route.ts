import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hoortrad_session')?.value
  if (!token) return NextResponse.json({ user: null }, { status: 401 })

  const user = getSession(token)
  if (!user) return NextResponse.json({ user: null }, { status: 401 })

  return NextResponse.json({ user })
}
