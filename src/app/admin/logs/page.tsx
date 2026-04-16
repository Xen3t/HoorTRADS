'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Job {
  id: string
  status: string
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  config: string
  created_at: string
  session_name: string
}

interface TaskVersion {
  id: string
  output_path: string
  prompt_sent: string | null
  regen_label: string | null
  created_at: string
}

interface Task {
  id: string
  source_image_name: string
  target_language: string
  country_code: string
  status: string
  output_path: string | null
  error_message: string | null
  prompt_sent: string | null
  verification_status: string | null
  verification_notes: string | null
  versions: TaskVersion[]
}

const STATUS_COLORS: Record<string, string> = {
  done: 'text-brand-green',
  failed: 'text-brand-red',
  running: 'text-brand-teal',
  pending: 'text-text-disabled',
  cancelled: 'text-text-secondary',
  pending_text_review: 'text-amber-500',
}

const STATUS_LABELS: Record<string, string> = {
  pending_text_review: 'review textes',
}

export default function LogsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [filterLang, setFilterLang] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [loadingTasks, setLoadingTasks] = useState(false)

  useEffect(() => {
    fetch('/api/admin/logs')
      .then((r) => r.json())
      .then((d) => { setJobs(d.jobs || []); setLoadingJobs(false) })
      .catch(() => setLoadingJobs(false))
  }, [])

  const loadTasks = async (jobId: string) => {
    setSelectedJobId(jobId)
    setLoadingTasks(true)
    setExpandedTask(null)
    const res = await fetch(`/api/admin/logs?jobId=${jobId}`)
    const data = await res.json()
    setTasks(data.tasks || [])
    setLoadingTasks(false)
  }

  const selectedJob = jobs.find((j) => j.id === selectedJobId)

  const filteredTasks = tasks.filter((t) => {
    if (filterLang && t.target_language !== filterLang) return false
    if (filterStatus && t.status !== filterStatus) return false
    return true
  })

  const languages = [...new Set(tasks.map((t) => t.target_language))].sort()
  const statuses = [...new Set(tasks.map((t) => t.status))]

  const parseConfig = (configStr: string) => {
    try { return JSON.parse(configStr) } catch { return {} }
  }

  return (
    <main className="min-h-screen px-6 pt-10 pb-12">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Logs de génération</h1>
            <p className="text-xs text-text-secondary mt-0.5">Prompts envoyés à Gemini · Scores de vérification · Erreurs</p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover font-semibold transition-colors">
            ← Admin
          </a>
        </div>

        <div className="flex gap-4">
          {/* Job list — left column */}
          <div className="w-64 shrink-0">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Jobs récents</p>
            {loadingJobs ? (
              <p className="text-xs text-text-disabled">Chargement…</p>
            ) : jobs.length === 0 ? (
              <p className="text-xs text-text-disabled">Aucun job</p>
            ) : (
              <div className="space-y-1.5">
                {jobs.map((job) => {
                  const cfg = parseConfig(job.config)
                  return (
                    <button
                      key={job.id}
                      onClick={() => loadTasks(job.id)}
                      className={`
                        w-full text-left p-3 rounded-[8px] border transition-all text-xs
                        ${selectedJobId === job.id
                          ? 'border-brand-green bg-brand-green/5'
                          : 'border-border bg-white hover:border-brand-teal/40'
                        }
                      `}
                    >
                      <p className="font-semibold text-text-primary truncate">{job.session_name || '—'}</p>
                      <p className="text-text-secondary mt-0.5">
                        {job.completed_tasks}/{job.total_tasks} ·{' '}
                        <span className={STATUS_COLORS[job.status] || ''}>{STATUS_LABELS[job.status] || job.status}</span>
                      </p>
                      <p className="text-text-disabled mt-0.5">
                        {cfg.generationMethod || 'standard'} · {cfg.resolution || '1K'} · {cfg.mode || 'standard'}
                      </p>
                      <p className="text-text-disabled mt-0.5">
                        {new Date(job.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Task list — right column */}
          <div className="flex-1 min-w-0">
            {/* Pre-translation log (Natif mode) */}
            {selectedJob && (() => {
              const cfg = parseConfig(selectedJob.config)
              const log = cfg.preTranslationLog
              if (!log) return null
              return (
                <div className="mb-4 bg-white border border-border rounded-[8px] overflow-hidden">
                  <div className="px-3 py-2 bg-surface border-b border-border flex items-center justify-between">
                    <p className="text-xs font-bold text-text-primary">Pré-traduction Natif</p>
                    <span className="text-[11px] text-text-disabled">{log.representativeImage}</span>
                  </div>
                  <div className="p-3 space-y-3">
                    {/* Zones extraites */}
                    {log.extractedZones && Object.keys(log.extractedZones).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wide mb-1.5">
                          Étape 1 — Texte extrait (français)
                        </p>
                        <div className="space-y-1">
                          {Object.entries(log.extractedZones as Record<string, { text: string; weight?: string; case?: string; color?: string; size?: string } | string>).map(([zone, zoneData]) => {
                            const text = typeof zoneData === 'string' ? zoneData : zoneData.text
                            const weight = typeof zoneData === 'object' ? zoneData.weight : undefined
                            const typoCase = typeof zoneData === 'object' ? zoneData.case : undefined
                            const color = typeof zoneData === 'object' ? zoneData.color : undefined
                            const size = typeof zoneData === 'object' ? zoneData.size : undefined
                            return (
                              <div key={zone} className="flex gap-2 text-xs px-2 py-1 bg-surface rounded-[8px]">
                                <span className="text-text-disabled font-mono w-28 shrink-0">{zone}</span>
                                <span className="text-text-primary font-medium flex-1">{text}</span>
                                {(weight || typoCase || color || size) && (
                                  <span className="text-text-disabled text-[10px] font-mono shrink-0">
                                    {[weight, typoCase, color, size].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {/* Traductions */}
                    {log.translations && Object.keys(log.translations).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wide mb-1.5">
                          Étape 2 — Traductions ({Object.keys(log.translations).length} langues)
                        </p>
                        <div className="space-y-2">
                          {Object.entries(log.translations as Record<string, Record<string, string>>).map(([lang, zones]) => (
                            <div key={lang}>
                              <p className="text-[10px] font-semibold text-brand-teal uppercase mb-0.5">{lang}</p>
                              <div className="space-y-0.5">
                                {Object.entries(zones).map(([zone, text]) => (
                                  <div key={zone} className="flex gap-2 text-xs px-2 py-0.5">
                                    <span className="text-text-disabled font-mono w-28 shrink-0">{zone}</span>
                                    <span className="text-text-primary">{text}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {!selectedJobId ? (
              <div className="flex items-center justify-center h-40 text-text-disabled text-sm">
                Sélectionne un job pour voir les tâches
              </div>
            ) : loadingTasks ? (
              <div className="flex items-center justify-center h-40 text-text-disabled text-sm">
                Chargement des tâches…
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="flex items-center gap-3 mb-3">
                  <select
                    value={filterLang}
                    onChange={(e) => setFilterLang(e.target.value)}
                    className="text-xs border border-border rounded-[8px] px-2 py-1.5 bg-white text-text-primary focus:outline-none focus:border-brand-green"
                  >
                    <option value="">Toutes les langues</option>
                    {languages.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="text-xs border border-border rounded-[8px] px-2 py-1.5 bg-white text-text-primary focus:outline-none focus:border-brand-green"
                  >
                    <option value="">Tous les statuts</option>
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="text-xs text-text-disabled ml-auto">{filteredTasks.length} tâches</span>
                </div>

                {/* Header row */}
                <div className="grid grid-cols-[120px_40px_60px_80px_1fr] gap-2 px-3 py-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wide border-b border-border">
                  <span>Image</span>
                  <span>Lang</span>
                  <span>Statut</span>
                  <span>Score</span>
                  <span>Prompt</span>
                </div>

                <div className="space-y-0.5 mt-1">
                  {filteredTasks.map((task) => {
                    const isExpanded = expandedTask === task.id
                    const score = task.verification_status ? parseFloat(task.verification_status) : null
                    const notes = task.verification_notes ? (() => { try { return JSON.parse(task.verification_notes) } catch { return null } })() : null

                    return (
                      <div key={task.id} className="rounded-[8px] bg-white border border-border overflow-hidden">
                        <button
                          onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                          className="w-full grid grid-cols-[120px_40px_60px_80px_1fr] gap-2 px-3 py-2 text-left hover:bg-surface transition-colors"
                        >
                          <span className="text-xs text-text-primary truncate font-mono" title={task.source_image_name}>
                            {task.source_image_name.replace(/\.[^.]+$/, '').slice(0, 18)}
                          </span>
                          <span className="text-xs font-semibold text-text-primary">{task.target_language.toUpperCase()}</span>
                          <span className={`text-xs font-semibold ${STATUS_COLORS[task.status] || ''}`}>{task.status}</span>
                          <span className="text-xs font-semibold">
                            {score !== null ? (
                              <span className={score >= 4 ? 'text-brand-green' : score >= 3 ? 'text-yellow-600' : 'text-brand-red'}>
                                {score}/5
                              </span>
                            ) : '—'}
                          </span>
                          <span className="text-xs text-text-disabled truncate">
                            {task.prompt_sent
                              ? task.prompt_sent.slice(0, 60) + '…'
                              : task.error_message
                              ? <span className="text-brand-red">{task.error_message.slice(0, 60)}</span>
                              : '—'
                            }
                          </span>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden border-t border-border"
                            >
                              <div className="p-4 space-y-4 bg-surface">
                                {/* Prompt — only shown if no version history (no regenerations) */}
                                {(!task.versions || task.versions.length === 0) && (
                                  <div>
                                    <p className="text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">
                                      Prompt envoyé à Gemini
                                    </p>
                                    {task.prompt_sent ? (
                                      <pre className="text-xs text-text-primary bg-white border border-border rounded-[8px] p-3 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-80">
                                        {task.prompt_sent}
                                      </pre>
                                    ) : (
                                      <p className="text-xs text-text-disabled italic">Prompt non enregistré</p>
                                    )}
                                  </div>
                                )}

                                {/* Version history */}
                                {task.versions?.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">
                                      Historique régénérations ({task.versions.length})
                                    </p>
                                    <div className="space-y-2">
                                      {task.versions.map((v, i) => (
                                        <div key={v.id} className="bg-white border border-border rounded-[8px] overflow-hidden">
                                          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-border">
                                            <span className="text-[10px] font-bold text-amber-700 uppercase">v{i + 1}</span>
                                            {v.regen_label && (
                                              <span className="text-[10px] text-amber-600 font-semibold">{v.regen_label}</span>
                                            )}
                                            <span className="text-[10px] text-text-disabled ml-auto">
                                              {new Date(v.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                          </div>
                                          {v.prompt_sent ? (
                                            <pre className="text-xs text-text-primary p-3 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-40">
                                              {v.prompt_sent}
                                            </pre>
                                          ) : (
                                            <p className="text-xs text-text-disabled italic px-3 py-2">Prompt non enregistré</p>
                                          )}
                                        </div>
                                      ))}
                                      {/* Current version prompt */}
                                      <div className="bg-white border border-brand-green/30 rounded-[8px] overflow-hidden">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-green-light border-b border-brand-green/20">
                                          <span className="text-[10px] font-bold text-brand-green uppercase">v{task.versions.length + 1} — actuelle</span>
                                        </div>
                                        {task.prompt_sent ? (
                                          <pre className="text-xs text-text-primary p-3 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-40">
                                            {task.prompt_sent}
                                          </pre>
                                        ) : (
                                          <p className="text-xs text-text-disabled italic px-3 py-2">Prompt non enregistré</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Verification notes */}
                                {notes && (
                                  <div>
                                    <p className="text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">
                                      Vérification — {notes.score}/5
                                    </p>
                                    <div className="bg-white border border-border rounded-[8px] p-3 space-y-2">
                                      {notes.summary && (
                                        <p className="text-xs text-text-primary italic">{notes.summary}</p>
                                      )}
                                      {notes.issues?.length > 0 && (
                                        <ul className="space-y-1">
                                          {notes.issues.map((issue: string, i: number) => (
                                            <li key={i} className="text-xs text-brand-red flex gap-1.5">
                                              <span>•</span><span>{issue}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      {notes.extractedText && Object.keys(notes.extractedText).length > 0 && (
                                        <div className="pt-2 border-t border-border">
                                          <p className="text-xs font-semibold text-text-secondary mb-1">Texte extrait</p>
                                          {Object.entries(notes.extractedText).map(([zone, text]) => (
                                            <p key={zone} className="text-xs text-text-primary">
                                              <span className="text-text-disabled">{zone}:</span> {String(text)}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Error */}
                                {task.error_message && (
                                  <div>
                                    <p className="text-xs font-semibold text-brand-red mb-1">Erreur</p>
                                    <pre className="text-xs text-brand-red bg-white border border-border rounded-[8px] p-3 font-mono whitespace-pre-wrap">
                                      {task.error_message}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
