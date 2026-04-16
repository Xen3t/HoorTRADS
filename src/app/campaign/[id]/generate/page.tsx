'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import type { GenerationProgress } from '@/types/generation'

export default function GeneratePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sessionId = params.id as string
  const jobId = searchParams.get('jobId')
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [allCountries, setAllCountries] = useState<string[]>([])
  const [isDone, setIsDone] = useState(false)
  const [completedImages, setCompletedImages] = useState<{ id: string; output_path: string }[]>([])
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Load session config to get all countries upfront
  useEffect(() => {
    let cancelled = false
    fetch(`/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.session?.config) {
          const config = JSON.parse(data.session.config)
          if (config.countries) setAllCountries(config.countries.filter((c: string) => c !== 'FR'))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    if (!jobId) return

    const poll = async () => {
      try {
        const res = await fetch(`/api/generate/${jobId}/status`)
        const data = await res.json()
        if (data.jobId) {
          setProgress(data)

          // Fetch completed images for the thumbnail grid
          const imgRes = await fetch(`/api/generate/${jobId}/images`)
          const imgData = await imgRes.json()
          const done = (imgData.tasks || []).filter((t: { status: string; output_path: string }) => t.status === 'done' && t.output_path)
          setCompletedImages(done)

          if (data.status === 'done' || data.status === 'failed') {
            setIsDone(true)
            if (pollingRef.current) clearInterval(pollingRef.current)
            setTimeout(() => {
              window.location.href = `/campaign/${sessionId}/review`
            }, 1500)
          }
        }
      } catch {
        // Polling error — will retry
      }
    }

    poll()
    pollingRef.current = setInterval(poll, 2000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [jobId, sessionId])

  const percentage = progress
    ? Math.round(((progress.completedTasks + progress.failedTasks) / Math.max(progress.totalTasks, 1)) * 100)
    : 0


  return (
    <main className="min-h-screen px-8 pt-8 pb-12">
      <div className="w-full max-w-[600px] mx-auto text-center">
        {/* Mega counter */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-2"
        >
          <p className="text-7xl font-bold leading-none">
            <span className="text-brand-green">{progress?.completedTasks || 0}</span>
            <span className="text-text-disabled"> / {progress?.totalTasks || '...'}</span>
          </p>
        </motion.div>

        <p className="text-text-secondary text-sm mb-8">
          {isDone ? 'Traduction terminée !' : 'Traduction des visuels avec Gemini AI...'}
        </p>

        {/* Progress bar */}
        <div className="w-full mx-auto mb-8">
          <div className="h-3 bg-border rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-brand-green rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <p className="text-xs text-text-disabled mt-2">{percentage}%</p>
        </div>

        {/* Country flags */}
        {allCountries.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {allCountries.map((code) => {
              const isComplete = progress?.completedCountries.includes(code)
              return (
                <div
                  key={code}
                  className={`flex items-center gap-1.5 transition-opacity duration-500 ${isComplete ? 'opacity-100' : 'opacity-30'}`}
                >
                  <span
                    className={`fi fi-${code.toLowerCase()}`}
                    style={{ fontSize: '16px', borderRadius: '2px' }}
                  />
                  <span
                    className={`text-xs font-semibold ${isComplete ? 'text-brand-green' : 'text-text-disabled'}`}
                  >
                    {code}
                    {isComplete && ' ✓'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Failed count */}
        {progress && progress.failedTasks > 0 && (
          <p className="text-sm text-brand-red mb-4">
            {progress.failedTasks} image{progress.failedTasks > 1 ? 's' : ''} en échec
          </p>
        )}

        {/* Thumbnail grid */}
        {completedImages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-5 gap-2 mb-8"
          >
            {completedImages.slice(0, 15).map((img, i) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className="aspect-square bg-surface rounded-[8px] overflow-hidden"
              >
                <img
                  src={`/api/serve-image?path=${encodeURIComponent(img.output_path)}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </motion.div>
            ))}
            {completedImages.length > 15 && (
              <div className="aspect-square bg-surface rounded-[8px] flex items-center justify-center text-xs text-text-secondary font-semibold">
                +{completedImages.length - 15}
              </div>
            )}
          </motion.div>
        )}

        {/* Not started yet */}
        {!jobId && (
          <p className="text-text-secondary">Aucun job de génération trouvé. Retournez à la configuration.</p>
        )}

        {/* Waiting message + cancel */}
        <AnimatePresence>
          {!isDone && progress && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <p className="text-xs text-text-disabled">
                Vous pouvez fermer cette page — vous serez notifié à la fin
              </p>
              <button
                onClick={async () => {
                  if (!jobId) return
                  if (!confirm('Arrêter la génération en cours ?')) return
                  await fetch(`/api/generate/${jobId}/cancel`, { method: 'POST' })
                  window.location.href = `/campaign/${sessionId}/review`
                }}
                className="text-xs text-brand-red hover:text-brand-red/80 underline transition-colors"
              >
                Arrêter la génération
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue button */}
        <AnimatePresence>
          {isDone && (
            <motion.a
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              href={`/campaign/${sessionId}/review`}
              className="
                inline-block mt-6 px-8 py-3 rounded-[12px]
                bg-brand-green text-white font-bold text-sm
                hover:bg-brand-green-hover hover:shadow-lg
                transition-all duration-200
              "
            >
              Continuer vers la vérification →
            </motion.a>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
