export interface VerificationResult {
  language: string
  findings: VerificationFinding[]
}

export interface VerificationFinding {
  key: string
  status: 'ok' | 'suspicious'
  reason?: string
  originalValue: string
}

export interface TranslationVerifier {
  verify(translations: Record<string, Record<string, string>>): Promise<VerificationResult[]>
}

export type VerifierProvider = 'gemini' | 'openai' | 'anthropic' | 'local'

// Mock verifier for development — simulates finding a few suspicious translations
export class MockVerifier implements TranslationVerifier {
  async verify(
    translations: Record<string, Record<string, string>>
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = []

    for (const [lang, entries] of Object.entries(translations)) {
      const findings: VerificationFinding[] = []

      for (const [key, value] of Object.entries(entries)) {
        // Simulate: ~10% chance of flagging a translation
        if (Math.random() < 0.1) {
          findings.push({
            key,
            status: 'suspicious',
            reason: 'Possible mistranslation detected (simulated)',
            originalValue: value,
          })
        } else {
          findings.push({
            key,
            status: 'ok',
            originalValue: value,
          })
        }
      }

      results.push({ language: lang, findings })
    }

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    return results
  }
}

export function createVerifier(provider: VerifierProvider): TranslationVerifier {
  switch (provider) {
    case 'gemini':
    case 'openai':
    case 'anthropic':
    case 'local':
      // All providers use mock for now
      return new MockVerifier()
    default:
      return new MockVerifier()
  }
}
