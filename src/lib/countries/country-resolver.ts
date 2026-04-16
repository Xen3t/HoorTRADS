import type { CountryInfo, ResolvedLanguage } from '@/types/countries'

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French',
  nl: 'Dutch',
  de: 'German',
  cs: 'Czech',
  da: 'Danish',
  es: 'Spanish',
  fi: 'Finnish',
  en: 'English',
  el: 'Greek',
  hr: 'Croatian',
  hu: 'Hungarian',
  it: 'Italian',
  lt: 'Lithuanian',
  lv: 'Latvian',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  sv: 'Swedish',
  sl: 'Slovenian',
  sk: 'Slovak',
}

const COUNTRY_MAP: Record<string, CountryInfo> = {
  BE: { code: 'BE', name: 'Belgium', flagEmoji: '🇧🇪', languages: ['fr', 'nl'] },
  CZ: { code: 'CZ', name: 'Czech Republic', flagEmoji: '🇨🇿', languages: ['cs'] },
  DE: { code: 'DE', name: 'Germany', flagEmoji: '🇩🇪', languages: ['de'] },
  DK: { code: 'DK', name: 'Denmark', flagEmoji: '🇩🇰', languages: ['da'] },
  ES: { code: 'ES', name: 'Spain', flagEmoji: '🇪🇸', languages: ['es'] },
  FI: { code: 'FI', name: 'Finland', flagEmoji: '🇫🇮', languages: ['fi'] },
  FR: { code: 'FR', name: 'France', flagEmoji: '🇫🇷', languages: ['fr'] },
  GB: { code: 'GB', name: 'United Kingdom', flagEmoji: '🇬🇧', languages: ['en'] },
  GR: { code: 'GR', name: 'Greece', flagEmoji: '🇬🇷', languages: ['el'] },
  HR: { code: 'HR', name: 'Croatia', flagEmoji: '🇭🇷', languages: ['hr'] },
  HU: { code: 'HU', name: 'Hungary', flagEmoji: '🇭🇺', languages: ['hu'] },
  IE: { code: 'IE', name: 'Ireland', flagEmoji: '🇮🇪', languages: ['en'] },
  IT: { code: 'IT', name: 'Italy', flagEmoji: '🇮🇹', languages: ['it'] },
  LT: { code: 'LT', name: 'Lithuania', flagEmoji: '🇱🇹', languages: ['lt'] },
  LU: { code: 'LU', name: 'Luxembourg', flagEmoji: '🇱🇺', languages: ['fr', 'de'] },
  LV: { code: 'LV', name: 'Latvia', flagEmoji: '🇱🇻', languages: ['lv'] },
  NL: { code: 'NL', name: 'Netherlands', flagEmoji: '🇳🇱', languages: ['nl'] },
  PL: { code: 'PL', name: 'Poland', flagEmoji: '🇵🇱', languages: ['pl'] },
  PT: { code: 'PT', name: 'Portugal', flagEmoji: '🇵🇹', languages: ['pt'] },
  RO: { code: 'RO', name: 'Romania', flagEmoji: '🇷🇴', languages: ['ro'] },
  SE: { code: 'SE', name: 'Sweden', flagEmoji: '🇸🇪', languages: ['sv'] },
  SI: { code: 'SI', name: 'Slovenia', flagEmoji: '🇸🇮', languages: ['sl'] },
  SK: { code: 'SK', name: 'Slovakia', flagEmoji: '🇸🇰', languages: ['sk'] },
}

const PRESETS: Record<string, string[]> = {
  'Tous les marchés': Object.keys(COUNTRY_MAP).filter((c) => c !== 'FR'),
  'CASANOOV': ['DE', 'GB', 'ES', 'IT', 'BE', 'NL', 'PT', 'IE', 'SK', 'CZ', 'SE', 'DK'],
  'CAZEBOO': ['DE', 'GB', 'ES', 'IT', 'BE', 'NL', 'PT', 'IE'],
  'SICAAN': ['DE', 'ES', 'GR'],
}

export function getCountryByCode(code: string): CountryInfo | null {
  return COUNTRY_MAP[code.toUpperCase()] || null
}

export function getAllCountries(): CountryInfo[] {
  return Object.values(COUNTRY_MAP)
}

export function getPreset(name: string): string[] {
  return PRESETS[name] || []
}

export function getPresetNames(): string[] {
  return Object.keys(PRESETS)
}

export interface ParseResult {
  valid: string[]
  unknown: string[]
}

export function parseCountryCodes(input: string): string[] {
  return input
    .split(/[,\s;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((code) => code.length > 0 && COUNTRY_MAP[code])
}

export function parseCountryCodesWithErrors(input: string): ParseResult {
  const tokens = input
    .split(/[,\s;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((code) => code.length > 0)

  const valid: string[] = []
  const unknown: string[] = []

  for (const code of tokens) {
    if (COUNTRY_MAP[code]) {
      valid.push(code)
    } else {
      unknown.push(code)
    }
  }

  return { valid, unknown }
}

export function resolveLanguages(countryCodes: string[]): ResolvedLanguage[] {
  const langMap = new Map<string, Set<string>>()

  for (const code of countryCodes) {
    const country = COUNTRY_MAP[code.toUpperCase()]
    if (!country) continue

    for (const lang of country.languages) {
      if (!langMap.has(lang)) {
        langMap.set(lang, new Set())
      }
      langMap.get(lang)!.add(code.toUpperCase())
    }
  }

  return Array.from(langMap.entries()).map(([langCode, sources]) => ({
    code: langCode,
    name: LANGUAGE_NAMES[langCode] || langCode,
    sourceCountries: Array.from(sources),
  }))
}
