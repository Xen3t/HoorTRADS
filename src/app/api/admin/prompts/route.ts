import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getAppConfig, setAppConfig } from '@/lib/db/queries'

const PROMPT_KEYS = [
  'base_prompt',
  'prompt_precision_filter',
  'prompt_google_extract',
  'prompt_google_translate',
  'prompt_google_render',
] as const

export async function GET() {
  try {
    const db = getDb()
    const prompts: Record<string, string | null> = {}
    for (const key of PROMPT_KEYS) {
      prompts[key] = getAppConfig(db, key)
    }
    return NextResponse.json({ prompts })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const db = getDb()
    for (const key of PROMPT_KEYS) {
      if (key in body && typeof body[key] === 'string') {
        setAppConfig(db, key, body[key].trim())
      }
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
