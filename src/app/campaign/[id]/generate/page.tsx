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
  // rendering=1 means we came back from text-review and NB2 is already running
  const isRenderingPhase = searchParams.get('rendering') === '1'
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [allCountries, setAllCountries] = useState<string[]>([])
  const [isDone, setIsDone] = useState(false)
  const [isPendingTextReview, setIsPendingTextReview] = useState(false)
  const [completedImages, setCompletedImages] = useState<{ id: string; output_path: string }[]>([])
  const [failedImages, setFailedImages] = useState<{ id: string; language?: string; error_message?: string }[]>([])
  const [isAutoVerifying, setIsAutoVerifying] = useState(false)
  const [autoCorrectStats, setAutoCorrectStats] = useState<{ verified: number; corrected: number } | null>(null)
  const verificationEnabledRef = useRef(false)
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
          if (config.verificationEnabled) {
            verificationEnabledRef.current = true
          }
        }
      })
      .catch((e) => console.error('[generate] session load', e))
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
          const failed = (imgData.tasks || []).filter((t: { status: string }) => t.status === 'failed' || t.status === 'error')
          setFailedImages(failed)

          if (data.status === 'pending_text_review') {
            setIsDone(true)
            setIsPendingTextReview(true)
            if (pollingRef.current) clearInterval(pollingRef.current)
            setTimeout(() => {
              window.location.href = `/campaign/${sessionId}/text-review`
            }, 800)
          } else if (data.status === 'done' || data.status === 'failed') {
            setIsDone(true)
            if (pollingRef.current) clearInterval(pollingRef.current)

            if (data.status === 'done' && verificationEnabledRef.current && !isRenderingPhase) {
              setIsAutoVerifying(true)
              try {
                const res = await fetch(`/api/generate/${jobId}/auto-correct`, { method: 'POST' })
                const stats = await res.json()
                if (stats.verified) setAutoCorrectStats({ verified: stats.verified, corrected: stats.corrected })
              } catch (e) { console.error('[generate] auto-correct', e) }
              setIsAutoVerifying(false)
            }

            setTimeout(() => {
              window.location.href = `/campaign/${sessionId}/review`
            }, 1000)
          }
        }
      } catch (e) {
        console.error('[generate] poll', e)
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
          {isAutoVerifying
            ? '🔍 Vérification & correction en cours...'
            : autoCorrectStats
            ? `✓ ${autoCorrectStats.verified} vérifiés · ${autoCorrectStats.corrected} corrigés`
            : isDone
            ? (isRenderingPhase ? 'Génération des visuels terminée !' : 'Extraction & traduction terminées !')
            : isRenderingPhase
            ? 'Génération des visuels avec Gemini NB2...'
            : 'Extraction et traduction avec Gemini AI...'}
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
              const isComplete = isPendingTextReview || progress?.completedCountries.includes(code)
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

        {/* Failed images */}
        {failedImages.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-brand-red mb-2 font-semibold">
              {failedImages.length} image{failedImages.length > 1 ? 's' : ''} en échec
            </p>
            <div className="space-y-2">
              {failedImages.slice(0, 5).map((img) => (
                <div
                  key={img.id}
                  className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2 text-left"
                >
                  <span className="text-brand-red text-sm mt-0.5">&#10005;</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary">
                      {img.language || 'Image'}
                    </p>
                    {img.error_message && (
                      <p className="text-xs text-text-disabled break-words mt-0.5">
                        {img.error_message.length > 150 ? img.error_message.slice(0, 150) + '...' : img.error_message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {failedImages.length > 5 && (
                <p className="text-xs text-brand-red font-semibold text-center">
                  +{failedImages.length - 5} autre{failedImages.length - 5 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
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

        {/* Auto-redirect en cours — message discret */}
        <AnimatePresence>
          {isDone && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-text-disabled mt-6"
            >
              Redirection en cours...
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
