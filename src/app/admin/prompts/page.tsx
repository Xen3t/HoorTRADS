'use client'

import { useState, useEffect, useCallback } from 'react'

type PromptKey = 'prompt_google_extract' | 'prompt_google_translate' | 'prompt_google_render'

const DEFAULTS: Record<PromptKey, string> = {
  prompt_google_extract:
    'Extract EVERY piece of visible text from this advertising image — do not skip anything.\n\n' +
    'Include: headlines, taglines, CTAs, discount amounts (e.g. "-60%", "Jusqu\'à 60% de réduction"), promo codes (e.g. "EXTRADISCOUNT", "CODE10"), prices (e.g. "49,99 €"), dates, brand names, legal text, footnotes, and any other text visible in the image.\n\n' +
    'For each text zone, also capture its typographic properties:\n' +
    '- weight: "bold", "semibold", "regular", "light", or "thin"\n' +
    '- case: "uppercase" (ALL CAPS), "lowercase", "titlecase", or "mixed"\n' +
    '- color: hex code if determinable, otherwise a color name (e.g. "white", "black", "orange", "#FF6B00")\n' +
    '- size: "large", "medium", or "small" relative to other text in the image\n\n' +
    'Rules:\n' +
    '- Return ONLY text that is clearly visible — do not invent or guess\n' +
    '- Preserve EXACT text content including case\n' +
    '- Give each text element a short descriptive label\n\n' +
    'Example labels: headline, tagline, cta, discount_percent, discount_label, promo_code, price, date, legal, brand_name, footnote',

  prompt_google_translate:
    'You are a native marketing copywriter. Translate the following French advertising text zones into each target language.\n\n' +
    'CRITICAL instructions:\n' +
    '1. Preserve typographic case exactly — ALL CAPS text must stay ALL CAPS in the translation\n' +
    '2. Translate ONLY these zones. Do not add, remove, or duplicate any text element\n' +
    '3. Write as a professional native copywriter — idiomatic, not word-for-word\n' +
    '4. Follow ALL rules and terms listed per language — they override your default choices',

  prompt_google_render:
    '- Render each quoted text exactly — character for character, same case\n' +
    '- Match the original font weight, color, size, and typographic style for each zone\n' +
    '- Preserve all visual elements: layout, background, colors, images, graphics\n' +
    '- Do not retranslate — the quoted texts are final',
}

const PROMPT_KEYS = Object.keys(DEFAULTS) as PromptKey[]

function ModelBadge({ label, type }: { label: string; type: 'image' | 'text' | 'vision' }) {
  const cls = {
    image: 'bg-purple-50 text-purple-700 border-purple-200',
    text: 'bg-blue-50 text-blue-700 border-blue-200',
    vision: 'bg-amber-50 text-amber-700 border-amber-200',
  }[type]
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-semibold border ${cls}`}>{label}</span>
}

function StepNum({ n }: { n: number }) {
  return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-teal text-white text-xs font-bold shrink-0">{n}</span>
}

function AutoBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-[8px] border border-border bg-surface px-3 py-2 mt-2">
      <p className="text-xs font-semibold text-text-secondary mb-1">{label}</p>
      <pre className="text-xs text-text-disabled font-mono whitespace-pre-wrap leading-relaxed">{content}</pre>
    </div>
  )
}

interface StepCardProps {
  stepNum: number
  modelLabel: string
  modelType: 'image' | 'text' | 'vision'
  title: string
  description: string
  value: string
  onChange: (v: string) => void
  onReset: () => void
  rows?: number
  prependNote?: string
  appendNote?: string
}

function StepCard({ stepNum, modelLabel, modelType, title, description, value, onChange, onReset, rows = 6, prependNote, appendNote }: StepCardProps) {
  return (
    <div className="bg-white rounded-[12px] shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StepNum n={stepNum} />
          <ModelBadge label={modelLabel} type={modelType} />
        </div>
        <button onClick={onReset} className="text-xs text-text-disabled hover:text-brand-red transition-colors">
          Réinitialiser
        </button>
      </div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-xs text-text-disabled mb-3">{description}</p>

      {prependNote && <AutoBlock label="Ajouté automatiquement avant :" content={prependNote} />}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-white text-text-primary focus:border-brand-green focus:outline-none resize-y font-mono ${prependNote || appendNote ? 'mt-2' : ''}`}
      />

      {appendNote && <AutoBlock label="Ajouté automatiquement après :" content={appendNote} />}
    </div>
  )
}

export default function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<Record<PromptKey, string>>({ ...DEFAULTS })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/prompts')
      .then((r) => r.json())
      .then((data) => {
        if (data.prompts) {
          const updates: Partial<Record<PromptKey, string>> = {}
          for (const key of PROMPT_KEYS) if (data.prompts[key]) updates[key] = data.prompts[key]
          setPrompts((prev) => ({ ...prev, ...updates }))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const update = useCallback((key: PromptKey, value: string) => {
    setPrompts((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }, [])

  const reset = useCallback((key: PromptKey) => {
    setPrompts((prev) => ({ ...prev, [key]: DEFAULTS[key] }))
    setSaved(false)
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const body: Partial<Record<PromptKey, string>> = {}
      for (const key of PROMPT_KEYS) body[key] = prompts[key]
      await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-text-secondary text-sm">Chargement...</p>
    </main>
  )

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[720px] mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Prompts système</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Pipeline en 3 étapes : extraction → traduction → rendu
            </p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover mt-1">← Admin</a>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1 mb-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-text-disabled font-semibold uppercase tracking-wider">3 étapes</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <StepCard
            stepNum={1}
            modelLabel="Modèle vision (extraction)"
            modelType="vision"
            title="Extraction du texte source"
            description="Analyse l'image et extrait chaque élément de texte visible avec un label descriptif. Partagé entre toutes les langues d'une même image source."
            value={prompts.prompt_google_extract}
            onChange={(v) => update('prompt_google_extract', v)}
            onReset={() => reset('prompt_google_extract')}
            rows={9}
            appendNote={
              'Respond ONLY with valid JSON, no markdown:\n' +
              '{\n' +
              '  "<label>": {\n' +
              '    "text": "<exact text as seen>",\n' +
              '    "weight": "bold|semibold|regular|light|thin",\n' +
              '    "case": "uppercase|lowercase|titlecase|mixed",\n' +
              '    "color": "<hex code or color name>",\n' +
              '    "size": "large|medium|small"\n' +
              '  }\n' +
              '}'
            }
          />

          <StepCard
            stepNum={2}
            modelLabel="Modèle texte (traduction)"
            modelType="text"
            title="Traduction pré-validée par langue"
            description="Reçoit les zones extraites et les traduit vers toutes les langues cibles. Un seul appel pour toutes les langues."
            value={prompts.prompt_google_translate}
            onChange={(v) => update('prompt_google_translate', v)}
            onReset={() => reset('prompt_google_translate')}
            rows={7}
            appendNote={
              'French source zones:\n' +
              '  "headline": "Jusqu\'à -60% de réduction"\n' +
              '  "promo_code": "EXTRADISCOUNT"\n' +
              '  ...\n\n' +
              'Target languages: German (de), Dutch (nl), ...\n\n' +
              'Respond ONLY with valid JSON:\n' +
              '{ "<lang_code>": { "<zone_label>": "<translated text>" } }'
            }
          />

          <StepCard
            stepNum={3}
            modelLabel="Modèle image (génération)"
            modelType="image"
            title="Rendu avec textes cités (règles critiques)"
            description="Le modèle image reproduit le visuel en citant chaque texte pré-traduit entre guillemets. Modifiez ici les règles de rendu qui s'appliquent après la liste des textes."
            value={prompts.prompt_google_render}
            onChange={(v) => update('prompt_google_render', v)}
            onReset={() => reset('prompt_google_render')}
            rows={5}
            prependNote={
              'Reproduce this French advertising image adapted to [language].\n\n' +
              'A language expert has pre-translated all text zones. Render each one exactly as quoted:\n\n' +
              '  - headline: render "Tot -60% korting" in the same typographic style as the original\n' +
              '  - promo_code: render "EXTRADISCOUNT" in the same typographic style as the original\n' +
              '  ...\n\n' +
              'Critical rules:'
            }
          />
        </div>

        <div className="mt-6">
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 rounded-[12px] bg-brand-green text-white font-bold text-sm hover:bg-brand-green-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : saved ? '✓ Enregistré' : 'Enregistrer les prompts'}
          </button>
        </div>
      </div>
    </main>
  )
}
