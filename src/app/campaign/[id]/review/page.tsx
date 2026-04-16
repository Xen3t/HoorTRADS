'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import ImageCard from '@/components/review/ImageCard'
import ImageDetailModal from '@/components/review/ImageDetailModal'
import type { GenerationTask } from '@/types/generation'

type Density = 'large' | 'compact'

export default function ReviewPage() {
  const params = useParams()
  const sessionId = params.id as string
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [jobId, setJobId] = useState<string | null>(null)
  const [activeLang, setActiveLang] = useState<string | null>(null)
  const [density, setDensity] = useState<Density>('large')
  const [selectedTask, setSelectedTask] = useState<GenerationTask | null>(null)
  const [countries, setCountries] = useState<string[]>([])
  const [langToCountries, setLangToCountries] = useState<Record<string, string[]>>({})
  const [regeneratingTaskId, setRegeneratingTaskId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // Get session to find source config
        const sessRes = await fetch(`/api/sessions/${sessionId}`)
        const sessData = await sessRes.json()
        if (cancelled || !sessData.session) return

        // We need the job ID — search via a query param stored in the page
        // For MVP, we'll scan for the most recent job for this session
        const scanRes = await fetch(`/api/generate/by-session/${sessionId}`)
        if (!scanRes.ok) return
        const scanData = await scanRes.json()
        if (cancelled || !scanData.jobId) return

        setJobId(scanData.jobId)

        // Fetch images for this job
        const imgRes = await fetch(`/api/generate/${scanData.jobId}/images`)
        const imgData = await imgRes.json()
        if (cancelled) return

        setTasks(imgData.tasks || [])
        const uniqueCountries = [...new Set((imgData.tasks || []).map((t: GenerationTask) => t.country_code))] as string[]
        setCountries(uniqueCountries)

        // Get langToCountries from job config
        const jobRes = await fetch(`/api/generate/${scanData.jobId}/status`)
        const jobData = await jobRes.json()
        if (!cancelled && jobData.langToCountries) {
          setLangToCountries(jobData.langToCountries)
        }
      } catch {
        // Load failed
      }
    }

    load()
    return () => { cancelled = true }
  }, [sessionId])

  // Build language groups for filter pills: lang → [countries]
  // Derived from langToCountries (job config) or fallback to task country codes
  const langGroups: { lang: string; countries: string[] }[] = Object.keys(langToCountries).length > 0
    ? Object.entries(langToCountries).map(([lang, countries]) => ({ lang, countries }))
    : countries.map((code) => ({ lang: code, countries: [code] }))

  const filteredTasks = activeLang
    ? tasks.filter((t) => t.target_language === activeLang)
    : tasks

  const handleReload = async (task: GenerationTask) => {
    if (!jobId) return
    setRegeneratingTaskId(task.id)
    try {
      await fetch(`/api/generate/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      })
      const imgRes = await fetch(`/api/generate/${jobId}/images`)
      const imgData = await imgRes.json()
      setTasks(imgData.tasks || [])
    } finally {
      setRegeneratingTaskId(null)
    }
  }

  const handleRegenerated = async () => {
    if (!jobId) return
    const imgRes = await fetch(`/api/generate/${jobId}/images`)
    const imgData = await imgRes.json()
    const updatedTasks: GenerationTask[] = imgData.tasks || []
    setTasks(updatedTasks)
    // Mettre à jour le task dans le modal sans le fermer
    if (selectedTask) {
      const refreshed = updatedTasks.find((t) => t.id === selectedTask.id)
      if (refreshed) setSelectedTask(refreshed)
    }
  }

  return (
    <main className="min-h-screen pb-24">
      <div className="max-w-[900px] mx-auto px-8">
        {/* Sticky header with title, filters, density, download */}
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm pt-4 pb-3 -mx-8 px-8 border-b border-transparent">
          {/* Title row */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-text-primary">Vérification des visuels</h2>
            <span className="text-xs text-text-secondary">{filteredTasks.length} / {tasks.length} visuels</span>
          </div>

          {/* Filters + controls row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Country filters — horizontal pills grouped by language */}
            <div className="flex items-center gap-1 flex-wrap flex-1">
              <button
                onClick={() => setActiveLang(null)}
                className={`px-3 py-1.5 rounded-[20px] text-xs font-semibold transition-colors ${!activeLang ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
              >
                Tous
              </button>
              {langGroups.map(({ lang, countries: groupCountries }) => (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-[20px] text-xs font-semibold transition-colors ${activeLang === lang ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
                >
                  {groupCountries.map((code, i) => (
                    <span key={code} className="inline-flex items-center gap-0.5">
                      {i > 0 && <span className="opacity-50">/</span>}
                      <span className={`fi fi-${code.toLowerCase()}`} style={{ fontSize: '10px' }} />
                      <span>{code}</span>
                    </span>
                  ))}
                </button>
              ))}
            </div>

            {/* Density toggle */}
            <div className="flex border border-border rounded-[20px] overflow-hidden">
              <button
                onClick={() => setDensity('large')}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${density === 'large' ? 'bg-brand-green text-white' : 'bg-white text-text-secondary'}`}
              >
                Grand
              </button>
              <button
                onClick={() => setDensity('compact')}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${density === 'compact' ? 'bg-brand-green text-white' : 'bg-white text-text-secondary'}`}
              >
                Compact
              </button>
            </div>

            {/* Download JSON */}
            {jobId && (
              <a
                href={`/api/translations/${jobId}`}
                download="traductions.json"
                className="text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                ⬇ translations.json
              </a>
            )}
          </div>
        </div>

        {/* Image grid — masonry via CSS columns so each card adapts to its own image ratio */}
        <div className={`pt-4 gap-3 ${density === 'large' ? 'columns-4' : 'columns-5'}`}>
          <AnimatePresence>
            {filteredTasks.map((task) => (
              <div key={task.id} className="mb-3 break-inside-avoid">
                <ImageCard
                  task={task}
                  size={density}
                  onClick={() => setSelectedTask(task)}
                  onReload={() => handleReload(task)}
                  isRegenerating={regeneratingTaskId === task.id}
                />
              </div>
            ))}
          </AnimatePresence>
        </div>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedTask && jobId && (
            <ImageDetailModal
              task={selectedTask}
              jobId={jobId}
              onClose={() => setSelectedTask(null)}
              onRegenerated={handleRegenerated}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Floating export button — fixed bottom */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <a
          href={`/campaign/${sessionId}/export`}
          className="
            flex items-center gap-2
            px-6 py-2.5 rounded-full
            bg-brand-green/90 backdrop-blur-sm text-white font-semibold text-sm
            hover:bg-brand-green hover:shadow-xl hover:scale-105
            transition-all duration-200
            shadow-lg
          "
        >
          Continuer vers l&apos;export
          <span className="text-white/70">→</span>
        </a>
      </div>
    </main>
  )
}
