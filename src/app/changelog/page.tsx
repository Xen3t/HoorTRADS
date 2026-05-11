'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'

interface ChangelogEntry {
  type: 'feature' | 'fix' | 'removed'
  text: string
}

interface ChangelogRelease {
  id: string
  date: string
  entries: ChangelogEntry[]
}

const TYPE_CONFIG: Record<ChangelogEntry['type'], { label: string; color: string; dot: string }> = {
  feature: { label: 'Nouveauté', color: 'bg-brand-green-light text-brand-green', dot: 'bg-brand-green' },
  fix:     { label: 'Correctif', color: 'bg-blue-50 text-blue-600',             dot: 'bg-blue-400' },
  removed: { label: 'Suppression', color: 'bg-red-50 text-brand-red',           dot: 'bg-brand-red' },
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export default function ChangelogPage() {
  const [releases, setReleases] = useState<ChangelogRelease[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/changelog.json')
      .then((r) => r.json())
      .then((data) => setReleases(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (releases.length > 0) {
      localStorage.setItem('hoortrad_seen_changelog', releases[0].id)
    }
  }, [releases])

  return (
    <main className="min-h-screen px-8 pt-12 pb-16">
      <div className="w-full max-w-[600px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-text-disabled hover:text-text-secondary transition-colors mb-6"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Accueil
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">Historique des mises à jour</h1>
          <p className="text-sm text-text-secondary mt-1">Ce qui a changé dans HoorTRADS</p>
        </motion.div>

        {loading ? (
          <p className="text-sm text-text-disabled text-center py-12">Chargement...</p>
        ) : releases.length === 0 ? (
          <p className="text-sm text-text-disabled text-center py-12">Aucune mise à jour enregistrée.</p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-8">
              {releases.map((release, i) => (
                <motion.div
                  key={release.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="pl-6 relative"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full bg-brand-green border-2 border-white shadow-sm" />

                  <p className="text-xs font-semibold text-text-disabled mb-3">{formatDate(release.date)}</p>

                  <div className="space-y-2">
                    {release.entries.map((entry, j) => {
                      const cfg = TYPE_CONFIG[entry.type]
                      return (
                        <div key={j} className="flex items-start gap-3 bg-white rounded-[10px] px-4 py-3 shadow-sm">
                          <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          <p className="text-sm text-text-primary leading-snug">{entry.text}</p>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
