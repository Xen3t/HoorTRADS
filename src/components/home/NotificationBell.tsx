'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface QueueSession {
  id: string
  name: string
  status: string
  current_step: string
  job_id: string | null
  total_tasks: number | null
  completed_tasks: number | null
  failed_tasks: number | null
}

export default function NotificationBell() {
  const [sessions, setSessions] = useState<QueueSession[]>([])
  const [open, setOpen] = useState(false)
  const [clearing, setClearing] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const knownStatesRef = useRef<Map<string, string>>(new Map())

  const load = async () => {
    try {
      const res = await fetch('/api/queue')
      const data = await res.json()
      const next: QueueSession[] = data.sessions || []
      // Detect transitions from 'generating' → 'done' and trigger browser notification
      if (typeof window !== 'undefined' && 'Notification' in window) {
        for (const s of next) {
          const prev = knownStatesRef.current.get(s.id)
          if (prev === 'generating' && s.status === 'done' && Notification.permission === 'granted') {
            try {
              new Notification('HoorTRADS — génération terminée', {
                body: `${s.name} : ${s.completed_tasks ?? 0} visuels prêts à réviser`,
                icon: '/favicon.ico',
                tag: `hoortrad-${s.id}`,
              })
            } catch { /* ignore */ }
          }
          knownStatesRef.current.set(s.id, s.status)
        }
      } else {
        for (const s of next) knownStatesRef.current.set(s.id, s.status)
      }
      setSessions(next)
    } catch {}
  }

  useEffect(() => {
    // Request notification permission on mount (silent if already granted/denied)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    pollingRef.current = setInterval(() => { void load() }, 4000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clearOne = async (sessionId: string) => {
    setClearing(sessionId)
    await fetch('/api/queue/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {})
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    setClearing(null)
  }

  const clearAll = async () => {
    const doneSessions = sessions.filter((s) => s.status === 'done')
    await Promise.all(doneSessions.map((s) =>
      fetch('/api/queue/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: s.id }),
      }).catch(() => {})
    ))
    setSessions((prev) => prev.filter((s) => s.status !== 'done'))
  }

  const active = sessions.filter((s) => s.status === 'generating')
  const done = sessions.filter((s) => s.status === 'done')
  const count = sessions.length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center text-text-disabled hover:text-text-secondary transition-colors"
        title="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-red text-white text-[9px] font-bold flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-8 bg-white rounded-[16px] shadow-xl border border-border w-80 z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-xs font-bold text-text-primary">Activité</p>
              {done.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[10px] text-text-disabled hover:text-brand-red transition-colors"
                >
                  Tout effacer
                </button>
              )}
            </div>

            {sessions.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-text-disabled">Aucune activité</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-border">

                {active.map((s) => {
                  const pct = s.total_tasks && s.completed_tasks !== null
                    ? Math.round((s.completed_tasks / s.total_tasks) * 100)
                    : 0
                  return (
                    <div key={s.id} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          className="w-3 h-3 border-2 border-brand-green border-t-transparent rounded-full shrink-0"
                        />
                        <p className="text-xs font-semibold text-text-primary flex-1 truncate">{s.name}</p>
                        {s.job_id && (
                          <a
                            href={`/campaign/${s.id}/generate?jobId=${s.job_id}`}
                            className="text-[10px] text-brand-teal hover:text-brand-teal-hover shrink-0"
                          >
                            Voir →
                          </a>
                        )}
                      </div>
                      {s.total_tasks && s.completed_tasks !== null && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-brand-green rounded-full"
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                          <span className="text-[9px] text-text-disabled">{pct}%</span>
                        </div>
                      )}
                    </div>
                  )
                })}

                {done.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface group">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">{s.name}</p>
                      <p className="text-[10px] text-text-disabled">
                        {s.current_step === 'text-review' ? 'Traductions à valider' : `${s.completed_tasks ?? 0} images · visuels à réviser`}
                      </p>
                    </div>
                    <a
                      href={s.current_step === 'text-review' ? `/campaign/${s.id}/text-review` : `/campaign/${s.id}/review`}
                      className="text-[10px] text-brand-green font-bold hover:underline shrink-0"
                    >
                      {s.current_step === 'text-review' ? 'Traduire' : 'Réviser'}
                    </a>
                    <button
                      onClick={() => clearOne(s.id)}
                      disabled={clearing === s.id}
                      className="text-text-disabled hover:text-brand-red transition-colors text-sm opacity-0 group-hover:opacity-100 shrink-0"
                      title="Effacer"
                    >
                      ×
                    </button>
                  </div>
                ))}

              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
