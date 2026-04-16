'use client'

import { useState, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getCountryByCode,
  parseCountryCodesWithErrors,
  getPresetNames,
  getPreset,
} from '@/lib/countries/country-resolver'
import type { CountryInfo } from '@/types/countries'

interface CountryTagInputProps {
  selectedCountries: CountryInfo[]
  onCountriesChange: (countries: CountryInfo[]) => void
}

export default function CountryTagInput({
  selectedCountries,
  onCountriesChange,
}: CountryTagInputProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [unknownCodes, setUnknownCodes] = useState<string[]>([])

  const addCountries = (codes: string[]) => {
    const existingCodes = new Set(selectedCountries.map((c) => c.code))
    const newCountries: CountryInfo[] = []

    for (const code of codes) {
      if (code === 'FR') continue  // Source language — always French, never a target
      if (existingCodes.has(code)) continue
      const country = getCountryByCode(code)
      if (country) {
        newCountries.push(country)
        existingCodes.add(code)
      }
    }

    if (newCountries.length > 0) {
      onCountriesChange([...selectedCountries, ...newCountries])
    }
  }

  const processInput = (text: string) => {
    const result = parseCountryCodesWithErrors(text)
    if (result.valid.length > 0) {
      addCountries(result.valid)
    }
    if (result.unknown.length > 0) {
      setUnknownCodes(result.unknown)
    } else {
      setUnknownCodes([])
    }
    setInputValue('')
  }

  const removeCountry = (code: string) => {
    onCountriesChange(selectedCountries.filter((c) => c.code !== code))
    setActivePreset(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputValue.trim()) {
        processInput(inputValue)
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    processInput(text)
  }

  const handlePreset = (presetName: string) => {
    const codes = getPreset(presetName)
    // Replace all countries with the preset, excluding FR (source language)
    const countries = codes
      .filter((code) => code !== 'FR')
      .map((code) => getCountryByCode(code))
      .filter((c): c is CountryInfo => c !== null)
    onCountriesChange(countries)
    setActivePreset(presetName)
  }

  return (
    <div className="text-left">
      {/* Presets */}
      <div className="flex items-center gap-2 mb-2">
        {getPresetNames().map((name) => {
          const isActive = activePreset === name
          const colorMap: Record<string, string> = {
            'CASANOOV': 'bg-brand-green text-white shadow-sm',
            'CAZEBOO': 'bg-brand-teal text-white shadow-sm',
            'SICAAN': 'text-white shadow-sm',
          }
          const activeStyle = colorMap[name] || 'bg-brand-teal text-white shadow-sm'

          return (
            <motion.button
              key={name}
              onClick={() => handlePreset(name)}
              whileTap={{ scale: 0.95 }}
              className={`
                px-3 py-1.5 rounded-full text-xs font-semibold
                transition-all duration-200
                ${isActive ? activeStyle : 'bg-surface text-text-secondary hover:bg-border'}
              `}
              style={isActive && name === 'SICAAN' ? { backgroundColor: '#dc9083' } : undefined}
            >
              {name}
            </motion.button>
          )
        })}
        {selectedCountries.length > 0 && (
          <motion.button
            onClick={() => { onCountriesChange([]); setActivePreset(null) }}
            whileTap={{ scale: 0.95 }}
            className="px-3 py-1.5 rounded-full text-xs text-text-disabled hover:text-brand-red hover:bg-brand-red-light transition-all duration-200"
          >
            Effacer
          </motion.button>
        )}
      </div>

      {/* Input */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="Tapez ou collez des codes pays (FR, DE, ES...)"
        className="
          w-full px-4 py-3 rounded-[12px]
          border border-border bg-white
          text-text-primary text-sm
          focus:border-brand-green focus:outline-none
          transition-colors duration-200
          mb-3
        "
      />

      {/* Unknown codes warning */}
      {unknownCodes.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 mb-3 bg-brand-red-light rounded-[8px] text-sm">
          <span className="text-brand-red font-semibold shrink-0">!</span>
          <span className="text-brand-red">
            Code{unknownCodes.length > 1 ? 's' : ''} pays inconnu{unknownCodes.length > 1 ? 's' : ''} ignoré{unknownCodes.length > 1 ? 's' : ''} :{' '}
            <strong>{unknownCodes.join(', ')}</strong>
          </span>
          <button
            onClick={() => setUnknownCodes([])}
            className="ml-auto text-brand-red opacity-50 hover:opacity-100 shrink-0"
          >
            &times;
          </button>
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {selectedCountries.map((country) => (
            <motion.span
              key={country.code}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="
                inline-flex items-center gap-1.5
                px-3 py-1.5 bg-surface rounded-full
                text-sm font-semibold text-text-primary
              "
            >
              <span className={`fi fi-${country.code.toLowerCase()}`} style={{ fontSize: '14px', borderRadius: '2px' }} />
              <span>{country.code}</span>
              <button
                onClick={() => removeCountry(country.code)}
                className="text-text-disabled hover:text-brand-red transition-colors ml-0.5"
              >
                &times;
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
