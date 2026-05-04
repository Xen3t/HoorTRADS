import fs from 'fs'
import path from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import { getModel } from '@/lib/gemini/gemini-client'
import { inferProvider, isTestModel } from '@/lib/provider-utils'

export interface TaskVerificationResult {
  taskId: string
  score: number  // 0-5
  extractedText: Record<string, string>
  issues: string[]
  summary: string
}

export interface TextVerificationResult {
  targetLanguage: string
  score: number  // 0-5
  verdict: string  // VALIDE | LIMITE | À CORRIGER
  commentaire: string
  correction: string
  issues: string[]
}

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French', nl: 'Dutch', de: 'German', cs: 'Czech', da: 'Danish',
  es: 'Spanish', fi: 'Finnish', en: 'English', el: 'Greek', hr: 'Croatian',
  hu: 'Hungarian', it: 'Italian', lt: 'Lithuanian', lv: 'Latvian',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', sv: 'Swedish',
  sl: 'Slovenian', sk: 'Slovak',
}

function getApiKey(): string {
  let key: string | null = null
  try { key = getAppConfig(getDb(), 'gemini_api_key') } catch {}
  if (!key) key = process.env.GEMINI_API_KEY ?? null
  if (!key) throw new Error('Gemini API key not configured')
  return key
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || 'image/jpeg'
}

function isBackupEnabled(): boolean {
  try {
    const val = getAppConfig(getDb(), 'backup_enabled')
    if (val === null || val === undefined) return true
    return val === 'true' || val === '1'
  } catch { return true }
}

function getPrimaryVerifyModel(): string {
  try {
    const db = getDb()
    return getAppConfig(db, 'primary_model_verify') || getModel('model_verify')
  } catch { return getModel('model_verify') }
}

function getBackupVerifyModel(): string {
  try { return getAppConfig(getDb(), 'backup_model_verify') || '' } catch { return '' }
}

async function callVerifyModel(
  modelId: string,
  prompt: string,
  imageData?: { base64: string; mimeType: string }
): Promise<string> {
  if (isTestModel(modelId)) throw new Error('TEST model — toujours en échec (test backup)')
  const provider = inferProvider(modelId)
  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai')
    const key = (() => { try { return getAppConfig(getDb(), 'openai_api_key') || process.env.OPENAI_API_KEY || null } catch { return null } })()
    if (!key) throw new Error('OpenAI key not configured')
    const openai = new OpenAI({ apiKey: key })
    const content: ChatCompletionContentPart[] = imageData
      ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } },
        ]
      : [{ type: 'text', text: prompt }]
    const res = await openai.chat.completions.create({
      model: modelId,
      messages: [{ role: 'user', content }],
    })
    return res.choices[0]?.message?.content?.trim() || ''
  }
  // Gemini
  const client = new GoogleGenerativeAI(getApiKey())
  const model = client.getGenerativeModel({ model: modelId, generationConfig: { temperature: 0.1 } })
  const parts = imageData
    ? [{ text: prompt }, { inlineData: { mimeType: imageData.mimeType, data: imageData.base64 } }]
    : [{ text: prompt }]
  const response = await model.generateContent({ contents: [{ role: 'user', parts }] })
  return response.response.text().trim()
}

/**
 * Text-only verification — no image needed.
 * Compares French source zones against translated zones for a single language.
 */
export async function verifyTranslationsText(
  frenchZones: Record<string, string>,
  translatedZones: Record<string, string>,
  targetLanguage: string
): Promise<TextVerificationResult> {
  const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage

  const sourceLines = Object.entries(frenchZones).map(([k, v]) => `  "${k}": "${v}"`).join('\n')
  const translatedLines = Object.entries(translatedZones).map(([k, v]) => `  "${k}": "${v}"`).join('\n')

  const prompt = `Tu es un validateur de texte publicitaire.

Ta mission est uniquement de vérifier la clarté, la cohérence, la fidélité au sens et la correction grammaticale d'un message dans la langue cible.

Si le texte est correct, compréhensible et publiable tel quel, tu le valides.
Ne propose jamais de reformulation stylistique, marketing ou rédactionnelle si le sens est intact et que le texte reste publiable.
Si et seulement si le texte est incompréhensible, factuellement faux, grammaticalement erroné, incohérent, ou trop littéralement traduit au point de sembler non naturel, signale-le.

La langue cible est : ${langName}.

Texte source (français) :
${sourceLines}

Traduction (${langName}) :
${translatedLines}

Évalue la traduction selon 4 critères :
1. Clarté
2. Cohérence
3. Correction linguistique
4. Fidélité au sens

Attribue une note de 1 à 5 pour chaque critère selon cette échelle :
5 = aucun problème identifié
4 = légère faiblesse, mais texte publiable tel quel
3 = limite, acceptable mais nécessite vigilance
2 = problème réel
1 = non publiable ou incompréhensible

Calcule ensuite une note finale sur 5 correspondant à la moyenne des 4 critères, arrondie à l'entier le plus proche (1, 2, 3, 4 ou 5).

Règles de décision :
- Si la note finale est supérieure ou égale à 4,0 et qu'aucun critère n'est inférieur à 4, le texte est considéré comme VALIDE
- Si la note finale est comprise entre 3,0 et 3,9, ou si un critère est noté 3, le texte est considéré comme LIMITE
- Si la note finale est inférieure à 3,0, ou si un critère est noté 1 ou 2, le texte est considéré comme À CORRIGER

Format de réponse obligatoire :

Verdict: [VALIDE / LIMITE / À CORRIGER]
Note finale: [X/5]
Détail:
- Clarté: [X/5]
- Cohérence: [X/5]
- Correction linguistique: [X/5]
- Fidélité au sens: [X/5]
Commentaire: [1 à 3 phrases maximum]
Correction proposée: [uniquement si verdict = LIMITE ou À CORRIGER, sinon écrire "RAS. Le texte est clair et correctement traduit"]`

  const primaryModel = getPrimaryVerifyModel()
  const backupModel = isBackupEnabled() ? getBackupVerifyModel() : ''

  let raw = ''
  try {
    raw = await callVerifyModel(primaryModel, prompt)
  } catch (err) {
    if (backupModel) {
      try {
        console.log('[verifier] primary verify failed, trying backup:', backupModel)
        raw = await callVerifyModel(backupModel, prompt)
      } catch (err2) {
        return { targetLanguage, score: 0, verdict: 'LIMITE', commentaire: `Erreur: ${err2 instanceof Error ? err2.message : 'unknown'}`, correction: '', issues: ['Verification failed'] }
      }
    } else {
      return { targetLanguage, score: 0, verdict: 'LIMITE', commentaire: `Erreur: ${err instanceof Error ? err.message : 'unknown'}`, correction: '', issues: ['Verification failed'] }
    }
  }

  const verdictMatch = raw.match(/Verdict\s*:\s*(VALIDE|LIMITE|À CORRIGER)/i)
  const noteMatch = raw.match(/Note finale\s*:\s*(\d)\/5/)
  const commentaireMatch = raw.match(/Commentaire\s*:\s*(.+?)(?=\nCorrection proposée\s*:|$)/s)
  const correctionMatch = raw.match(/Correction proposée\s*:\s*(.+?)$/s)

  const verdict = verdictMatch?.[1]?.toUpperCase() || 'LIMITE'
  const score = Math.max(0, Math.min(5, parseInt(noteMatch?.[1] || '3')))
  const commentaire = commentaireMatch?.[1]?.trim() || ''
  const correction = correctionMatch?.[1]?.trim() || ''

  const issues: string[] = []
  if (commentaire) issues.push(commentaire)
  if (correction && correction !== 'RAS. Le texte est clair et correctement traduit') issues.push(`Correction : ${correction}`)

  return { targetLanguage, score, verdict, commentaire, correction, issues }
}

export async function verifyTaskImage(
  taskId: string,
  imagePath: string,
  targetLanguage: string
): Promise<TaskVerificationResult> {
  const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage

  if (!fs.existsSync(imagePath)) {
    return { taskId, score: 0, extractedText: {}, issues: ['Image file not found'], summary: 'File missing' }
  }

  const imageBuffer = fs.readFileSync(imagePath)
  const base64Image = imageBuffer.toString('base64')
  const mimeType = getMimeType(imagePath)

  const prompt = `Tu es un validateur de texte publicitaire.

Ta mission est uniquement de vérifier la clarté, la cohérence, la fidélité au sens et la correction grammaticale d'un message dans la langue cible.

Si le texte est correct, compréhensible et publiable tel quel, tu le valides.
Ne propose jamais de reformulation stylistique, marketing ou rédactionnelle si le sens est intact et que le texte reste publiable.
Si et seulement si le texte est incompréhensible, factuellement faux, grammaticalement erroné, incohérent, ou trop littéralement traduit au point de sembler non naturel, signale-le.

La langue cible est : ${langName}.

Évalue le texte selon 4 critères :
1. Clarté
2. Cohérence
3. Correction linguistique
4. Fidélité au sens

Attribue une note de 1 à 5 pour chaque critère selon cette échelle :
5 = aucun problème identifié
4 = légère faiblesse, mais texte publiable tel quel
3 = limite, acceptable mais nécessite vigilance
2 = problème réel
1 = non publiable ou incompréhensible

Calcule ensuite une note finale sur 5 correspondant à la moyenne des 4 critères, arrondie à l'entier le plus proche (1, 2, 3, 4 ou 5).

Règles de décision :
- Si la note finale est supérieure ou égale à 4,0 et qu'aucun critère n'est inférieur à 4, le texte est considéré comme VALIDE
- Si la note finale est comprise entre 3,0 et 3,9, ou si un critère est noté 3, le texte est considéré comme LIMITE
- Si la note finale est inférieure à 3,0, ou si un critère est noté 1 ou 2, le texte est considéré comme À CORRIGER

Important :
- Ne cherche pas à optimiser un texte déjà publiable
- Ne confonds jamais préférence stylistique et erreur réelle
- Ne propose une correction que si le verdict est À CORRIGER ou LIMITE
- Si le verdict est VALIDE, confirme simplement que le texte est correct et publiable

Format de réponse obligatoire :

Verdict: [VALIDE / LIMITE / À CORRIGER]
Note finale: [X/5]
Détail:
- Clarté: [X/5]
- Cohérence: [X/5]
- Correction linguistique: [X/5]
- Fidélité au sens: [X/5]
Commentaire: [1 à 3 phrases maximum]
Correction proposée: [uniquement si verdict = LIMITE ou À CORRIGER, sinon écrire "RAS. Le texte est clair et correctement traduit"]
Texte extrait: {"<zone>": "<texte visible>", ...} (JSON sur une seule ligne — toutes les zones de texte visibles dans l'image, hors logos)`

  const primaryModel = getPrimaryVerifyModel()
  const backupModel = isBackupEnabled() ? getBackupVerifyModel() : ''
  const imageData = { base64: base64Image, mimeType }

  let raw = ''
  try {
    raw = await callVerifyModel(primaryModel, prompt, imageData)
  } catch (err) {
    if (backupModel) {
      try {
        console.log('[verifier] primary verify (image) failed, trying backup:', backupModel)
        raw = await callVerifyModel(backupModel, prompt, imageData)
      } catch (err2) {
        return {
          taskId,
          score: 0,
          extractedText: {},
          issues: [`Verification failed: ${err2 instanceof Error ? err2.message : 'unknown error'}`],
          summary: 'Could not analyze image',
        }
      }
    } else {
      return {
        taskId,
        score: 0,
        extractedText: {},
        issues: [`Verification failed: ${err instanceof Error ? err.message : 'unknown error'}`],
        summary: 'Could not analyze image',
      }
    }
  }

  const verdictMatch = raw.match(/Verdict\s*:\s*(VALIDE|LIMITE|À CORRIGER)/i)
  const noteMatch = raw.match(/Note finale\s*:\s*(\d)\/5/)
  const commentaireMatch = raw.match(/Commentaire\s*:\s*(.+?)(?=\nCorrection proposée\s*:|$)/s)
  const correctionMatch = raw.match(/Correction proposée\s*:\s*(.+?)(?=\nTexte extrait\s*:|$)/s)
  const texteExtraitMatch = raw.match(/Texte extrait\s*:\s*(\{.+?\})/s)

  const verdict = verdictMatch?.[1]?.toUpperCase() || 'LIMITE'
  const score = Math.max(0, Math.min(5, parseInt(noteMatch?.[1] || '3')))

  const commentaire = commentaireMatch?.[1]?.trim() || ''
  const correction = correctionMatch?.[1]?.trim() || ''

  let extractedText: Record<string, string> = {}
  if (texteExtraitMatch?.[1]) {
    try { extractedText = JSON.parse(texteExtraitMatch[1]) } catch {}
  }

  const issues: string[] = []
  if (commentaire) issues.push(commentaire)
  if (correction && correction !== 'RAS. Le texte est clair et correctement traduit') issues.push(`Correction : ${correction}`)

  return {
    taskId,
    score,
    extractedText,
    issues,
    summary: `${verdict} — ${commentaire || 'Aucun commentaire'}`,
  }
}
