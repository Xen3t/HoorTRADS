import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDb } from '@/lib/db/database'
import { GeminiClient } from '@/lib/gemini/gemini-client'
import { buildTranslationPrompt, buildGoogleModePrompt, buildGoogleModeCorrectionPrompt } from '@/lib/gemini/prompt-builder'
import { getAppConfig } from '@/lib/db/queries'
import type { GenerationTask } from '@/types/generation'
import type { ExtractedZone } from '@/lib/gemini/text-extractor'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const body = await request.json()
    const { taskId, customPrompt, useSourceImage, imageOverridePath } = body

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    // Validate imageOverridePath if provided — must be an existing file within data/ or a known source path
    if (imageOverridePath) {
      const resolved = path.resolve(imageOverridePath)
      if (imageOverridePath.includes('..') || !fs.existsSync(resolved)) {
        return NextResponse.json({ error: 'Invalid image path' }, { status: 400 })
      }
    }

    const db = getDb()

    const task = db.prepare(
      'SELECT * FROM generation_tasks WHERE id = ? AND job_id = ?'
    ).get(taskId, jobId) as GenerationTask | undefined

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Fetch job config to get generation method and resolution
    const jobRow = db.prepare('SELECT config FROM generation_jobs WHERE id = ?').get(jobId) as { config: string } | undefined
    const jobConfig = jobRow?.config ? JSON.parse(jobRow.config) : {}
    const generationMethod: string = jobConfig.generationMethod || 'standard'
    const resolution: string = jobConfig.resolution || '1K'

    const customBasePrompt = getAppConfig(db, 'base_prompt') || undefined
    // Per-language prompt from configure page (fallback between user correction and global base)
    const configuredLangPrompt = (jobConfig.customPrompts as Record<string, string> | undefined)?.[task.target_language] || undefined
    const customLangPrompt = customPrompt || undefined

    // Pre-load stored translations for google mode (used in both branches)
    const preTranslationLog = jobConfig.preTranslationLog
    const approvedTranslations = jobConfig.approvedTranslations || preTranslationLog?.translations || {}
    const langTranslations: Record<string, string> = approvedTranslations[task.target_language] || {}
    const rawZones: Record<string, ExtractedZone | string> = preTranslationLog?.extractedZones || {}
    const extractedZones: Record<string, ExtractedZone> = {}
    for (const [k, v] of Object.entries(rawZones)) {
      if (typeof v === 'object' && v !== null) extractedZones[k] = v as ExtractedZone
    }
    const zones = Object.keys(extractedZones).length > 0 ? extractedZones : undefined

    let prompt: string
    let imageToEdit: string

    if (useSourceImage) {
      // Repartir de l'image source française — rebuild prompt propre depuis les traductions stockées
      imageToEdit = task.source_image_path
      if (generationMethod === 'google' && Object.keys(langTranslations).length > 0) {
        // Fresh NB2 prompt + correction en extra si fournie
        prompt = buildGoogleModePrompt(langTranslations, task.target_language, customLangPrompt || configuredLangPrompt || customBasePrompt, zones)
      } else {
        let languageRules: string[] | undefined
        if (generationMethod !== 'standard') {
          const ruleRows = db.prepare('SELECT rule FROM language_rules WHERE language_code = ?').all(task.target_language) as { rule: string }[]
          if (ruleRows.length > 0) languageRules = ruleRows.map((r) => r.rule)
        }
        prompt = buildTranslationPrompt({ targetLanguage: task.target_language, customPrompt: customLangPrompt || configuredLangPrompt, basePrompt: customBasePrompt, languageRules })
      }
    } else {
      // Repartir de l'image actuellement vue par l'utilisateur (ou la dernière si non précisée)
      imageToEdit = imageOverridePath || task.output_path || task.source_image_path
      if (generationMethod === 'google' && Object.keys(langTranslations).length > 0) {
        if (customLangPrompt) {
          // Correction ciblée : on envoie uniquement les instructions de l'utilisateur
          prompt = buildGoogleModeCorrectionPrompt(customLangPrompt)
        } else {
          // Re-render sans correction : prompt NB2 complet avec prompt langue configuré si disponible
          prompt = buildGoogleModePrompt(langTranslations, task.target_language, configuredLangPrompt || customBasePrompt, zones)
        }
      } else {
        let languageRules: string[] | undefined
        if (generationMethod !== 'standard') {
          const ruleRows = db.prepare('SELECT rule FROM language_rules WHERE language_code = ?').all(task.target_language) as { rule: string }[]
          if (ruleRows.length > 0) languageRules = ruleRows.map((r) => r.rule)
        }
        prompt = buildTranslationPrompt({ targetLanguage: task.target_language, customPrompt: customLangPrompt || configuredLangPrompt, basePrompt: customBasePrompt, languageRules })
      }
    }

    // Mark as running and save prompt
    db.prepare("UPDATE generation_tasks SET status = 'running', prompt_sent = ? WHERE id = ?").run(prompt, taskId)

    const generator = new GeminiClient()
    const result = await generator.generateImage(imageToEdit, task.target_language, prompt, resolution)

    if (result.success) {
      if (task.output_path) {
        const label = useSourceImage ? 'regen depuis FR' : customLangPrompt ? 'correction' : 'regen'
        db.prepare(
          'INSERT INTO generation_task_versions (id, task_id, output_path, prompt_sent, regen_label) VALUES (?, ?, ?, ?, ?)'
        ).run(randomUUID(), taskId, task.output_path, task.prompt_sent ?? null, label)
      }

      db.prepare(
        "UPDATE generation_tasks SET status = 'done', output_path = ?, error_message = NULL WHERE id = ?"
      ).run(result.outputPath, taskId)

      const versions = db.prepare(
        'SELECT output_path FROM generation_task_versions WHERE task_id = ? ORDER BY created_at ASC'
      ).all(taskId) as { output_path: string }[]

      return NextResponse.json({
        success: true,
        outputPath: result.outputPath,
        versions: versions.map((v) => v.output_path),
      })
    } else {
      db.prepare(
        "UPDATE generation_tasks SET status = 'failed', error_message = ? WHERE id = ?"
      ).run(result.error || 'Regeneration failed', taskId)

      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Regeneration failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
