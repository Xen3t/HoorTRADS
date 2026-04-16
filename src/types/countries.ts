export interface CountryInfo {
  code: string
  name: string
  flagEmoji: string
  languages: string[]
}

export interface ResolvedLanguage {
  code: string
  name: string
  sourceCountries: string[]
}
