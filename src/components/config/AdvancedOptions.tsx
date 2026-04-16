'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { resolveLanguages } from '@/lib/countries/country-resolver'
import type { CountryInfo } from '@/types/countries'

export type GenerationMethod = 'standard' | 'precision' | 'google'
export type Resolution = '1K' | '2K'
export type GenerationMode = 'standard' | 'batch'

interface AdvancedOptionsProps {
  selectedCountries: CountryInfo[]
  resolution: Resolution
  onResolutionChange: (r: Resolution) => void
  mode: GenerationMode
  onModeChange: (m: GenerationMode) => void
  customPrompts: Record<string, string>
  onCustomPromptsChange: (prompts: Record<string, string>) => void
}

function PillToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T; disabled?: boolean }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex border border-border rounded-full overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => !opt.disabled && onChange(opt.value)}
          disabled={opt.disabled}
          title={opt.disabled ? 'Temporairement désactivé' : undefined}
          className={`
            px-4 py-1.5 text-sm font-semibold transition-all duration-200 outline-none
            ${opt.disabled
              ? 'bg-surface text-text-disabled cursor-not-allowed opacity-50'
              : value === opt.value
              ? 'bg-brand-green text-white'
              : 'bg-white text-text-secondary hover:bg-surface'
            }
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function AdvancedOptions({
  selectedCountries,
  resolution,
  onResolutionChange,
  mode,
  onModeChange,
  customPrompts,
  onCustomPromptsChange,
}: AdvancedOptionsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedLangs, setExpandedLangs] = useState<Set<string>>(new Set())

  const resolvedLangs = resolveLanguages(selectedCountries.map((c) => c.code))

  const toggleLang = (langCode: string) => {
    setExpandedLangs((prev) => {
      const next = new Set(prev)
      if (next.has(langCode)) next.delete(langCode)
      else next.add(langCode)
      return next
    })
  }

  const updatePrompt = (langCode: string, value: string) => {
    onCustomPromptsChange({ ...customPrompts, [langCode]: value })
  }

  return (
    <div>
      {/* Collapse trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-semibold text-brand-teal hover:text-brand-teal-hover transition-colors"
      >
        <motion.span
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-xs"
        >
          ▶
        </motion.span>
        Options avancées
      </button>

      {/* Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-4 p-4 bg-surface rounded-[12px] space-y-4">
              {/* Generation method — only Natif shown, others kept for backward compat */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-text-secondary w-24">Méthode</span>
                <span className="text-sm font-semibold text-brand-green">Natif</span>
              </div>

              {/* Resolution */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-text-secondary w-24">Résolution</span>
                <PillToggle
                  options={[
                    { label: '1K', value: '1K' as Resolution },
                    { label: '2K', value: '2K' as Resolution },
                  ]}
                  value={resolution}
                  onChange={onResolutionChange}
                />
              </div>

              {/* Mode */}
              <div className="flex items-start gap-4">
                <span className="text-sm font-semibold text-text-secondary w-24 pt-1">Mode</span>
                <div className="flex flex-col items-start gap-1">
                  <PillToggle
                    options={[
                      { label: 'Standard', value: 'standard' as GenerationMode },
                      { label: 'Batch', value: 'batch' as GenerationMode },
                    ]}
                    value={mode}
                    onChange={onModeChange}
                  />
                  <AnimatePresence>
                    {mode === 'batch' && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-text-disabled"
                      >
                        Soumet toutes les images en une seule requête — 50% moins cher, jusqu&apos;à 24h
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Custom prompts per language */}
              {resolvedLangs.length > 0 && (
                <div>
                  <span className="text-sm font-semibold text-text-secondary block mb-2">
                    Corrections par langue
                  </span>
                  <div className="space-y-1">
                    {resolvedLangs.map((lang, i) => (
                      <motion.div
                        key={lang.code}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.03 }}
                      >
                        <button
                          onClick={() => toggleLang(lang.code)}
                          className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-[8px] hover:bg-white transition-colors text-sm"
                        >
                          <span className="text-brand-teal text-xs">
                            {expandedLangs.has(lang.code) ? '−' : '+'}
                          </span>
                          <span className="font-medium text-text-primary">
                            {lang.name}
                          </span>
                          <span className="text-text-disabled text-xs">
                            ({lang.sourceCountries.join(', ')})
                          </span>
                        </button>
                        <AnimatePresence>
                          {expandedLangs.has(lang.code) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <textarea
                                value={customPrompts[lang.code] || ''}
                                onChange={(e) => updatePrompt(lang.code, e.target.value)}
                                placeholder={`Ex : "Le prix est 49,99 EUR" — correction spécifique pour ${lang.name}...`}
                                rows={2}
                                className="
                                  w-full mt-1 mb-2 ml-6 px-3 py-2
                                  text-sm bg-white border border-border rounded-[8px]
                                  focus:border-brand-green focus:outline-none
                                  transition-colors duration-200 resize-none
                                "
                                style={{ width: 'calc(100% - 24px)' }}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
