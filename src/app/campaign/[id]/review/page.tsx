'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
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
  const [density, setDensity] = useState<Density>('compact')
  const [selectedTask, setSelectedTask] = useState<GenerationTask | null>(null)
  const [countries, setCountries] = useState<string[]>([])
  const [langToCountries, setLangToCountries] = useState<Record<string, string[]>>({})

  // Animating tasks — Set pour supporter bulk
  const [regeneratingTaskIds, setRegeneratingTaskIds] = useState<Set<string>>(new Set())

  // Bulk selection
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [bulkPrompt, setBulkPrompt] = useState('')
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(false)
  const bulkTextareaRef = useRef<HTMLTextAreaElement>(null)
  const floatingBarRef = useRef<HTMLDivElement>(null)

  const addRegenerating = (ids: string[]) =>
    setRegeneratingTaskIds((prev) => new Set([...prev, ...ids]))
  const removeRegenerating = (ids: string[]) =>
    setRegeneratingTaskIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sessRes = await fetch(`/api/sessions/${sessionId}`)
        if (!sessRes.ok) return
        const sessData = await sessRes.json()
        if (cancelled || !sessData.session) return

        // Marquer comme consultée — disparaît de la file d'attente
        if (sessData.session.current_step === 'review') {
          fetch(`/api/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_step: 'reviewing' }),
          }).catch(() => {})
        }

        const scanRes = await fetch(`/api/generate/by-session/${sessionId}`)
        if (!scanRes.ok) return
        const scanData = await scanRes.json()
        if (cancelled || !scanData.jobId) return

        setJobId(scanData.jobId)

        const imgRes = await fetch(`/api/generate/${scanData.jobId}/images`)
        if (!imgRes.ok) return
        const imgData = await imgRes.json()
        if (cancelled) return

        setTasks(imgData.tasks || [])
        const uniqueCountries = [...new Set((imgData.tasks || []).map((t: GenerationTask) => t.country_code))] as string[]
        setCountries(uniqueCountries)

        const jobRes = await fetch(`/api/generate/${scanData.jobId}/status`)
        if (!jobRes.ok) return
        const jobData = await jobRes.json()
        if (!cancelled && jobData.langToCountries) setLangToCountries(jobData.langToCountries)
      } catch (e) { console.error('[review] load', e) }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId])

  const langGroups: { lang: string; countries: string[] }[] = Object.keys(langToCountries).length > 0
    ? Object.entries(langToCountries).map(([lang, cs]) => ({ lang, countries: cs }))
    : countries.map((code) => ({ lang: code, countries: [code] }))

  const filteredTasks = activeLang ? tasks.filter((t) => t.target_language === activeLang) : tasks
  const selectionActive = selectedTaskIds.size > 0

  // Reload depuis la carte ⟳ — depuis source FR
  const handleReload = async (task: GenerationTask) => {
    if (!jobId) return
    addRegenerating([task.id])
    try {
      await fetch(`/api/generate/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, useSourceImage: true }),
      })
      const imgData = await (await fetch(`/api/generate/${jobId}/images`)).json()
      setTasks(imgData.tasks || [])
    } finally {
      removeRegenerating([task.id])
    }
  }

  const handleRegenerated = async () => {
    if (!jobId) return
    const imgData = await (await fetch(`/api/generate/${jobId}/images`)).json()
    const updated: GenerationTask[] = imgData.tasks || []
    setTasks(updated)
    if (selectedTask) {
      const refreshed = updated.find((t) => t.id === selectedTask.id)
      if (refreshed) setSelectedTask(refreshed)
    }
  }

  const handleToggleSelect = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const handleBulkRegenFromSource = async () => {
    if (!jobId || isBulkProcessing) return
    const ids = [...selectedTaskIds]
    setIsBulkProcessing(true)
    addRegenerating(ids)
    try {
      await Promise.all(ids.map((taskId) =>
        fetch(`/api/generate/${jobId}/regenerate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, useSourceImage: true }),
        })
      ))
      const imgData = await (await fetch(`/api/generate/${jobId}/images`)).json()
      setTasks(imgData.tasks || [])
      setSelectedTaskIds(new Set())
    } finally {
      removeRegenerating(ids)
      setIsBulkProcessing(false)
    }
  }

  const handleBulkCorrectivePrompt = async () => {
    if (!jobId || !bulkPrompt.trim() || isBulkProcessing) return
    const ids = [...selectedTaskIds]
    setIsBulkProcessing(true)
    addRegenerating(ids)
    try {
      await Promise.all(ids.map((taskId) => {
        const task = tasks.find((t) => t.id === taskId)
        return fetch(`/api/generate/${jobId}/regenerate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId,
            customPrompt: bulkPrompt.trim(),
            useSourceImage: false,
            imageOverridePath: task?.output_path || undefined,
          }),
        })
      }))
      const imgData = await (await fetch(`/api/generate/${jobId}/images`)).json()
      setTasks(imgData.tasks || [])
      setBulkPrompt('')
      setSelectedTaskIds(new Set())
    } finally {
      removeRegenerating(ids)
      setIsBulkProcessing(false)
    }
  }

  const handleBulkDownload = async () => {
    const toDownload = tasks.filter((t) => selectedTaskIds.has(t.id) && t.output_path)
    for (const task of toDownload) {
      const a = document.createElement('a')
      a.href = `/api/serve-image?path=${encodeURIComponent(task.output_path!)}&download=1`
      a.download = `${task.source_image_name.replace(/\.[^.]+$/, '')}_${task.country_code}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  const handleBulkTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBulkPrompt(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const handleBulkKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleBulkCorrectivePrompt()
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      const scrollBottom = window.scrollY + window.innerHeight
      const docHeight = document.documentElement.scrollHeight
      setIsAtBottom(docHeight - scrollBottom < 120)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Clic en dehors des cartes / barre flottante → désélectionner
  const handleMainClick = () => {
    if (selectionActive) setSelectedTaskIds(new Set())
  }

  return (
    <main className="min-h-screen" onClick={handleMainClick}>
      <div className="max-w-[1400px] mx-auto px-4">
        {/* Sticky header */}
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm pt-4 pb-3 -mx-8 px-8 border-b border-transparent rounded-[12px]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-text-primary">Vérification des visuels</h2>
            <div className="flex items-center gap-3">
              {selectionActive && (
                <span className="text-xs font-semibold text-brand-teal">{selectedTaskIds.size} sélectionné{selectedTaskIds.size > 1 ? 's' : ''}</span>
              )}
              {regeneratingTaskIds.size > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-3 h-3 border-[1.5px] border-amber-700 border-t-transparent rounded-full inline-block"
                  />
                  {regeneratingTaskIds.size} en régénération
                </span>
              )}
              <span className="text-xs text-text-secondary">
                {activeLang ? `${filteredTasks.length} visuels` : `${tasks.length} visuels`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap flex-1">
              <button
                onClick={(e) => { e.stopPropagation(); setActiveLang(null) }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!activeLang ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
              >
                Tous
              </button>
              {langGroups.map(({ lang, countries: gc }) => {
                const isRegen = tasks.some((t) => t.target_language === lang && regeneratingTaskIds.has(t.id))
                return (
                  <button
                    key={lang}
                    onClick={(e) => { e.stopPropagation(); setActiveLang(lang) }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeLang === lang ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
                  >
                    {gc.map((code, i) => (
                      <span key={code} className="inline-flex items-center gap-0.5">
                        {i > 0 && <span className="opacity-50">/</span>}
                        <span className={`fi fi-${code.toLowerCase()}`} style={{ fontSize: '10px' }} />
                        <span>{code}</span>
                      </span>
                    ))}
                    {isRegen && (
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className={`ml-0.5 w-2.5 h-2.5 border-[1.5px] rounded-full inline-block shrink-0 ${activeLang === lang ? 'border-white border-t-transparent' : 'border-amber-500 border-t-transparent'}`}
                      />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Density toggle — Alignée (défaut) / Étendue */}
            <div className="flex border border-border rounded-full overflow-hidden">
              <button
                onClick={(e) => { e.stopPropagation(); setDensity('compact') }}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${density === 'compact' ? 'bg-brand-green text-white' : 'bg-white text-text-secondary'}`}
              >
                Alignée
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDensity('large') }}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${density === 'large' ? 'bg-brand-green text-white' : 'bg-white text-text-secondary'}`}
              >
                Étendue
              </button>
            </div>

          </div>
        </div>

        {/* Image grid — Alignée (grille CSS pleine largeur, ratios préservés) ou Étendue (masonry) */}
        {density === 'compact' ? (
          <div
            className="pt-4 grid gap-3 w-full"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
          >
            <AnimatePresence>
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (selectionActive) {
                      handleToggleSelect(task.id)
                    } else {
                      setSelectedTask(task)
                    }
                  }}
                >
                  <ImageCard
                    task={task}
                    size={density}
                    onReload={() => handleReload(task)}
                    isRegenerating={regeneratingTaskIds.has(task.id)}
                    isSelected={selectedTaskIds.has(task.id)}
                    onToggleSelect={handleToggleSelect}
                    selectionActive={selectionActive}
                  />
                </div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="pt-4 gap-3 columns-3">
            <AnimatePresence>
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="mb-3 break-inside-avoid"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (selectionActive) {
                      handleToggleSelect(task.id)
                    } else {
                      setSelectedTask(task)
                    }
                  }}
                >
                  <ImageCard
                    task={task}
                    size={density}
                    onReload={() => handleReload(task)}
                    isRegenerating={regeneratingTaskIds.has(task.id)}
                    isSelected={selectedTaskIds.has(task.id)}
                    onToggleSelect={handleToggleSelect}
                    selectionActive={selectionActive}
                  />
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedTask && jobId && (() => {
            const idx = filteredTasks.findIndex((t) => t.id === selectedTask.id)
            const hasPrev = idx > 0
            const hasNext = idx >= 0 && idx < filteredTasks.length - 1
            const navigate = (direction: 'prev' | 'next') => {
              const target = direction === 'prev' ? filteredTasks[idx - 1] : filteredTasks[idx + 1]
              if (target) setSelectedTask(target)
            }
            return (
              <ImageDetailModal
                task={selectedTask}
                jobId={jobId}
                onClose={() => setSelectedTask(null)}
                onRegenerated={handleRegenerated}
                onRegeneratingChange={(taskId) => {
                  if (taskId) addRegenerating([taskId])
                  else if (selectedTask) removeRegenerating([selectedTask.id])
                }}
                onNavigate={navigate}
                hasPrev={hasPrev}
                hasNext={hasNext}
              />
            )
          })()}
        </AnimatePresence>
      </div>

      {/* Floating bar */}
      <AnimatePresence mode="wait">
        {selectionActive ? (
          <motion.div
            key="bulk"
            ref={floatingBarRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white rounded-[16px] shadow-2xl border border-border px-4 py-3 max-w-[92vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fermer */}
            <button
              onClick={() => { setSelectedTaskIds(new Set()); setBulkPrompt('') }}
              className="w-9 h-9 flex items-center justify-center rounded-[12px] text-text-secondary hover:bg-red-50 hover:text-brand-red transition-colors text-lg shrink-0 font-light"
              title="Désélectionner tout"
            >
              ×
            </button>

            <div className="w-px h-6 bg-border shrink-0" />

            {/* Textarea */}
            <textarea
              ref={bulkTextareaRef}
              value={bulkPrompt}
              onChange={handleBulkTextareaInput}
              onKeyDown={handleBulkKeyDown}
              placeholder="Prompt correctif… (Entrée pour envoyer)"
              rows={1}
              disabled={isBulkProcessing}
              style={{ height: 'auto', minHeight: '36px', maxHeight: '120px' }}
              className="
                flex-1 min-w-[200px] max-w-[340px]
                px-3 py-2 rounded-[12px] text-sm
                border border-border bg-surface resize-none overflow-hidden
                focus:border-brand-green focus:outline-none focus:bg-white
                disabled:opacity-50 transition-colors
              "
            />

            <div className="w-px h-6 bg-border shrink-0" />

            {/* Régénérer depuis source FR */}
            <button
              onClick={handleBulkRegenFromSource}
              disabled={isBulkProcessing}
              className="w-10 h-10 flex items-center justify-center rounded-[12px] bg-surface hover:bg-brand-green hover:text-white text-text-secondary transition-colors shrink-0 disabled:opacity-50"
              title="Régénérer depuis source FR"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
              </svg>
            </button>

            {/* Télécharger */}
            <button
              onClick={handleBulkDownload}
              disabled={isBulkProcessing}
              className="w-10 h-10 flex items-center justify-center rounded-[12px] bg-surface hover:bg-brand-teal hover:text-white text-text-secondary transition-colors shrink-0 disabled:opacity-50"
              title="Télécharger les images sélectionnées"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Export button — fixed while scrolling, lands at bottom */}
      {!selectionActive && (
        <>
          <div className="flex justify-center py-6 mt-4" style={{ visibility: isAtBottom ? 'visible' : 'hidden' }}>
            <a
              href={`/campaign/${sessionId}/export`}
              className="
                flex items-center gap-2.5
                px-12 py-3 rounded-[16px]
                bg-white text-brand-green font-bold text-sm tracking-wide
                shadow-lg shadow-brand-green/20
                hover:bg-gradient-to-r hover:from-brand-green hover:to-brand-green-hover hover:text-white
                hover:shadow-xl hover:shadow-brand-green/30 hover:scale-[1.03]
                transition-all duration-200
              "
            >
              Exporter
            </a>
          </div>
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-opacity duration-300"
            style={{ opacity: isAtBottom ? 0 : 1, pointerEvents: isAtBottom ? 'none' : 'auto' }}
          >
            <a
              href={`/campaign/${sessionId}/export`}
              className="
                flex items-center gap-2.5
                px-12 py-3 rounded-[16px]
                bg-white text-brand-green font-bold text-sm tracking-wide
                shadow-lg shadow-brand-green/20
                hover:bg-gradient-to-r hover:from-brand-green hover:to-brand-green-hover hover:text-white
                hover:shadow-xl hover:shadow-brand-green/30 hover:scale-[1.03]
                transition-all duration-200
              "
            >
              Exporter
            </a>
          </div>
        </>
      )}
    </main>
  )
}
