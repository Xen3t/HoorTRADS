'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

interface QueueSession {
  id: string
  name: string
  status: string
  updated_at: string
  image_count: number
  market_count: number
  current_step: string
  job_id: string | null
  job_status: string | null
  total_tasks: number | null
  completed_tasks: number | null
  failed_tasks: number | null
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-brand-green rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] text-text-disabled shrink-0 w-8 text-right">{pct}%</span>
    </div>
  )
}

export default function QueuePage() {
  const [sessions, setSessions] = useState<QueueSession[]>([])
  const [loading, setLoading] = useState(true)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/queue')
      const data = await res.json()
      setSessions(data.sessions || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    pollingRef.current = setInterval(load, 3000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  const active = sessions.filter((s) => s.status === 'generating')
  const done = sessions.filter((s) => s.status === 'done')

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[700px] mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">File d&apos;attente</h1>
            <p className="text-sm text-text-secondary">Générations en cours et à réviser</p>
          </div>
          <Link href="/" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Accueil</Link>
        </div>

        {loading ? (
          <p className="text-center text-sm text-text-secondary py-16">Chargement...</p>
        ) : sessions.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <p className="text-4xl mb-4">✓</p>
            <p className="text-sm text-text-secondary">Aucune campagne en cours.</p>
          </motion.div>
        ) : (
          <div className="space-y-4">

            {active.length > 0 && (
              <section>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">En cours de génération</p>
                <div className="space-y-2">
                  <AnimatePresence>
                    {active.map((s) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="bg-white border border-brand-green/30 rounded-[12px] p-4 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                            className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">{s.name}</p>
                            <p className="text-[10px] text-text-disabled">
                              {s.completed_tasks ?? 0} / {s.total_tasks ?? '?'} images
                              {s.failed_tasks ? ` · ${s.failed_tasks} échec` : ''}
                            </p>
                          </div>
                          {s.job_id && (
                            <a
                              href={`/campaign/${s.id}/generate?jobId=${s.job_id}`}
                              className="text-xs text-brand-teal hover:text-brand-teal-hover font-semibold shrink-0"
                            >
                              Voir →
                            </a>
                          )}
                        </div>
                        {s.total_tasks && s.completed_tasks !== null && (
                          <ProgressBar completed={s.completed_tasks} total={s.total_tasks} />
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}

            {done.length > 0 && (
              <section>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">À réviser</p>
                <div className="space-y-2">
                  {done.map((s) => (
                    <div key={s.id} className="bg-white border border-border rounded-[12px] p-4 flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{s.name}</p>
                        <p className="text-[10px] text-text-disabled">
                          {s.completed_tasks !== null ? `${s.completed_tasks} images générées` : ''}
                          {s.failed_tasks ? ` · ${s.failed_tasks} échec` : ''}
                        </p>
                      </div>
                      <a
                        href={`/campaign/${s.id}/review`}
                        className="text-xs font-bold text-white bg-brand-green hover:bg-brand-green-hover px-3 py-1.5 rounded-[8px] transition-colors shrink-0"
                      >
                        Réviser →
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </main>
  )
}
