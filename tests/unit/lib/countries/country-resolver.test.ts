import { describe, it, expect } from 'vitest'
import {
  getCountryByCode,
  getAllCountries,
  getPreset,
  parseCountryCodes,
  resolveLanguages,
} from '@/lib/countries/country-resolver'

describe('getCountryByCode', () => {
  it('returns country info for valid code', () => {
    const fr = getCountryByCode('FR')
    expect(fr?.name).toBe('France')
    expect(fr?.languages).toEqual(['fr'])
  })

  it('is case-insensitive', () => {
    expect(getCountryByCode('fr')?.code).toBe('FR')
    expect(getCountryByCode('Be')?.code).toBe('BE')
  })

  it('returns null for unknown code', () => {
    expect(getCountryByCode('XX')).toBeNull()
  })
})

describe('getAllCountries', () => {
  it('returns all 23 countries', () => {
    expect(getAllCountries().length).toBe(23)
  })
})

describe('getPreset', () => {
  it('returns all markets except FR (source language)', () => {
    const all = getPreset('All markets')
    expect(all.length).toBe(22)
    expect(all).not.toContain('FR')
  })

  it('returns CASANOOV preset with correct countries', () => {
    const preset = getPreset('CASANOOV')
    expect(preset).toContain('DE')
    expect(preset).toContain('SK')
    expect(preset).toContain('DK')
    expect(preset).not.toContain('FR')
    expect(preset.length).toBe(12)
  })

  it('returns CAZEBOO preset with correct countries', () => {
    const preset = getPreset('CAZEBOO')
    expect(preset.length).toBe(8)
    expect(preset).toContain('DE')
    expect(preset).not.toContain('FR')
  })

  it('returns SICAAN preset with correct countries', () => {
    const preset = getPreset('SICAAN')
    expect(preset).toEqual(['DE', 'ES', 'GR'])
  })

  it('returns empty array for unknown preset', () => {
    expect(getPreset('Unknown')).toEqual([])
  })
})

describe('parseCountryCodes', () => {
  it('parses comma-separated codes', () => {
    expect(parseCountryCodes('FR,DE,ES')).toEqual(['FR', 'DE', 'ES'])
  })

  it('parses space-separated codes', () => {
    expect(parseCountryCodes('FR DE ES')).toEqual(['FR', 'DE', 'ES'])
  })

  it('handles mixed separators', () => {
    expect(parseCountryCodes('FR, DE; ES  IT')).toEqual(['FR', 'DE', 'ES', 'IT'])
  })

  it('is case-insensitive', () => {
    expect(parseCountryCodes('fr,de')).toEqual(['FR', 'DE'])
  })

  it('filters out invalid codes', () => {
    expect(parseCountryCodes('FR,XX,DE')).toEqual(['FR', 'DE'])
  })

  it('returns empty for empty input', () => {
    expect(parseCountryCodes('')).toEqual([])
  })
})

describe('resolveLanguages', () => {
  it('resolves single-language country', () => {
    const langs = resolveLanguages(['FR'])
    expect(langs.length).toBe(1)
    expect(langs[0].code).toBe('fr')
    expect(langs[0].sourceCountries).toEqual(['FR'])
  })

  it('resolves Belgium to FR + NL', () => {
    const langs = resolveLanguages(['BE'])
    expect(langs.length).toBe(2)
    const codes = langs.map((l) => l.code).sort()
    expect(codes).toEqual(['fr', 'nl'])
  })

  it('resolves Luxembourg to FR + DE', () => {
    const langs = resolveLanguages(['LU'])
    const codes = langs.map((l) => l.code).sort()
    expect(codes).toEqual(['de', 'fr'])
  })

  it('deduplicates languages across countries', () => {
    const langs = resolveLanguages(['FR', 'BE'])
    const frLang = langs.find((l) => l.code === 'fr')
    expect(frLang?.sourceCountries).toContain('FR')
    expect(frLang?.sourceCountries).toContain('BE')
  })

  it('handles GB and IE sharing English', () => {
    const langs = resolveLanguages(['GB', 'IE'])
    expect(langs.length).toBe(1)
    expect(langs[0].code).toBe('en')
    expect(langs[0].sourceCountries).toEqual(['GB', 'IE'])
  })

  it('returns empty for no countries', () => {
    expect(resolveLanguages([])).toEqual([])
  })
})
