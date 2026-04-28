'use client'

import { useState, useEffect } from 'react'
import LogPanel from '@/components/generate/LogPanel'

interface Job {
  id: string
  status: string
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  config: string
  created_at: string
  session_name: string
  user_name: string | null
  user_email: string | null
}

const STATUS_LABELS: Record<string, string> = {
  pending_text_review: 'review textes',
}

export default function LogsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [loadingJobs, setLoadingJobs] = useState(true)

  useEffect(() => {
    fetch('/api/admin/logs')
      .then((r) => r.json())
      .then((d) => { setJobs(d.jobs || []); setLoadingJobs(false) })
      .catch(() => setLoadingJobs(false))
  }, [])

  const selectJob = (jobId: string) => setSelectedJobId(jobId)

  const selectedJob = jobs.find((j) => j.id === selectedJobId)

  return (
    <main className="min-h-screen px-6 pt-10 pb-12">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Logs de génération</h1>
            <p className="text-xs text-text-secondary mt-0.5">Prompts IA · Scores de vérification · Erreurs</p>
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
                  let cfg: { resolution?: string; mode?: string; preTranslationLog?: { provider?: string } } = {}
                  try { cfg = JSON.parse(job.config || '{}') } catch {}
                  const statusColor = job.status === 'done' ? 'text-brand-green' : job.status === 'failed' ? 'text-brand-red' : job.status === 'running' ? 'text-brand-teal' : job.status === 'pending_text_review' ? 'text-amber-500' : 'text-text-disabled'
                  const provider = cfg.preTranslationLog?.provider
                  const providerLabel = provider === 'openai' ? 'OpenAI' : provider === 'mixed' ? 'Mixte' : provider === 'gemini' ? 'Gemini' : null
                  const providerColor = provider === 'openai' ? 'bg-emerald-100 text-emerald-700' : provider === 'mixed' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  return (
                    <button
                      key={job.id}
                      onClick={() => selectJob(job.id)}
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
                        <span className={statusColor}>{STATUS_LABELS[job.status] || job.status}</span>
                      </p>
                      <p className="text-text-disabled mt-0.5 flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                        <span className="truncate">{job.user_name || job.user_email || 'Anonyme'}</span>
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] text-text-disabled px-1.5 py-0.5 bg-surface rounded-full">{cfg.resolution || '1K'}</span>
                        {cfg.mode === 'batch' && (
                          <span className="text-[10px] text-text-disabled px-1.5 py-0.5 bg-surface rounded-full">batch</span>
                        )}
                        {providerLabel && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${providerColor}`}>{providerLabel}</span>
                        )}
                      </div>
                      <p className="text-text-disabled mt-1">
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
            {/* Unified log timeline — same component as on the generate page (always open here) */}
            {selectedJobId && (
              <div className="mb-4">
                <LogPanel jobId={selectedJobId} isActive={selectedJob?.status === 'running'} enabled hideInternalToggle />
              </div>
            )}

            {!selectedJobId && (
              <div className="flex items-center justify-center h-40 text-text-disabled text-sm">
                Sélectionne un job pour voir les logs
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
