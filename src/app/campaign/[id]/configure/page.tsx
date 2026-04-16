'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import CountryTagInput from '@/components/config/CountryTagInput'
import VerificationToggle from '@/components/config/VerificationToggle'
import AdvancedOptions from '@/components/config/AdvancedOptions'
import type { Resolution, GenerationMode } from '@/components/config/AdvancedOptions'
import type { CountryInfo } from '@/types/countries'
import type { Session } from '@/types/session'

export default function ConfigurePage() {
  const params = useParams()
  const sessionId = params.id as string
  const [session, setSession] = useState<Session | null>(null)
  const [selectedCountries, setSelectedCountries] = useState<CountryInfo[]>([])
  const [verificationEnabled, setVerificationEnabled] = useState(false)
  const [resolution, setResolution] = useState<Resolution>('1K')
  const [mode, setMode] = useState<GenerationMode>('standard')
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.session) setSession(data.session)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const handleLaunch = async () => {
    if (selectedCountries.length === 0 || isSaving) return
    setIsSaving(true)

    try {
      // Preserve existing selected_paths from session config
      const existingConfig = session?.config ? JSON.parse(session.config) : {}

      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: JSON.stringify({
            ...existingConfig,
            countries: selectedCountries.map((c) => c.code),
            resolution,
            mode,
            verificationEnabled,
            customPrompts,
          }),
          market_count: selectedCountries.length,
          status: 'configuring',
        }),
      })

      // Start generation
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const genData = await genRes.json()

      if (genData.jobId) {
        window.location.href = `/campaign/${sessionId}/generate?jobId=${genData.jobId}`
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
    <main className="min-h-screen px-8 pt-16 pb-12">
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

        {/* Verification toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-white rounded-[16px] shadow-sm px-6 py-4 mb-6"
        >
          <VerificationToggle
            enabled={verificationEnabled}
            onChange={setVerificationEnabled}
          />
        </motion.div>

        {/* Launch button */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          onClick={handleLaunch}
          disabled={selectedCountries.length === 0 || isSaving}
          className="
            px-10 py-3 rounded-[12px] mx-auto block
            bg-brand-green text-white font-bold text-sm
            hover:bg-brand-green-hover hover:shadow-lg
            transition-all duration-200
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {isSaving
            ? 'Enregistrement...'
            : `Lancer la traduction — ${session.image_count} images × ${selectedCountries.length} marchés`}
        </motion.button>
      </div>
    </main>
  )
}
