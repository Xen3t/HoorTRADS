'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

/**
 * Legacy URL — redirects to the editable text-review page so the user can
 * modify translations and relaunch generation, even on a session already done.
 */
export default function TranslationsRedirect() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  useEffect(() => {
    router.replace(`/campaign/${sessionId}/text-review`)
  }, [sessionId, router])

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-text-secondary text-sm">Redirection...</p>
    </main>
  )
}
