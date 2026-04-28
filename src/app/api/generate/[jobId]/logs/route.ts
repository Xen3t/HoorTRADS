import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import { inferProvider } from '@/lib/provider-utils'

interface LogEvent {
  ts: string
  level: 'info' | 'success' | 'warning' | 'error'
  source: 'pipeline' | 'extract' | 'translate' | 'image' | 'system'
  provider?: 'gemini' | 'openai' | 'mixed'
  modelLabel?: string // Exact model ID used at this step
  message: string
  details?: string
}

// Reads the configured model for a step, preferring primary_* with fallback to legacy keys
function readConfiguredModel(step: 'extract' | 'translate' | 'generate' | 'verify' | 'doc_filter', backup = false): string | null {
  try {
    const db = getDb()
    const prefix = backup ? 'backup' : 'primary'
    const v = getAppConfig(db, `${prefix}_model_${step}`)
    if (v) return v
    if (!backup) {
      const legacy = getAppConfig(db, `model_${step}`)
      if (legacy) return legacy
    } else {
      const legacy = getAppConfig(db, `openai_model_${step === 'generate' ? 'generate' : step}`)
      if (legacy) return legacy
    }
    return null
  } catch { return null }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()

    const job = db.prepare(`
      SELECT id, status, config, created_at, updated_at, total_tasks, completed_tasks, failed_tasks
      FROM generation_jobs
      WHERE id = ?
    `).get(jobId) as {
      id: string; status: string; config: string; created_at: string; updated_at: string
      total_tasks: number; completed_tasks: number; failed_tasks: number
    } | undefined

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const cfg = job.config ? JSON.parse(job.config) : {}
    const events: LogEvent[] = []

    const log = cfg.preTranslationLog
    const phase = log?.phase as string | undefined
    const isRunning = job.status === 'running'
    // Effective providers reported by the actual run (in preTranslationLog.provider)
    const runProvider = (log?.provider || 'gemini') as 'gemini' | 'openai' | 'mixed'

    // Read pipeline models: prefer snapshot saved at job creation (stable), fall back to current DB config
    const snap = (cfg.pipelineSnapshot || {}) as Record<string, string>
    const cfgExtract = snap.primary_extract || readConfiguredModel('extract') || ''
    const cfgTranslate = snap.primary_translate || readConfiguredModel('translate') || ''
    const cfgGenerate = snap.primary_generate || readConfiguredModel('generate') || ''
    const cfgDocFilter = snap.primary_doc_filter || readConfiguredModel('doc_filter') || cfgExtract
    const cfgBackupExtract = snap.backup_extract || readConfiguredModel('extract', true) || ''
    const cfgBackupTranslate = snap.backup_translate || readConfiguredModel('translate', true) || ''
    const cfgBackupGenerate = snap.backup_generate || readConfiguredModel('generate', true) || ''
    const cfgBackupDocFilter = snap.backup_doc_filter || readConfiguredModel('doc_filter', true) || cfgBackupExtract

    events.push({
      ts: job.created_at,
      level: 'info',
      source: 'system',
      message: `Job créé — ${job.total_tasks} image${job.total_tasks > 1 ? 's' : ''} à générer`,
      details: `Pipeline configuré :\n  - Extraction : ${cfgExtract || '(défaut)'}\n  - Filtre doc : ${cfgDocFilter || '(défaut)'}\n  - Traduction : ${cfgTranslate || '(défaut)'}\n  - Génération : ${cfgGenerate || '(défaut)'}\n\nBackup :\n  - Extraction : ${cfgBackupExtract || '(défaut)'}\n  - Filtre doc : ${cfgBackupDocFilter || '(défaut)'}\n  - Traduction : ${cfgBackupTranslate || '(défaut)'}\n  - Génération : ${cfgBackupGenerate || '(défaut)'}`,
    })

    // ── EXTRACTION ─────────────────────────────────────────────────────────
    const zoneCount = log?.extractedZones ? Object.keys(log.extractedZones).length : 0
    const extractionPromptText = (log?.extractionPrompt as string | undefined) || ''
    const translationPromptText = (log?.translationPrompt as string | undefined) || ''
    // The actual extraction model = configured primary OR backup if it failed-over
    const extractActualProvider: 'gemini' | 'openai' = runProvider === 'openai' ? 'openai' : 'gemini'
    const extractModelUsed = extractActualProvider === inferProvider(cfgExtract || '') ? cfgExtract : cfgBackupExtract
    if (zoneCount > 0) {
      const zoneDetails = Object.entries(log.extractedZones as Record<string, { text?: string; weight?: string; case?: string; color?: string; size?: string } | string>)
        .map(([label, z]) => {
          if (typeof z === 'string') return `${label}: "${z}"`
          const meta = [z.weight, z.case, z.color, z.size].filter(Boolean).join(' · ')
          return `${label}: "${z.text}"${meta ? '   [' + meta + ']' : ''}`
        })
        .join('\n')
      events.push({
        ts: job.created_at,
        level: 'success',
        source: 'extract',
        provider: extractActualProvider,
        modelLabel: extractModelUsed || undefined,
        message: `Extraction terminée — ${zoneCount} zones de texte détectées`,
        details: extractionPromptText
          ? `${zoneDetails}\n\n──────── Prompt envoyé ────────\n${extractionPromptText}`
          : zoneDetails,
      })
    } else if (phase === 'extracting' || (isRunning && !log)) {
      events.push({
        ts: job.updated_at,
        level: 'info',
        source: 'extract',
        modelLabel: cfgExtract || undefined,
        message: 'Extraction du texte en cours...',
      })
    }

    // ── DOC CONFIG FILTER ──────────────────────────────────────────────────
    const hasConfigDoc = !!(cfg.configFileName || cfg.configFileContent)
    const docFilterError = log?.docFilterError as string | undefined
    const configDocInjected = !!(log?.configDocInjected)

    const configDocText = (cfg.configFileContent as string | undefined)?.trim() || ''
    const configDocPreview = configDocText.length > 300 ? configDocText.slice(0, 300) + '\n…[tronqué]' : configDocText

    if (hasConfigDoc) {
      if (configDocInjected) {
        events.push({
          ts: job.created_at,
          level: 'success',
          source: 'pipeline',
          message: 'Données additionnelles — injectées dans la traduction',
          details: [`Contenu transmis au modèle :`, ``, configDocPreview, ``, `⚠ Ces valeurs remplacent les valeurs extraites du visuel FR.`].join('\n'),
        })
      } else if (docFilterError) {
        events.push({
          ts: job.updated_at,
          level: 'error',
          source: 'pipeline',
          message: 'Données additionnelles — erreur',
          details: `Erreur : ${docFilterError}\n\nContenu :\n${configDocPreview}`,
        })
      } else if (!isRunning) {
        // Only show "non appliquées" once the pipeline is fully done — not during extraction/translation
        events.push({
          ts: job.created_at,
          level: 'warning',
          source: 'pipeline',
          message: 'Données additionnelles — non appliquées',
          details: `Le texte était présent mais n'a pas été traité.\n\nContenu :\n${configDocPreview}`,
        })
      } else {
        events.push({
          ts: job.created_at,
          level: 'info',
          source: 'pipeline',
          message: 'Données additionnelles — sera injecté dans la traduction',
          details: configDocPreview || undefined,
        })
      }
    }

    // ── TRANSLATION ────────────────────────────────────────────────────────
    const langCount = log?.translations ? Object.keys(log.translations).length : 0
    const translateActualProvider: 'gemini' | 'openai' = (runProvider === 'openai' || runProvider === 'mixed') ? 'openai' : 'gemini'
    const translateModelUsed = translateActualProvider === inferProvider(cfgTranslate || '') ? cfgTranslate : cfgBackupTranslate
    if (langCount > 0) {
      const translationDetails = Object.entries(log.translations as Record<string, Record<string, string>>)
        .map(([lang, zones]) => `[${lang.toUpperCase()}]\n${Object.entries(zones).map(([k, v]) => `  ${k}: "${v}"`).join('\n')}`)
        .join('\n\n')
      events.push({
        ts: job.created_at,
        level: 'success',
        source: 'translate',
        provider: runProvider === 'mixed' ? 'mixed' : translateActualProvider,
        modelLabel: translateModelUsed || undefined,
        message: `Traduction terminée — ${langCount} langue${langCount > 1 ? 's' : ''}${runProvider === 'mixed' ? ' (extraction Gemini, traduction OpenAI fallback)' : ''}`,
        details: translationPromptText
          ? `${translationDetails}\n\n──────── Prompt envoyé ────────\n${translationPromptText}`
          : translationDetails,
      })
    } else if (phase === 'translating' && zoneCount > 0) {
      events.push({
        ts: job.updated_at,
        level: 'info',
        source: 'translate',
        modelLabel: cfgTranslate || undefined,
        message: 'Traduction des zones en cours...',
      })
    }

    if (log?.error) {
      events.push({
        ts: job.updated_at,
        level: 'error',
        source: 'pipeline',
        message: 'Erreur pré-traduction',
        details: log.error as string,
      })
    }

    if (cfg.processorError) {
      events.push({ ts: job.updated_at, level: 'error', source: 'system', message: 'Erreur du processeur', details: cfg.processorError as string })
    }
    if (cfg.renderError) {
      events.push({ ts: job.updated_at, level: 'error', source: 'system', message: 'Erreur de rendu', details: cfg.renderError as string })
    }

    // ── IMAGE GENERATION (per task) ────────────────────────────────────────
    const tasks = db.prepare(`
      SELECT id, target_language, country_code, status, error_message, output_path, source_image_name, prompt_sent
      FROM generation_tasks
      WHERE job_id = ?
      ORDER BY rowid ASC
    `).all(jobId) as {
      id: string; target_language: string; country_code: string; status: string
      error_message: string | null; output_path: string | null; source_image_name: string
      prompt_sent: string | null
    }[]

    const generateProvider = inferProvider(cfgGenerate || '')

    const allPending = tasks.length > 0 && tasks.every((t) => t.status === 'pending')
    if (allPending && langCount > 0 && isRunning) {
      events.push({
        ts: job.updated_at,
        level: 'info',
        source: 'image',
        provider: generateProvider,
        modelLabel: cfgGenerate || undefined,
        message: `${tasks.length} image${tasks.length > 1 ? 's' : ''} en attente de génération`,
      })
    }

    for (const t of tasks) {
      const taskLabel = `${t.country_code}/${t.target_language}`
      const baseDetails = t.prompt_sent
        ? `Source : ${t.source_image_name}\n\n──────── Prompt envoyé ────────\n${t.prompt_sent.slice(0, 1500)}${t.prompt_sent.length > 1500 ? '\n…[tronqué]' : ''}`
        : `Source : ${t.source_image_name}`

      if (t.status === 'done') {
        events.push({
          ts: job.updated_at,
          level: 'success',
          source: 'image',
          provider: generateProvider,
          modelLabel: cfgGenerate || undefined,
          message: `${taskLabel} — image générée`,
          details: baseDetails,
        })
      } else if (t.status === 'failed') {
        events.push({
          ts: job.updated_at,
          level: 'error',
          source: 'image',
          provider: generateProvider,
          modelLabel: cfgGenerate || undefined,
          message: `${taskLabel} — échec`,
          details: `${t.error_message || 'Erreur inconnue'}\n\n${baseDetails}`,
        })
      } else if (t.status === 'running') {
        events.push({
          ts: job.updated_at,
          level: 'info',
          source: 'image',
          provider: generateProvider,
          modelLabel: cfgGenerate || undefined,
          message: `${taskLabel} — génération en cours...`,
          details: baseDetails,
        })
      } else if (t.status === 'pending' && !allPending) {
        events.push({
          ts: job.updated_at,
          level: 'info',
          source: 'image',
          modelLabel: cfgGenerate || undefined,
          message: `${taskLabel} — en attente`,
        })
      }
    }

    if (job.status === 'done') {
      events.push({
        ts: job.updated_at,
        level: 'success',
        source: 'system',
        message: `Job terminé — ${job.completed_tasks} succès / ${job.failed_tasks} échec${job.failed_tasks > 1 ? 's' : ''}`,
      })
    } else if (job.status === 'failed') {
      events.push({ ts: job.updated_at, level: 'error', source: 'system', message: 'Job en échec' })
    }

    return NextResponse.json({ jobId: job.id, status: job.status, events })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * DELETE /api/generate/[jobId]/logs — wipes the log fields from job config and tasks
 * (preTranslationLog, processorError, renderError, task error_messages).
 * Does NOT touch task status, output_path, or anything else functional.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const db = getDb()

    const row = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
    if (!row) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const cfg = row.config ? JSON.parse(row.config) : {}
    delete cfg.preTranslationLog
    delete cfg.processorError
    delete cfg.renderError
    db.prepare('UPDATE generation_jobs SET config = ?, updated_at = datetime(\'now\') WHERE id = ?').run(JSON.stringify(cfg), jobId)

    db.prepare('UPDATE generation_tasks SET error_message = NULL WHERE job_id = ?').run(jobId)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
