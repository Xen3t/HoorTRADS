'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import NotificationToast from '@/components/shared/NotificationToast'
import ScoreBadge from '@/components/review/ScoreBadge'
import type { TextVerificationResult } from '@/lib/verification/verifier'
import type { ExtractedZone } from '@/lib/gemini/text-extractor'

const LANGUAGE_NAMES: Record<string, string> = {
  nl: 'Néerlandais', de: 'Allemand', cs: 'Tchèque', da: 'Danois',
  es: 'Espagnol', fi: 'Finnois', en: 'Anglais', el: 'Grec', hr: 'Croate',
  hu: 'Hongrois', it: 'Italien', lt: 'Lituanien', lv: 'Letton',
  pl: 'Polonais', pt: 'Portugais', ro: 'Roumain', sv: 'Suédois',
  sl: 'Slovène', sk: 'Slovaque',
}

// Language code → ISO 3166-1 country code (flag + label display)
const LANG_TO_FLAG: Record<string, string> = {
  el: 'gr', cs: 'cz', da: 'dk', sv: 'se', sl: 'si', en: 'gb',
}
function langToCountryCode(lang: string): string {
  return (LANG_TO_FLAG[lang] || lang).toUpperCase()
}

type VerifyResults = Record<string, TextVerificationResult>

interface RetranslateModalState {
  lang: string
  comment: string
}

export default function TextReviewPage() {
  const params = useParams()
  const sessionId = params.id as string

  const [jobId, setJobId] = useState<string | null>(null)
  const [extractedZones, setExtractedZones] = useState<Record<string, ExtractedZone | string>>({})
  // translations[lang][zone] = translated text
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>({})
  const [loading, setLoading] = useState(true)
  const [preTranslationError, setPreTranslationError] = useState<string | null>(null)
  const [activeLang, setActiveLang] = useState<string | null>(null)

  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyResults, setVerifyResults] = useState<VerifyResults>({})
  const [verifySummary, setVerifySummary] = useState<{ ok: number; warning: number; error: number; total: number; avgScore: number } | null>(null)

  const [retranslateModal, setRetranslateModal] = useState<RetranslateModalState | null>(null)
  const [isRetranslating, setIsRetranslating] = useState(false)

  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' | 'info' } | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(false)

  // Resizable split between FR source and translation columns
  const [splitPct, setSplitPct] = useState(() => {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem('text-review-split')
      if (s) return Math.min(75, Math.max(20, parseInt(s)))
    }
    return 40
  })
  const isDragging = useRef(false)
  const originalTranslationsRef = useRef<Record<string, Record<string, string>>>({})
  const translationsForSave = useRef<Record<string, Record<string, string>>>({})

  useEffect(() => {
    localStorage.setItem('text-review-split', splitPct.toString())
  }, [splitPct])

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

  const startDrag = (e: React.MouseEvent, rowEl: HTMLDivElement) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const rect = rowEl.getBoundingClientRect()
      const pct = Math.round(((ev.clientX - rect.left) / rect.width) * 100)
      setSplitPct(Math.min(75, Math.max(20, pct)))
    }

    const onUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Load job + translations on mount
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const scanRes = await fetch(`/api/generate/by-session/${sessionId}`)
        if (!scanRes.ok) return
        const scanData = await scanRes.json()
        if (cancelled || !scanData.jobId) return
        const jid = scanData.jobId
        setJobId(jid)

        const res = await fetch(`/api/generate/${jid}/text-review`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return

        setExtractedZones(data.extractedZones || {})
        setTranslations(data.translations || {})
        if (data.preTranslationError) setPreTranslationError(data.preTranslationError)

        // Store original AI translations
        originalTranslationsRef.current = data.translations || {}

        // Load user edits from localStorage (user edits take priority over AI)
        if (jid) {
          const saved = localStorage.getItem(`text-review-${jid}`)
          if (saved) {
            try {
              const savedTranslations = JSON.parse(saved)
              setTranslations(savedTranslations)
            } catch { /* ignore */ }
          }
        }

        const langs = Object.keys(data.translations || {})
        if (langs.length > 0) setActiveLang(langs[0])
      } catch {
        // load failed
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    translationsForSave.current = translations
  }, [translations])

  useEffect(() => {
    if (!jobId) return
    const interval = setInterval(() => {
      localStorage.setItem(`text-review-${jobId}`, JSON.stringify(translationsForSave.current))
    }, 3000)
    return () => clearInterval(interval)
  }, [jobId])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!sent && languages.length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, Object.keys(translations).length])

  const languages = Object.keys(translations)
  const zones = Object.keys(extractedZones)

  // Update a single cell
  const updateCell = (lang: string, zone: string, value: string) => {
    setTranslations((prev) => ({
      ...prev,
      [lang]: { ...(prev[lang] || {}), [zone]: value },
    }))
  }

  // Verify all languages (or the active one)
  const handleVerify = async (lang?: string) => {
    if (!jobId || isVerifying) return
    setIsVerifying(true)
    try {
      const res = await fetch(`/api/generate/${jobId}/verify-texts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLanguage: lang || null }),
      })
      const data = await res.json()
      if (data.results) {
        const map: VerifyResults = {}
        for (const r of data.results as TextVerificationResult[]) map[r.targetLanguage] = r
        setVerifyResults((prev) => ({ ...prev, ...map }))
      }
      if (!lang && data.summary) setVerifySummary(data.summary)
    } catch {
      setToast({ message: 'Erreur lors de la vérification. Réessayez.', variant: 'error' })
    } finally {
      setIsVerifying(false)
    }
  }

  const openRetranslate = (lang: string) => setRetranslateModal({ lang, comment: '' })

  const handleRetranslate = async () => {
    if (!jobId || !retranslateModal) return
    setIsRetranslating(true)
    try {
      const res = await fetch(`/api/generate/${jobId}/retranslate-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLanguage: retranslateModal.lang, comment: retranslateModal.comment }),
      })
      const data = await res.json()
      if (data.translations) {
        setTranslations((prev) => ({ ...prev, [retranslateModal.lang]: data.translations }))
      }
      setRetranslateModal(null)
    } catch {
      setToast({ message: 'Erreur lors de la correction IA. Réessayez.', variant: 'error' })
    } finally {
      setIsRetranslating(false)
    }
  }

  const handleSendToGeneration = async () => {
    if (!jobId || isSending) return
    setIsSending(true)
    try {
      await fetch(`/api/generate/${jobId}/approve-texts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translations }),
      })
      setSent(true)
      if (jobId) localStorage.removeItem(`text-review-${jobId}`)
      setTimeout(() => {
        window.location.href = `/campaign/${sessionId}/generate?jobId=${jobId}&rendering=1`
      }, 800)
    } catch {
      setToast({ message: 'Erreur lors de l\'envoi. Réessayez.', variant: 'error' })
    } finally {
      setIsSending(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-text-secondary text-sm">Chargement des traductions...</p>
      </main>
    )
  }

  if (zones.length === 0) {
    return (
      <main className="min-h-screen flex items-start justify-center pt-16">
        <div className="text-center w-full" style={{ maxWidth: '640px' }}>
          {preTranslationError ? (
            <>
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl">&#9888;</span>
              </div>
              <p className="text-base font-bold text-text-primary mb-2">Extraction indisponible</p>
              <p className="text-sm text-text-secondary mb-1">
                Le modèle IA est temporairement surchargé ou a rencontré une erreur.
              </p>
              <p className="text-xs text-text-disabled mb-6 font-mono bg-surface rounded-[8px] px-3 py-2 text-left break-words whitespace-pre-wrap">
                {preTranslationError}
              </p>
              <div className="flex flex-col gap-3 items-center">
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-2.5 rounded-[10px] bg-brand-green text-white font-semibold text-sm hover:bg-brand-green-hover transition-colors"
                >
                  Relancer l&apos;extraction
                </button>
                <button
                  onClick={async () => {
                    if (!jobId) return
                    setIsSending(true)
                    try {
                      await fetch(`/api/generate/${jobId}/approve-texts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ translations: {} }),
                      })
                      window.location.href = `/campaign/${sessionId}/generate?jobId=${jobId}&rendering=1`
                    } catch {
                      setToast({ message: 'Erreur lors du lancement', variant: 'error' })
                    } finally {
                      setIsSending(false)
                    }
                  }}
                  disabled={isSending}
                  className="text-sm text-text-secondary hover:text-text-primary underline transition-colors"
                >
                  Continuer sans pré-traduction (mode standard)
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-text-secondary text-sm mb-2">Aucune zone extraite trouvée.</p>
              <p className="text-xs text-text-disabled">Assurez-vous d&apos;utiliser le mode Natif.</p>
            </>
          )}
        </div>
      </main>
    )
  }

  const displayLangs = activeLang ? [activeLang] : languages

  return (
    <main className="min-h-screen">
      <div className="mx-48">
        {/* Sticky header */}
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm px-6 pt-4 pb-3 border-b border-border rounded-[12px]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-text-primary">Vérification des traductions</h2>
            <span className="text-xs text-text-secondary">{zones.length} zones · {languages.length} langues</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Language filter pills */}
            <div className="flex items-center gap-1 flex-wrap flex-1">
              <button
                onClick={() => setActiveLang(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!activeLang ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
              >
                Toutes
              </button>
              {languages.map((lang) => {
                const result = verifyResults[lang]
                return (
                  <button
                    key={lang}
                    onClick={() => setActiveLang(lang === activeLang ? null : lang)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeLang === lang ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
                  >
                    <span className={`fi fi-${(LANG_TO_FLAG[lang] || lang).toLowerCase()}`} style={{ fontSize: '10px' }} />
                    <span>{langToCountryCode(lang)}</span>
                    {result && (
                      <span className={`text-[10px] font-bold ${result.score >= 4 ? 'text-brand-green' : result.score >= 3 ? 'text-amber-500' : 'text-brand-red'}`}>
                        {result.score}/5
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Verify all button */}
            {jobId && (
              <button
                onClick={() => handleVerify()}
                disabled={isVerifying}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-surface text-text-secondary hover:bg-border transition-colors disabled:opacity-50"
              >
                {isVerifying && !activeLang ? '⏳ Vérification...' : '🔍 Vérifier toutes les langues'}
              </button>
            )}
          </div>
        </div>

        {/* Verification summary bar */}
        {verifySummary && (
          <div className={`mt-3 px-4 py-2.5 rounded-[8px] flex items-center gap-4 text-xs font-semibold
            ${verifySummary.error > 0 ? 'bg-red-50 border border-red-200' : verifySummary.warning > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-brand-green-light border border-brand-green'}`}>
            <div className="flex items-center gap-2">
              <ScoreBadge score={verifySummary.avgScore} size="md" />
              <span className="text-text-primary">
                {verifySummary.avgScore >= 4 ? 'Excellent' : verifySummary.avgScore >= 3 ? 'Correct' : 'À corriger'}
              </span>
            </div>
            <div className="flex items-center gap-3 ml-2">
              <span className="text-brand-green">{verifySummary.ok} ✓</span>
              {verifySummary.warning > 0 && <span className="text-amber-600">{verifySummary.warning} ⚠</span>}
              {verifySummary.error > 0 && <span className="text-brand-red">{verifySummary.error} ✗</span>}
            </div>
            <span className="text-text-disabled ml-auto">{verifySummary.total} langues analysées</span>
          </div>
        )}

        {/* Translation table */}
        <div className="pt-4 space-y-3">
          {displayLangs.map((lang) => {
            const result = verifyResults[lang]
            const langTranslations = translations[lang] || {}

            return (
              <motion.div
                key={lang}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[12px] shadow-sm overflow-hidden"
              >
                {/* Language header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className={`fi fi-${(LANG_TO_FLAG[lang] || lang).toLowerCase()}`} style={{ fontSize: '16px', borderRadius: '2px' }} />
                    <span className="font-semibold text-sm text-text-primary">
                      {LANGUAGE_NAMES[lang] || langToCountryCode(lang)} <span className="text-text-disabled font-normal">({langToCountryCode(lang)})</span>
                    </span>
                    {result && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        result.score >= 4 ? 'bg-brand-green-light text-brand-green' :
                        result.score >= 3 ? 'bg-amber-50 text-amber-600' :
                        'bg-red-50 text-brand-red'
                      }`}>
                        {result.verdict} · {result.score}/5
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleVerify(lang)}
                      disabled={isVerifying}
                      className="text-xs px-2.5 py-1 rounded-[8px] bg-surface text-text-secondary hover:bg-border transition-colors disabled:opacity-50"
                    >
                      {isVerifying ? '⏳ Vérification...' : <><span>🔍 Vérifier</span> <span className={`fi fi-${(LANG_TO_FLAG[lang] || lang).toLowerCase()}`} style={{ fontSize: '10px' }} /> <span>{langToCountryCode(lang)}</span></>}
                    </button>
                    <button
                      onClick={() => openRetranslate(lang)}
                      className="text-xs px-2.5 py-1 rounded-[8px] bg-surface text-text-secondary hover:bg-border transition-colors"
                    >
                      ✨ Corriger <span className={`fi fi-${(LANG_TO_FLAG[lang] || lang).toLowerCase()}`} style={{ fontSize: '10px' }} /> {langToCountryCode(lang)} via IA
                    </button>
                  </div>
                </div>

                {/* Zones */}
                <div className="divide-y divide-border">
                  {zones.map((zone) => {
                    const zoneData = extractedZones[zone]
                    const sourceText = typeof zoneData === 'string' ? zoneData : (zoneData as ExtractedZone).text
                    const zoneObj = typeof zoneData === 'object' ? zoneData as ExtractedZone : null
                    return (
                      <div
                        key={zone}
                        className="relative grid"
                        style={{ gridTemplateColumns: `${splitPct}% ${100 - splitPct}%` }}
                      >
                        {/* Left — FR source */}
                        <div
                          className="px-5 py-3 border-r border-border"
                          style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)' }}
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">FR SOURCE</span>
                            <span className="text-[10px] font-bold text-text-disabled">·</span>
                            <span className="text-[10px] font-semibold text-text-secondary bg-surface px-2 py-0.5 rounded-[4px]">{zone}</span>
                          </div>
                          <p className="text-[15px] text-text-primary leading-relaxed mb-2">{sourceText}</p>
                          {zoneObj && (
                            <div className="flex flex-wrap gap-1">
                              {zoneObj.weight && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">{zoneObj.weight}</span>}
                              {zoneObj.case && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-semibold">{zoneObj.case}</span>}
                              {zoneObj.size && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold">{zoneObj.size}</span>}
                              {zoneObj.color && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface border border-border text-text-secondary font-semibold">{zoneObj.color}</span>}
                            </div>
                          )}
                        </div>
                        {/* Zone de drag invisible sur le séparateur */}
                        <div
                          className="absolute top-0 bottom-0 z-10"
                          style={{ left: `calc(${splitPct}% - 4px)`, width: '8px', cursor: 'col-resize' }}
                          onMouseDown={(e) => {
                            const row = e.currentTarget.closest('.relative') as HTMLDivElement
                            if (row) startDrag(e, row)
                          }}
                        />

                        {/* Right — editable translation */}
                        <div className="px-5 py-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className={`fi fi-${(LANG_TO_FLAG[lang] || lang).toLowerCase()}`} style={{ fontSize: '10px' }} />
                            <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">TRADUCTION {langToCountryCode(lang)}</span>
                          </div>
                          <EditableCell
                            value={langTranslations[zone] || ''}
                            onChange={(v) => updateCell(lang, zone, v)}
                            originalValue={originalTranslationsRef.current[lang]?.[zone] || ''}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Verification feedback */}
                {result && result.commentaire && (
                  <div className={`px-5 py-3 text-xs border-t ${
                    result.score >= 4 ? 'border-brand-green/20 bg-brand-green-light' :
                    result.score >= 3 ? 'border-amber-200 bg-amber-50' :
                    'border-red-200 bg-red-50'
                  }`}>
                    <p className="text-text-primary">{result.commentaire}</p>
                    {result.correction && result.correction !== 'RAS. Le texte est clair et correctement traduit' && (
                      <p className="text-text-secondary mt-1 italic">{result.correction}</p>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Retranslate modal */}
      <AnimatePresence>
        {retranslateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setRetranslateModal(null) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-[16px] shadow-xl p-6 w-full max-w-[480px]"
            >
              <h3 className="font-bold text-text-primary mb-1">
                Corriger via IA — {(LANGUAGE_NAMES[retranslateModal.lang] || retranslateModal.lang.toUpperCase())}
              </h3>
              <p className="text-xs text-text-secondary mb-4">
                Indiquez ce qui ne va pas. Gemini re-traduira en tenant compte de vos remarques.
              </p>
              <textarea
                autoFocus
                value={retranslateModal.comment}
                onChange={(e) => setRetranslateModal((prev) => prev ? { ...prev, comment: e.target.value } : null)}
                placeholder="Ex: Le ton est trop formel. Le code promo ne doit pas être traduit. Le CTA doit être plus percutant..."
                className="w-full px-3 py-2.5 rounded-[8px] border border-border text-sm resize-none focus:border-brand-green focus:outline-none"
                rows={4}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setRetranslateModal(null)}
                  className="flex-1 py-2.5 rounded-[8px] border border-border text-sm text-text-secondary hover:bg-surface transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleRetranslate}
                  disabled={isRetranslating || !retranslateModal.comment.trim()}
                  className="flex-1 py-2.5 rounded-[8px] bg-brand-teal text-white font-semibold text-sm hover:bg-brand-teal-hover transition-colors disabled:opacity-50"
                >
                  {isRetranslating ? '⏳ Correction...' : '✨ Corriger'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Anchor — always rendered to keep page height stable */}
      <div className="flex justify-center py-6 mt-4" style={{ visibility: isAtBottom ? 'visible' : 'hidden' }}>
        <button
          onClick={handleSendToGeneration}
          disabled={isSending || sent}
          className="
            flex items-center gap-2.5
            px-12 py-3 rounded-[16px]
            bg-white text-brand-green font-bold text-sm tracking-wide
            shadow-lg shadow-brand-green/20
            hover:bg-gradient-to-r hover:from-brand-green hover:to-brand-green-hover hover:text-white
            hover:shadow-xl hover:shadow-brand-green/30 hover:scale-[1.03]
            transition-all duration-200
            disabled:opacity-60 disabled:scale-100
          "
        >
          {sent ? '✓ Généré !' : isSending ? 'Envoi...' : 'Générer'}
        </button>
      </div>

      {/* Floating CTA — fades out when anchor is visible */}
      <div
        className="fixed bottom-18 left-1/2 -translate-x-1/2 z-40 transition-opacity duration-300"
        style={{ opacity: isAtBottom ? 0 : 1, pointerEvents: isAtBottom ? 'none' : 'auto' }}
      >
        <button
          onClick={handleSendToGeneration}
          disabled={isSending || sent}
          className="
            flex items-center gap-2.5
            px-12 py-3 rounded-[16px]
            bg-white text-brand-green font-bold text-sm tracking-wide
            shadow-lg shadow-brand-green/20
            hover:bg-gradient-to-r hover:from-brand-green hover:to-brand-green-hover hover:text-white
            hover:shadow-xl hover:shadow-brand-green/30 hover:scale-[1.03]
            transition-all duration-200
            disabled:opacity-60 disabled:scale-100
          "
        >
          {sent ? '✓ Généré !' : isSending ? 'Envoi...' : 'Générer'}
        </button>
      </div>

      <AnimatePresence>
        {toast && (
          <NotificationToast
            message={toast.message}
            variant={toast.variant}
            onDismiss={() => setToast(null)}
          />
        )}
      </AnimatePresence>
    </main>
  )
}

function EditableCell({ value, onChange, originalValue }: { value: string; onChange: (v: string) => void; originalValue: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const hasChanged = originalValue !== '' && value !== originalValue

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="vide"
        rows={1}
        className="
          w-full resize-none overflow-hidden
          text-[15px] text-text-primary leading-relaxed
          px-3 py-2 rounded-[8px]
          border border-border
          bg-white
          transition-all duration-150
          placeholder:text-text-disabled placeholder:italic
          hover:border-brand-teal hover:bg-[#e6f5f7]
          focus:border-brand-green focus:bg-brand-green-light focus:outline-none
          min-h-[44px]
        "
      />
      {hasChanged && (
        <button
          onClick={() => onChange(originalValue)}
          className="absolute bottom-1.5 right-1.5 text-[10px] text-text-disabled hover:text-brand-red transition-colors"
        >
          Réinitialiser
        </button>
      )}
    </div>
  )
}
