'use client'

import { useState, useEffect, useRef, useCallback, DragEvent } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import NotificationToast from '@/components/shared/NotificationToast'
import CountryTagInput from '@/components/config/CountryTagInput'
import AdvancedOptions from '@/components/config/AdvancedOptions'
import type { Resolution, GenerationMode } from '@/components/config/AdvancedOptions'
import type { CountryInfo } from '@/types/countries'
import type { Session } from '@/types/session'
import { getCountryByCode } from '@/lib/countries/country-resolver'

function parseSessionConfig(configStr: string): Record<string, unknown> | null {
  try {
    return JSON.parse(configStr) as Record<string, unknown>
  } catch {
    return null
  }
}

export default function ConfigurePage() {
  const params = useParams()
  const sessionId = params.id as string
  const [session, setSession] = useState<Session | null>(null)
  const [selectedCountries, setSelectedCountries] = useState<CountryInfo[]>([])
  const [resolution, setResolution] = useState<Resolution>('1K')
  const [mode, setMode] = useState<GenerationMode>('standard')
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({})
  const [configFileName, setConfigFileName] = useState<string>('')
  const [configFileContent, setConfigFileContent] = useState<string>('')
  const [configFileDragOver, setConfigFileDragOver] = useState(false)
  const configFileInputRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false)
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' | 'info' } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.session) return
        const s: Session = data.session
        setSession(s)

        // Restore saved config
        if (s.config) {
          const cfg = parseSessionConfig(s.config)
          if (cfg) {
            if (cfg.countries && Array.isArray(cfg.countries) && cfg.countries.length) {
              const countries = (cfg.countries as string[])
                .map((code: string) => getCountryByCode(code))
                .filter((c): c is CountryInfo => c !== null)
              setSelectedCountries(countries)
            }
if (cfg.resolution) setResolution(cfg.resolution as Resolution)
            if (cfg.mode) setMode(cfg.mode as GenerationMode)
            if (cfg.customPrompts) setCustomPrompts(cfg.customPrompts as Record<string, string>)
            if (cfg.configFileName) setConfigFileName(cfg.configFileName as string)
            if (cfg.configFileContent) setConfigFileContent(cfg.configFileContent as string)
          }
        }
      })
      .catch((e) => console.error('[configure] session load', e))
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (selectedCountries.length > 0 && !isSaving) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [selectedCountries, isSaving])

  const ACCEPTED_EXTENSIONS = ['.txt', '.json', '.csv', '.xlsx', '.xls']

  const readConfigFile = useCallback((file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(ext)) return
    if (ext === '.xlsx' || ext === '.xls') {
      setConfigFileName(file.name)
      setConfigFileContent(`[Fichier Excel : ${file.name} — convertissez en CSV ou JSON pour inclure le contenu dans les prompts]`)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setConfigFileName(file.name)
      setConfigFileContent(text || '')
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  const handleConfigFileDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setConfigFileDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) readConfigFile(file)
  }, [readConfigFile])

  const handleConfigFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) readConfigFile(file)
    e.target.value = ''
  }

  const buildConfig = () => {
    const existingConfig = session?.config ? (parseSessionConfig(session.config) ?? {}) : {}
    return {
      ...existingConfig,
      countries: selectedCountries.map((c) => c.code),
      generationMethod: 'google',
      resolution,
      mode,
      customPrompts,
      ...(configFileName ? { configFileName, configFileContent } : {}),
    }
  }

  const doLaunch = async (targetSessionId: string) => {
    try {
      const config = buildConfig()
      await fetch(`/api/sessions/${targetSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: JSON.stringify(config),
          market_count: selectedCountries.length,
          status: 'configuring',
        }),
      })
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: targetSessionId }),
      })
      const genData = await genRes.json()
      if (genData.jobId) {
        window.location.href = `/campaign/${targetSessionId}/generate?jobId=${genData.jobId}`
      } else {
        setToast({ message: genData.error || 'Erreur au démarrage de la génération.', variant: 'error' })
      }
    } catch {
      setToast({ message: 'Impossible de contacter le serveur. Vérifiez votre connexion.', variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLaunch = async () => {
    if (selectedCountries.length === 0 || isSaving) return
    // Si la session a déjà été générée, demander confirmation pour créer une nouvelle
    if (session && session.current_step !== 'configure') {
      setShowNewSessionConfirm(true)
      return
    }
    setIsSaving(true)
    try {
      await doLaunch(sessionId)
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmNewSession = async () => {
    if (isSaving) return
    setShowNewSessionConfirm(false)
    setIsSaving(true)
    try {
      const existingConfig = session?.config ? (parseSessionConfig(session.config) ?? {}) : {}
      const newRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: session?.name || 'Nouvelle campagne',
          image_count: session?.image_count || 0,
          source_path: session?.source_path || '',
          selected_paths: existingConfig.selected_paths,
          current_step: 'configure',
        }),
      })
      const newData = await newRes.json()
      if (newData.session?.id) {
        await doLaunch(newData.session.id)
      }
    } finally {
      setIsSaving(false)
    }
  }


  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-text-secondary">Chargement de la session...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-8 pt-3 pb-12">
      <div className="w-full max-w-[600px] mx-auto">
        {/* Campaign header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 text-center"
        >
          <h1 className="text-2xl font-bold text-text-primary">{session.name}</h1>
          <p className="text-sm text-text-secondary mt-1">
            {session.image_count} images &middot; Configurer les marchés cibles
          </p>
        </motion.div>

        {/* Country selection */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-white rounded-[16px] shadow-sm p-6 mb-4"
        >
          <h2 className="text-sm font-semibold text-text-secondary mb-4">Marchés cibles</h2>
          <CountryTagInput
            selectedCountries={selectedCountries}
            onCountriesChange={setSelectedCountries}
          />
        </motion.div>

        {/* Config file attachment */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.13 }}
          className="bg-white rounded-[16px] shadow-sm p-6 mb-4"
        >
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Données additionnelles
            <span className="ml-2 text-[10px] font-normal text-text-disabled">(optionnel)</span>
          </h2>

          {configFileName ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-brand-green-light border border-brand-green">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-green shrink-0" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span className="text-sm text-brand-green font-semibold flex-1 truncate">{configFileName}</span>
              <button
                onClick={() => { setConfigFileName(''); setConfigFileContent('') }}
                className="text-text-disabled hover:text-brand-red transition-colors text-base"
                title="Retirer le fichier"
              >
                ×
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setConfigFileDragOver(true) }}
              onDragLeave={() => setConfigFileDragOver(false)}
              onDrop={handleConfigFileDrop}
              onClick={() => configFileInputRef.current?.click()}
              className={`
                w-full rounded-[8px] border border-dashed py-5 px-4 text-center cursor-pointer
                transition-colors duration-200
                ${configFileDragOver ? 'border-brand-green bg-brand-green-light' : 'border-border hover:border-brand-green hover:bg-surface'}
              `}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-text-disabled" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <p className="text-sm text-text-secondary">Glissez un fichier ou cliquez pour parcourir</p>
              <p className="text-xs text-text-disabled mt-1">.txt · .json · .csv · .xlsx · .xls</p>
            </div>
          )}
          <input
            ref={configFileInputRef}
            type="file"
            accept=".txt,.json,.csv,.xlsx,.xls"
            onChange={handleConfigFileSelect}
            className="hidden"
          />
          <p className="text-[11px] text-text-disabled mt-2">
            Le contenu du fichier sera transmis à l&apos;IA en complément du prompt — ex. prix par langue, textes spécifiques par marché.
          </p>
        </motion.div>

        {/* Advanced options */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="bg-white rounded-[16px] shadow-sm p-6 mb-4"
        >
          <AdvancedOptions
            selectedCountries={selectedCountries}
            resolution={resolution}
            onResolutionChange={setResolution}
            mode={mode}
            onModeChange={setMode}
            customPrompts={customPrompts}
            onCustomPromptsChange={setCustomPrompts}
          />
        </motion.div>

        {/* Launch buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="flex flex-col items-center gap-2 w-full"
        >
          {selectedCountries.length > 0 && (
            <p className="text-xs text-text-disabled">
              {session.image_count} image{session.image_count !== 1 ? 's' : ''} × {selectedCountries.length} marché{selectedCountries.length !== 1 ? 's' : ''} = {session.image_count * selectedCountries.length} génération{session.image_count * selectedCountries.length !== 1 ? 's' : ''}
            </p>
          )}
          <button
            onClick={handleLaunch}
            disabled={selectedCountries.length === 0 || isSaving}
            className="
              px-10 py-3 rounded-[12px]
              bg-brand-green text-white font-bold text-sm
              hover:bg-brand-green-hover hover:shadow-lg
              transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {isSaving ? 'Enregistrement...' : 'Lancer la traduction'}
          </button>
        </motion.div>
      </div>

      {/* Confirmation nouvelle session */}
      {showNewSessionConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowNewSessionConfirm(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[16px] shadow-xl p-6 max-w-[420px] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-text-primary mb-2">Créer une nouvelle session ?</h3>
            <p className="text-sm text-text-secondary mb-6">
              Votre action va déclencher la création d&apos;une nouvelle session. Êtes-vous sûr de vouloir continuer ?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowNewSessionConfirm(false)}
                className="px-4 py-2 rounded-[8px] text-sm font-semibold border border-border text-text-secondary hover:bg-surface transition-colors"
              >
                Non
              </button>
              <button
                onClick={handleConfirmNewSession}
                disabled={isSaving}
                className="px-4 py-2 rounded-[8px] text-sm font-semibold bg-brand-green text-white hover:bg-brand-green-hover transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Création...' : 'Valider'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

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
