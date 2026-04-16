'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const LANG_TO_FLAG: Record<string, string> = {
  el: 'gr', cs: 'cz', da: 'dk', sv: 'se', sl: 'si', en: 'gb',
}
function flagCode(lang: string): string {
  return (LANG_TO_FLAG[lang] || lang).toLowerCase()
}

const LANGUAGE_NAMES: Record<string, string> = {
  nl: 'Néerlandais', de: 'Allemand', cs: 'Tchèque', da: 'Danois',
  es: 'Espagnol', fi: 'Finnois', en: 'Anglais', el: 'Grec', hr: 'Croate',
  hu: 'Hongrois', it: 'Italien', lt: 'Lituanien', lv: 'Letton',
  pl: 'Polonais', pt: 'Portugais', ro: 'Roumain', sv: 'Suédois',
  sl: 'Slovène', sk: 'Slovaque', fr: 'Français',
}

export default function TranslationsPage() {
  const params = useParams()
  const sessionId = params.id as string
  const [jobId, setJobId] = useState<string | null>(null)
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>({})
  const [extractedZones, setExtractedZones] = useState<Record<string, { text: string } | string>>({})
  const [loading, setLoading] = useState(true)
  const [activeLang, setActiveLang] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const scanRes = await fetch(`/api/generate/by-session/${sessionId}`)
        if (!scanRes.ok) return
        const { jobId: jid } = await scanRes.json()
        if (!jid || cancelled) return
        setJobId(jid)

        const statusRes = await fetch(`/api/generate/${jid}/status`)
        const statusData = await statusRes.json()
        if (cancelled) return

        const cfg = statusData.config ? JSON.parse(statusData.config) : statusData
        const t = cfg.approvedTranslations || cfg.preTranslationLog?.translations || cfg.translationsJSON || {}
        const z = cfg.preTranslationLog?.extractedZones || {}
        setTranslations(t)
        setExtractedZones(z)
        const langs = Object.keys(t)
        if (langs.length > 0) setActiveLang(langs[0])
      } catch {}
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId])

  const languages = Object.keys(translations)
  const zones = Object.keys(extractedZones)
  const displayLangs = activeLang ? [activeLang] : languages

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-text-secondary text-sm">Chargement des traductions...</p>
      </main>
    )
  }

  if (languages.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-text-secondary text-sm">Aucune traduction disponible pour cette session.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24">
      <div className="max-w-[1100px] mx-auto px-4">
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm pt-4 pb-3 -mx-4 px-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-text-primary">Traductions générées</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-secondary">{zones.length} zones · {languages.length} langues</span>
              {jobId && (
                <a
                  href={`/api/translations/${jobId}`}
                  download="translations.json"
                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-surface text-text-secondary hover:bg-border transition-colors"
                >
                  ⬇ translations.json
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setActiveLang(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!activeLang ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
            >
              Toutes
            </button>
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => setActiveLang(lang === activeLang ? null : lang)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeLang === lang ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}
              >
                <span className={`fi fi-${flagCode(lang)}`} style={{ fontSize: '10px' }} />
                {(LANG_TO_FLAG[lang] || lang).toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 space-y-3">
          {displayLangs.map((lang) => (
            <div key={lang} className="bg-white rounded-[12px] shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
                <span className={`fi fi-${flagCode(lang)}`} style={{ fontSize: '16px' }} />
                <span className="font-semibold text-sm text-text-primary">
                  {LANGUAGE_NAMES[lang] || lang.toUpperCase()}
                </span>
                <span className="text-text-disabled text-xs">({(LANG_TO_FLAG[lang] || lang).toUpperCase()})</span>
              </div>
              <div className="divide-y divide-border">
                {zones.length > 0 ? zones.map((zone) => {
                  const zoneData = extractedZones[zone]
                  const fr = typeof zoneData === 'string' ? zoneData : zoneData?.text || ''
                  const translated = translations[lang]?.[zone] || ''
                  return (
                    <div key={zone} className="grid grid-cols-[180px_1fr_1fr] gap-0">
                      <div className="px-4 py-3 bg-surface border-r border-border">
                        <p className="text-xs font-semibold text-text-secondary">{zone}</p>
                      </div>
                      <div className="px-4 py-3 border-r border-border">
                        <p className="text-[10px] text-text-disabled mb-1 uppercase font-semibold tracking-wide">FR</p>
                        <p className="text-sm text-text-secondary">{fr}</p>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-[10px] text-text-disabled mb-1 uppercase font-semibold tracking-wide">{(LANG_TO_FLAG[lang] || lang).toUpperCase()}</p>
                        <p className="text-sm text-text-primary">{translated}</p>
                      </div>
                    </div>
                  )
                }) : Object.entries(translations[lang] || {}).map(([zone, text]) => (
                  <div key={zone} className="grid grid-cols-[180px_1fr] gap-0">
                    <div className="px-4 py-3 bg-surface border-r border-border">
                      <p className="text-xs font-semibold text-text-secondary">{zone}</p>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-sm text-text-primary">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <a
          href={`/campaign/${sessionId}/review`}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-brand-green/90 backdrop-blur-sm text-white font-semibold text-sm hover:bg-brand-green hover:shadow-xl hover:scale-105 transition-all duration-200 shadow-lg"
        >
          Voir les visuels →
        </a>
      </div>
    </main>
  )
}
