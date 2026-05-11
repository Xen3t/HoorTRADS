'use client'

import { useState, useEffect } from 'react'

interface ChangelogRelease {
  id: string
  date: string
  entries: { type: string; text: string }[]
}

export default function ChangelogBadge() {
  const [hasNew, setHasNew] = useState(false)
  const [latestId, setLatestId] = useState<string | null>(null)
  const [latestDate, setLatestDate] = useState<string | null>(null)

  useEffect(() => {
    fetch('/changelog.json')
      .then((r) => r.json())
      .then((data: ChangelogRelease[]) => {
        if (!data || data.length === 0) return
        const latest = data[0]
        setLatestId(latest.id)
        setLatestDate(latest.date)
        const seen = localStorage.getItem('hoortrad_seen_changelog')
        if (seen !== latest.id) setHasNew(true)
      })
      .catch(() => {})
  }, [])

  const dismiss = () => {
    if (latestId) localStorage.setItem('hoortrad_seen_changelog', latestId)
    setHasNew(false)
  }

  // Écoute l'événement émis par la cloche quand l'utilisateur clique ×
  useEffect(() => {
    const handler = () => setHasNew(false)
    window.addEventListener('changelog-dismissed', handler)
    return () => window.removeEventListener('changelog-dismissed', handler)
  }, [])

  if (!latestDate) return null

  const dateLabel = `Mis à jour le ${new Date(latestDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`

  return (
    <a
      href="/changelog"
      onClick={dismiss}
      className="inline-flex items-center gap-1 text-[11px] text-text-disabled hover:text-text-secondary transition-colors group"
    >
      {hasNew && <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse shrink-0" />}
      <span className={hasNew ? 'text-brand-green font-semibold' : ''}>
        {hasNew ? `Mise à jour — ${dateLabel.replace('Mis à jour le ', '')}` : dateLabel}
      </span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40 group-hover:opacity-80 transition-opacity">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </a>
  )
}
