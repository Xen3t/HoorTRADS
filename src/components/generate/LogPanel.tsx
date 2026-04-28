'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface LogEvent {
  ts: string
  level: 'info' | 'success' | 'warning' | 'error'
  source: 'pipeline' | 'extract' | 'translate' | 'image' | 'system'
  provider?: 'gemini' | 'openai' | 'mixed'
  modelLabel?: string
  message: string
  details?: string
}

interface LogPanelProps {
  jobId: string | null
  isActive: boolean
  enabled?: boolean
  onEnabledChange?: (v: boolean) => void
  hideInternalToggle?: boolean
}

const LEVEL_DOT: Record<string, string> = {
  info: 'bg-text-disabled',
  success: 'bg-brand-green',
  warning: 'bg-amber-500',
  error: 'bg-brand-red',
}
const LEVEL_TEXT: Record<string, string> = {
  info: 'text-text-secondary',
  success: 'text-brand-green',
  warning: 'text-amber-600',
  error: 'text-brand-red',
}
const SOURCE_LABEL: Record<string, string> = {
  pipeline: 'Pipeline',
  extract: 'Extraction',
  translate: 'Traduction',
  image: 'Génération',
  system: 'Système',
}
const PROVIDER_COLOR: Record<string, string> = {
  gemini: 'bg-blue-100 text-blue-700',
  openai: 'bg-emerald-100 text-emerald-700',
  mixed: 'bg-amber-100 text-amber-700',
}
const PROVIDER_LABEL: Record<string, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  mixed: 'Mixte',
}

export default function LogPanel({ jobId, isActive, enabled: externalEnabled, onEnabledChange, hideInternalToggle }: LogPanelProps) {
  const [internalEnabled, setInternalEnabled] = useState(false)
  const enabled = externalEnabled !== undefined ? externalEnabled : internalEnabled
  const setEnabled = (v: boolean) => {
    if (onEnabledChange) onEnabledChange(v)
    else setInternalEnabled(v)
  }
  const [events, setEvents] = useState<LogEvent[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!enabled || !jobId) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      return
    }
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/generate/${jobId}/logs`)
        if (!res.ok) return
        const data = await res.json()
        setEvents(data.events || [])
      } catch { /* ignore */ }
    }
    fetchLogs()
    pollingRef.current = setInterval(fetchLogs, isActive ? 2000 : 5000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [enabled, jobId, isActive])

  const toggleExpanded = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }
  const expandAll = () => setExpanded(new Set(events.map((_, i) => i).filter((i) => events[i].details)))
  const collapseAll = () => setExpanded(new Set())

  if (!jobId) return null

  return (
    <div className="mt-2 w-full">
      {!hideInternalToggle && (
        <div className="flex items-center justify-center gap-2">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <div className="relative">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="sr-only peer" />
              <div className="w-9 h-5 bg-border rounded-full peer-checked:bg-brand-teal transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
            </div>
            <span className="text-xs text-text-secondary font-semibold">Afficher les logs</span>
          </label>
        </div>
      )}

      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden mt-3"
          >
            <div className="bg-white border border-border rounded-[12px] text-left max-h-[500px] overflow-y-auto">
              {/* Header sticky avec actions */}
              <div className="sticky top-0 bg-white border-b border-border px-3 py-2 flex items-center justify-between z-10">
                <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                  {events.length} événement{events.length > 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={expandAll} className="text-[10px] text-text-disabled hover:text-text-primary transition-colors">Tout déplier</button>
                  <span className="text-[10px] text-text-disabled">·</span>
                  <button onClick={collapseAll} className="text-[10px] text-text-disabled hover:text-text-primary transition-colors">Tout replier</button>
                </div>
              </div>

              {events.length === 0 ? (
                <p className="text-xs text-text-disabled text-center py-6">En attente des premiers logs...</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {events.map((ev, i) => {
                    const isOpen = expanded.has(i)
                    const hasDetails = !!ev.details
                    return (
                      <div key={i}>
                        <button
                          onClick={() => hasDetails && toggleExpanded(i)}
                          className={`flex items-start gap-2 w-full text-left px-3 py-2 ${hasDetails ? 'hover:bg-surface cursor-pointer' : 'cursor-default'}`}
                          aria-expanded={isOpen}
                        >
                          {/* Chevron */}
                          <span className="w-3 shrink-0 mt-1 text-text-disabled text-[9px]">
                            {hasDetails ? (isOpen ? '▼' : '▶') : ' '}
                          </span>
                          {/* Status dot */}
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${LEVEL_DOT[ev.level]}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-text-disabled">
                                {SOURCE_LABEL[ev.source]}
                              </span>
                              {ev.provider && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${PROVIDER_COLOR[ev.provider]}`}>
                                  {PROVIDER_LABEL[ev.provider]}
                                </span>
                              )}
                              {ev.modelLabel && (
                                <span className="text-[9px] font-mono text-text-secondary bg-surface px-1.5 py-0.5 rounded-full" title="Modèle utilisé">
                                  {ev.modelLabel}
                                </span>
                              )}
                            </div>
                            <p className={`text-xs font-semibold ${LEVEL_TEXT[ev.level]} mt-0.5`}>{ev.message}</p>
                          </div>
                        </button>
                        {hasDetails && (
                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                              >
                                <pre className="ml-6 mr-3 mb-2 text-[10px] bg-surface rounded-[6px] p-2 overflow-x-auto font-mono text-text-secondary whitespace-pre-wrap break-words">
                                  {ev.details}
                                </pre>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
