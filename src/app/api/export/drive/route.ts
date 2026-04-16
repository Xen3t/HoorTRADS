import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    // Google Drive export — not yet implemented
    // Requires OAuth2 setup with Google Drive API
    return NextResponse.json(
      {
        error: 'Google Drive export is not yet configured. Please set up OAuth2 credentials in admin settings.',
        requiresSetup: true,
      },
      { status: 501 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Drive export failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
