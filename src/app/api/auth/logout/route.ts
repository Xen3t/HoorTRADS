import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hoortrad_session')?.value
  if (token) deleteSession(token)

  const response = NextResponse.json({ success: true })
  response.cookies.set('hoortrad_session', '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}
