'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface LogEvent {
  ts: string
  level: 'info' | 'success' | 'warning' | 'error'
  source: 'pipeline' | 'extract' | 'translate' | 'image' | 'system'
  provider?: 'gemini' | 'openai' | 'mixed'
  modelLabel?: string
  label?: string
  message: string
  details?: string
}

interface Task {
  id: string
  country_code: string
  target_language: string
  source_image_name: string
  status: 'pending' | 'running' | 'done' | 'failed'
  error_message?: string | null
}

interface LogPanelProps {
  jobId: string | null
  isActive: boolean
  enabled?: boolean
  onEnabledChange?: (v: boolean) => void
  hideInternalToggle?: boolean
  currentRPM?: number | null
  isImagePhase?: boolean
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

function getFormat(name: string): string {
  return name.match(/(\d+x\d+)/)?.[1] ?? name.replace(/\.[^.]+$/, '')
}

function MatrixView({ tasks }: { tasks: Task[] }) {
  const formats = [...new Set(tasks.map((t) => getFormat(t.source_image_name)))]
  const countries = [...new Set(tasks.map((t) => t.country_code))]

  const getTask = (format: string, country: string) =>
    tasks.find((t) => getFormat(t.source_image_name) === format && t.country_code === country)

  return (
    <div className="p-3 overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr>
            <th className="text-left text-text-disabled font-semibold pb-2 pr-3 whitespace-nowrap">Format</th>
            {countries.map((c) => (
              <th key={c} className="text-center text-text-disabled font-semibold pb-2 px-2 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {formats.map((format) => (
            <tr key={format} className="border-t border-border/40">
              <td className="py-2 pr-3 font-mono text-text-secondary whitespace-nowrap">{format}</td>
              {countries.map((country) => {
                const task = getTask(format, country)
                return (
                  <td key={country} className="py-2 px-2 text-center">
                    {!task ? (
                      <span className="text-border">—</span>
                    ) : task.status === 'done' ? (
                      <span className="text-brand-green font-bold">✓</span>
                    ) : task.status === 'failed' ? (
                      <span className="text-brand-red font-bold" title={task.error_message ?? ''}>✗</span>
                    ) : task.status === 'running' ? (
                      <svg className="w-3 h-3 animate-spin text-blue-500 mx-auto" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                      </svg>
                    ) : (
                      <span className="text-text-disabled">·</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LogPanel({ jobId, isActive, enabled: externalEnabled, onEnabledChange, hideInternalToggle, currentRPM, isImagePhase }: LogPanelProps) {
  const [internalEnabled, setInternalEnabled] = useState(false)
  const enabled = externalEnabled !== undefined ? externalEnabled : internalEnabled
  const setEnabled = (v: boolean) => {
    if (onEnabledChange) onEnabledChange(v)
    else setInternalEnabled(v)
  }
  const [view, setView] = useState<'matrix' | 'list'>('matrix')
  const [events, setEvents] = useState<LogEvent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!enabled || !jobId) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      return
    }
    const fetchAll = async () => {
      try {
        const [logsRes, tasksRes] = await Promise.all([
          fetch(`/api/generate/${jobId}/logs`),
          fetch(`/api/generate/${jobId}/images`),
        ])
        if (logsRes.ok) {
          const data = await logsRes.json()
          setEvents(data.events || [])
        }
        if (tasksRes.ok) {
          const data = await tasksRes.json()
          setTasks(data.tasks || [])
        }
      } catch { /* ignore */ }
    }
    fetchAll()
    pollingRef.current = setInterval(fetchAll, isActive ? 2000 : 5000)
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
              {/* Header sticky */}
              <div className="sticky top-0 bg-white border-b border-border px-3 py-2 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  {/* Vue toggle — uniquement pendant la génération d'images */}
                  {isImagePhase && (
                    <div className="flex items-center bg-surface rounded-[6px] p-0.5 gap-0.5">
                      <button
                        onClick={() => setView('matrix')}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-[4px] transition-colors ${view === 'matrix' ? 'bg-white text-text-primary shadow-sm' : 'text-text-disabled hover:text-text-secondary'}`}
                      >
                        Matrice
                      </button>
                      <button
                        onClick={() => setView('list')}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-[4px] transition-colors ${view === 'list' ? 'bg-white text-text-primary shadow-sm' : 'text-text-disabled hover:text-text-secondary'}`}
                      >
                        Liste
                      </button>
                    </div>
                  )}
                  {(!isImagePhase || view === 'list') && (
                    <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                      {events.length} événement{events.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {currentRPM != null && isActive && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                      <span className="text-[10px] text-brand-green font-medium tabular-nums">{currentRPM} req/min</span>
                    </span>
                  )}
                  {view === 'list' && (
                    <div className="flex items-center gap-2">
                      <button onClick={expandAll} className="text-[10px] text-text-disabled hover:text-text-primary transition-colors">Tout déplier</button>
                      <span className="text-[10px] text-text-disabled">·</span>
                      <button onClick={collapseAll} className="text-[10px] text-text-disabled hover:text-text-primary transition-colors">Tout replier</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Vue matrice — uniquement pendant la phase image */}
              {isImagePhase && view === 'matrix' && (
                tasks.length === 0
                  ? <p className="text-xs text-text-disabled text-center py-6">En attente des tâches...</p>
                  : <MatrixView tasks={tasks} />
              )}

              {/* Vue liste */}
              {(!isImagePhase || view === 'list') && (() => {
                if (events.length === 0) return <p className="text-xs text-text-disabled text-center py-6">En attente des premiers logs...</p>

                const nonImageEvents = events.filter((e) => e.source !== 'image')
                const imageEvents = events.filter((e) => e.source === 'image')

                // Group image events by language (extracted from label "format — lang")
                const imageGroups: Record<string, { ev: LogEvent; origIdx: number }[]> = {}
                imageEvents.forEach((ev) => {
                  const lang = ev.label?.split(' — ')[1] ?? '?'
                  if (!imageGroups[lang]) imageGroups[lang] = []
                  const origIdx = events.indexOf(ev)
                  imageGroups[lang].push({ ev, origIdx })
                })

                const renderEvent = (ev: LogEvent, i: number) => {
                  const isOpen = expanded.has(i)
                  const hasDetails = !!ev.details
                  return (
                    <div key={i}>
                      <button
                        onClick={() => hasDetails && toggleExpanded(i)}
                        className={`flex items-start gap-2 w-full text-left px-3 py-2 ${hasDetails ? 'hover:bg-surface cursor-pointer' : 'cursor-default'}`}
                        aria-expanded={isOpen}
                      >
                        <span className="w-3 shrink-0 mt-1 text-text-disabled text-[9px]">
                          {hasDetails ? (isOpen ? '▼' : '▶') : ' '}
                        </span>
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
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {ev.label && <span className="text-xs font-bold text-text-primary">{ev.label}</span>}
                            {ev.label && <span className="text-[10px] text-text-disabled">·</span>}
                            {ev.level === 'info' && ev.source === 'image' && (
                              <svg className="w-3 h-3 animate-spin text-text-disabled shrink-0" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                              </svg>
                            )}
                            <p className={`text-xs font-semibold ${LEVEL_TEXT[ev.level]}`}>{ev.message}</p>
                          </div>
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
                }

                return (
                  <div className="divide-y divide-border/50">
                    {/* Events non-image dans l'ordre */}
                    {nonImageEvents.map((ev) => renderEvent(ev, events.indexOf(ev)))}

                    {/* Events image groupés par langue */}
                    {Object.entries(imageGroups).map(([lang, items]) => (
                      <div key={lang}>
                        <div className="px-3 py-1.5 bg-surface/60 flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{lang.toUpperCase()}</span>
                          <span className="text-[10px] text-text-disabled">{items.length} format{items.length > 1 ? 's' : ''}</span>
                        </div>
                        {items.map(({ ev, origIdx }) => renderEvent(ev, origIdx))}
                      </div>
                    ))}
                  </div>
                )
              })()}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
