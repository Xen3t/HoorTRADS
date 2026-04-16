const LONG_WORD_LANGUAGES = ['de', 'fi', 'hu', 'nl', 'hr', 'el']

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French', nl: 'Dutch', de: 'German', cs: 'Czech', da: 'Danish',
  es: 'Spanish', fi: 'Finnish', en: 'English', el: 'Greek', hr: 'Croatian',
  hu: 'Hungarian', it: 'Italian', lt: 'Lithuanian', lv: 'Latvian',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', sv: 'Swedish',
  sl: 'Slovenian', sk: 'Slovak',
}

interface PromptOptions {
  targetLanguage: string
  customPrompt?: string
  glossaryTerms?: { source: string; target: string }[]
}

export function buildTranslationPrompt(options: PromptOptions): string {
  const { targetLanguage, customPrompt, glossaryTerms } = options
  const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage

  const parts: string[] = []

  // Custom corrections take priority — stated first
  if (customPrompt && customPrompt.trim()) {
    parts.push(
      `IMPORTANT corrections to apply first:\n${customPrompt.trim()}`
    )
  }

  // System prompt
  parts.push(
    `Translate all text in this image to ${langName}. ` +
    `Do not change any other elements of the image — preserve the layout, colors, fonts, and design exactly as they are.`
  )

  // Condensation for long-word languages
  if (LONG_WORD_LANGUAGES.includes(targetLanguage)) {
    parts.push(
      `${langName} may produce longer words or phrases. ` +
      `If the translated text would exceed the original text boundaries, condense the phrasing while preserving the meaning.`
    )
  }

  // Glossary terms
  if (glossaryTerms && glossaryTerms.length > 0) {
    const termList = glossaryTerms
      .map((t) => `"${t.source}" -> "${t.target}"`)
      .join(', ')
    parts.push(`Use these specific translations: ${termList}`)
  }

  return parts.join('\n\n')
}
