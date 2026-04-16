'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const GEMINI_MODELS = [
  { group: 'Gemini 3 (Preview)', models: [
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite Preview' },
    { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview (NB2)' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview' },
  ]},
  { group: 'Gemini 2.5', models: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ]},
  { group: 'Gemini 2.0', models: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  ]},
  { group: 'Gemini 1.5', models: [
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ]},
]

const ALL_LANGUAGES = [
  { code: 'nl', label: 'Néerlandais' },
  { code: 'de', label: 'Allemand' },
  { code: 'es', label: 'Espagnol' },
  { code: 'it', label: 'Italien' },
  { code: 'pt', label: 'Portugais' },
  { code: 'pl', label: 'Polonais' },
  { code: 'cs', label: 'Tchèque' },
  { code: 'sk', label: 'Slovaque' },
  { code: 'ro', label: 'Roumain' },
  { code: 'hu', label: 'Hongrois' },
  { code: 'hr', label: 'Croate' },
  { code: 'sl', label: 'Slovène' },
  { code: 'da', label: 'Danois' },
  { code: 'sv', label: 'Suédois' },
  { code: 'fi', label: 'Finnois' },
  { code: 'el', label: 'Grec' },
  { code: 'lt', label: 'Lituanien' },
  { code: 'lv', label: 'Letton' },
  { code: 'en', label: 'Anglais' },
]

interface LabResult {
  extractModel: string
  translateModel: string
  extractPrompt: string
  extractRaw: string
  extractError?: string
  extractDurationMs: number
  extractedZones: Record<string, string>
  translatePrompt: string | null
  translateRaw: string
  translateError?: string
  translateDurationMs: number
  translations: Record<string, Record<string, string>> | null
}

const ALL_MODEL_VALUES = GEMINI_MODELS.flatMap((g) => g.models.map((m) => m.value))

function ModelSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isCustom = !ALL_MODEL_VALUES.includes(value)
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{label}</label>
      <select
        value={isCustom ? '__custom__' : value}
        onChange={(e) => { if (e.target.value !== '__custom__') onChange(e.target.value) }}
        className="px-3 py-2 rounded-[8px] border border-border bg-white text-sm text-text-primary focus:border-brand-teal focus:outline-none"
      >
        {GEMINI_MODELS.map((group) => (
          <optgroup key={group.group} label={group.group}>
            {group.models.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </optgroup>
        ))}
        <optgroup label="Autre">
          <option value="__custom__">ID personnalisé…</option>
        </optgroup>
      </select>
      {(isCustom || value === '__custom__') && (
        <input
          type="text"
          value={isCustom ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ex: gemini-3.1-pro-exp-0123"
          className="px-3 py-2 rounded-[8px] border border-border bg-white text-sm text-text-primary focus:border-brand-teal focus:outline-none font-mono"
        />
      )}
    </div>
  )
}

function CollapsibleBlock({ title, content, defaultOpen = false, badge }: { title: string; content: string; defaultOpen?: boolean; badge?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-[8px] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface text-left hover:bg-gray-100 transition-colors"
      >
        <span className="text-xs font-semibold text-text-secondary">{title}</span>
        <div className="flex items-center gap-2">
          {badge && <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full font-semibold">{badge}</span>}
          <span className="text-text-disabled text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <pre className="px-3 py-2 text-[11px] text-text-secondary whitespace-pre-wrap break-words bg-white font-mono leading-relaxed max-h-[300px] overflow-y-auto">
              {content}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function LabPage() {
  const [extractModel, setExtractModel] = useState('gemini-3.1-flash-lite-preview')
  const [translateModel, setTranslateModel] = useState('gemini-3.1-pro-preview')
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['nl', 'de', 'es'])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LabResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    )
  }

  const handleImageChange = (file: File) => {
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleImageChange(file)
  }

  const handleRun = async () => {
    if (!imageFile || selectedLangs.length === 0) return
    setLoading(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('image', imageFile)
    formData.append('extractModel', extractModel)
    formData.append('translateModel', translateModel)
    formData.append('targetLanguages', JSON.stringify(selectedLangs))

    try {
      const res = await fetch('/api/admin/lab', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erreur inconnue'); return }
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[800px] mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover font-semibold">← Admin</a>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Laboratoire de modèles</h1>
          <p className="text-sm text-text-secondary mt-1">Tester l&apos;extraction + traduction avec différents modèles Gemini</p>
        </motion.div>

        <div className="space-y-6">
          {/* Config */}
          <div className="bg-white rounded-[12px] shadow-sm p-5 space-y-5">
            <h2 className="text-sm font-bold text-text-primary">Configuration</h2>

            <div className="grid grid-cols-2 gap-4">
              <ModelSelect label="Étape 1 — Extraction (vision)" value={extractModel} onChange={setExtractModel} />
              <ModelSelect label="Étape 2 — Traduction (texte)" value={translateModel} onChange={setTranslateModel} />
            </div>

            {/* Language picker */}
            <div>
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide block mb-2">
                Langues cibles
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => toggleLang(lang.code)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                      selectedLangs.includes(lang.code)
                        ? 'bg-brand-teal text-white border-brand-teal'
                        : 'bg-white text-text-secondary border-border hover:border-brand-teal'
                    }`}
                  >
                    {lang.code.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-disabled mt-1">{selectedLangs.length} langue{selectedLangs.length > 1 ? 's' : ''} sélectionnée{selectedLangs.length > 1 ? 's' : ''}</p>
            </div>

            {/* Image drop zone */}
            <div>
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide block mb-2">
                Image source (français)
              </label>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-[12px] p-4 cursor-pointer hover:border-brand-teal transition-colors flex items-center gap-4"
              >
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="preview" className="h-20 w-20 object-contain rounded-[8px] shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{imageFile?.name}</p>
                      <p className="text-xs text-text-disabled">{imageFile ? Math.round(imageFile.size / 1024) + ' KB' : ''}</p>
                      <p className="text-xs text-brand-teal mt-1">Cliquer pour changer</p>
                    </div>
                  </>
                ) : (
                  <div className="w-full text-center py-4">
                    <p className="text-text-disabled text-sm">Glisser une image ou cliquer pour choisir</p>
                    <p className="text-text-disabled text-xs mt-0.5">JPG, PNG, WEBP</p>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleImageChange(e.target.files[0]) }} />
            </div>

            <button
              onClick={handleRun}
              disabled={!imageFile || selectedLangs.length === 0 || loading}
              className="w-full py-2.5 rounded-[8px] text-sm font-semibold bg-brand-teal text-white hover:bg-brand-teal-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Test en cours...' : '▶ Lancer le test'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-[12px] p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="bg-white rounded-[12px] shadow-sm p-8 flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full"
              />
              <p className="text-sm text-text-secondary">Extraction + traduction en cours...</p>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

              {/* Étape 1 */}
              <div className="bg-white rounded-[12px] shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-text-primary">Étape 1 — Extraction</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-semibold">{result.extractModel}</span>
                    <span className="text-[11px] text-text-disabled">{result.extractDurationMs}ms</span>
                    {result.extractError
                      ? <span className="text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">Erreur</span>
                      : <span className="text-[11px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-semibold">{Object.keys(result.extractedZones).length} zones</span>
                    }
                  </div>
                </div>

                {result.extractError && (
                  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-[8px]">{result.extractError}</p>
                )}

                {Object.keys(result.extractedZones).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(result.extractedZones).map(([zone, text]) => (
                      <div key={zone} className="flex gap-3 text-sm px-3 py-1.5 bg-surface rounded-[8px]">
                        <span className="text-text-disabled font-mono text-xs w-32 shrink-0 pt-0.5">{zone}</span>
                        <span className="text-text-primary font-medium">{text}</span>
                      </div>
                    ))}
                  </div>
                )}

                <CollapsibleBlock title="Prompt envoyé" content={result.extractPrompt} />
                {result.extractRaw && <CollapsibleBlock title="Réponse brute" content={result.extractRaw} />}
              </div>

              {/* Étape 2 */}
              <div className="bg-white rounded-[12px] shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-text-primary">Étape 2 — Traduction</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">{result.translateModel}</span>
                    <span className="text-[11px] text-text-disabled">{result.translateDurationMs}ms</span>
                    {result.translateError
                      ? <span className="text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">Erreur</span>
                      : result.translations && <span className="text-[11px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-semibold">{Object.keys(result.translations).length} langues</span>
                    }
                  </div>
                </div>

                {result.translateError && (
                  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-[8px]">{result.translateError}</p>
                )}

                {result.translations && (
                  <div className="space-y-3">
                    {Object.entries(result.translations).map(([lang, zones]) => (
                      <div key={lang}>
                        <p className="text-xs font-bold text-text-secondary uppercase mb-1">{lang}</p>
                        <div className="space-y-1">
                          {Object.entries(zones).map(([zone, text]) => (
                            <div key={zone} className="flex gap-3 text-sm px-3 py-1.5 bg-surface rounded-[8px]">
                              <span className="text-text-disabled font-mono text-xs w-32 shrink-0 pt-0.5">{zone}</span>
                              <span className="text-text-primary font-medium">{text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {result.translatePrompt && <CollapsibleBlock title="Prompt envoyé" content={result.translatePrompt} />}
                {result.translateRaw && <CollapsibleBlock title="Réponse brute" content={result.translateRaw} />}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  )
}
