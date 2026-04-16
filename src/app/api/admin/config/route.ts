import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getAppConfig, setAppConfig } from '@/lib/db/queries'

const CONFIG_KEYS = [
  'gemini_api_key',
  'verification_provider',
  'verification_api_key',
  'drive_client_id',
  'drive_client_secret',
]

export async function GET() {
  try {
    const db = getDb()
    const config: Record<string, string> = {}
    for (const key of CONFIG_KEYS) {
      const value = getAppConfig(db, key)
      if (value !== null) config[key] = value
    }
    return NextResponse.json({ config })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const db = getDb()

    for (const key of CONFIG_KEYS) {
      if (key in body && typeof body[key] === 'string') {
        setAppConfig(db, key, body[key])
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
