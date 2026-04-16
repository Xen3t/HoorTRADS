'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Tab = 'classique' | 'precision' | 'google'
type PromptKey = 'base_prompt' | 'prompt_precision_filter' | 'prompt_google_extract' | 'prompt_google_translate' | 'prompt_google_render'

// Must stay in sync with server-side defaults in text-extractor.ts and prompt-builder.ts
const DEFAULTS: Record<PromptKey, string> = {
  base_prompt:
    'You are a native marketing copywriter adapting an advertising visual from French to {language}.\n' +
    'Do NOT translate word-for-word. Adapt the message so it reads as if a professional {language} copywriter originally wrote it — natural, idiomatic, impactful.\n' +
    '- Use natural, idiomatic {language} as used in advertising and e-commerce\n' +
    '- Choose ONE consistent register (informal/tu for B2C unless the brand requires formal) and apply it to ALL text elements in the image\n' +
    '- Prioritize naturalness and marketing impact over literal accuracy\n' +
    '- Preserve the layout, colors, fonts, and design exactly as they are — only change the text content',

  prompt_precision_filter:
    'You are a translation quality expert. Analyze this French advertising image.\n\n' +
    'Step 1 — Read all visible text and understand the content (headlines, promo offers, CTA, promo codes, dates, prices, legal, etc.).\n\n' +
    'Step 2 — For each language below, review its DICTIONARY entries and STYLE RULES. Select ONLY those that are relevant to the text actually present in this image. Discard anything that doesn\'t apply.\n\n' +
    'Step 3 — For each relevant item, output a concise actionable hint in English:\n' +
    '- For dictionary: "prefer \'Tot 60% korting\' rather than \'Tot -60%\'"\n' +
    '- For style rules: include the rule as-is if it applies to this image\'s content',

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

const TAB_KEYS: Record<Tab, PromptKey[]> = {
  classique: ['base_prompt'],
  precision: ['prompt_precision_filter'],
  google: ['prompt_google_extract', 'prompt_google_translate', 'prompt_google_render'],
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ModelBadge({ label, type }: { label: string; type: 'image' | 'text' | 'vision' }) {
  const cls = {
    image: 'bg-purple-50 text-purple-700 border-purple-200',
    text: 'bg-blue-50 text-blue-700 border-blue-200',
    vision: 'bg-amber-50 text-amber-700 border-amber-200',
  }[type]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  )
}

function StepNum({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-teal text-white text-xs font-bold shrink-0">
      {n}
    </span>
  )
}

function AutoBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-[8px] border border-border bg-surface px-3 py-2">
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
        <button
          onClick={onReset}
          className="text-xs text-text-disabled hover:text-brand-red transition-colors"
        >
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

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminPromptsPage() {
  const [tab, setTab] = useState<Tab>('google')
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
          for (const key of Object.keys(DEFAULTS) as PromptKey[]) {
            if (data.prompts[key]) updates[key] = data.prompts[key]
          }
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
      for (const key of TAB_KEYS[tab]) body[key] = prompts[key]
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

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Prompts système</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Configurer les prompts envoyés à chaque IA selon le mode sélectionné
            </p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover mt-1">← Admin</a>
        </div>

        {/* Mode tabs */}
        <div className="flex border border-border rounded-full overflow-hidden w-fit mb-6">
          {(['google', 'classique', 'precision'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSaved(false) }}
              className={`px-5 py-2 text-sm font-semibold transition-colors outline-none
                ${tab === t ? 'bg-brand-green text-white' : 'bg-white text-text-secondary hover:bg-surface'}`}
            >
              {t === 'classique' ? 'Classique' : t === 'precision' ? 'Précision' : 'Natif'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── CLASSIQUE ────────────────────────────────────────────────── */}
          {tab === 'classique' && (
            <motion.div key="classique" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center gap-2 px-1 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-text-disabled font-semibold uppercase tracking-wider">1 étape</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <StepCard
                stepNum={1}
                modelLabel="NB2 · gemini-3.1-flash-image-preview · Modèle image"
                modelType="image"
                title="Prompt de traduction"
                description="Envoyé directement à NB2 pour chaque image. Aucun appel préalable — traduction et rendu en un seul passage. Utilisez {language} comme variable pour la langue cible."
                value={prompts.base_prompt}
                onChange={(v) => update('base_prompt', v)}
                onReset={() => reset('base_prompt')}
                rows={7}
                appendNote={'[En mode Précision : les hints du glossaire filtrés + règles de style sont injectés automatiquement après ce prompt]'}
              />

              {/* Preview */}
              <div className="bg-surface rounded-[12px] p-4 border border-border">
                <p className="text-xs font-semibold text-text-secondary mb-2">Aperçu — langue : German</p>
                <pre className="text-xs text-text-primary font-mono whitespace-pre-wrap leading-relaxed">
                  {prompts.base_prompt.replaceAll('{language}', 'German')}
                </pre>
              </div>
            </motion.div>
          )}

          {/* ── PRÉCISION ────────────────────────────────────────────────── */}
          {tab === 'precision' && (
            <motion.div key="precision" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center gap-2 px-1 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-text-disabled font-semibold uppercase tracking-wider">2 étapes</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <StepCard
                stepNum={1}
                modelLabel="gemini-3.1-flash-lite-preview · Vision"
                modelType="vision"
                title="Filtrage du glossaire et des règles de style"
                description="Analyse l'image source et sélectionne uniquement les termes du dictionnaire et les règles de style qui s'appliquent à ce visuel. Le résultat est injecté dans l'étape 2."
                value={prompts.prompt_precision_filter}
                onChange={(v) => update('prompt_precision_filter', v)}
                onReset={() => reset('prompt_precision_filter')}
                rows={9}
                appendNote={
                  'Language reference:\n' +
                  '  Dutch (nl):\n' +
                  '    DICTIONARY: 1. "Jusqu\'à -60%" → "Tot 60% korting"\n' +
                  '    STYLE RULES: 1. Utiliser "%" sans tiret devant...\n' +
                  '  German (de):\n' +
                  '    ...\n\n' +
                  'Respond ONLY with valid JSON:\n' +
                  '{ "<lang_code>": ["<hint 1>", "<hint 2>"] }\n\n' +
                  'Return an empty array for a language if none of its entries apply to this image.'
                }
              />

              {/* Step 2 — read-only reference to base_prompt */}
              <div className="bg-white rounded-[12px] shadow-sm p-5 border-l-4 border-brand-teal">
                <div className="flex items-center gap-2 mb-3">
                  <StepNum n={2} />
                  <ModelBadge label="NB2 · gemini-3.1-flash-image-preview · Modèle image" type="image" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Traduction avec contexte filtré</h3>
                <p className="text-xs text-text-disabled mb-3">
                  Utilise le <strong>prompt de base (onglet Classique)</strong> puis injecte automatiquement
                  les hints filtrés à l&apos;étape 1. Aucun prompt spécifique à configurer ici.
                </p>
                <div className="bg-surface rounded-[8px] px-3 py-2 text-xs font-mono text-text-disabled border border-border">
                  <span className="font-semibold text-text-secondary">[Prompt de base]</span>
                  {'\n\n'}
                  Glossary guidance for this image (preferred formulations):{'\n'}
                  {'  '}– prefer &quot;Tot 60% korting&quot; rather than &quot;Tot -60%&quot;{'\n'}
                  {'  '}– [règles de style pertinentes pour ce visuel]{'\n'}
                  {'  '}– ...
                </div>
                <button
                  onClick={() => setTab('classique')}
                  className="mt-3 text-xs text-brand-teal hover:text-brand-teal-hover transition-colors font-semibold"
                >
                  → Modifier le prompt de base dans Classique
                </button>
              </div>
            </motion.div>
          )}

          {/* ── GEMINI PRO ───────────────────────────────────────────────── */}
          {tab === 'google' && (
            <motion.div key="google" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center gap-2 px-1 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-text-disabled font-semibold uppercase tracking-wider">3 étapes · Text-First (recommandation Google)</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <StepCard
                stepNum={1}
                modelLabel="gemini-3.1-flash-lite-preview · Vision"
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
                modelLabel="gemini-3.1-pro-preview · Texte"
                modelType="text"
                title="Traduction pré-validée par langue"
                description="Reçoit les zones extraites et les traduit vers toutes les langues cibles avec le glossaire complet + les règles de style. Un seul appel pour toutes les langues."
                value={prompts.prompt_google_translate}
                onChange={(v) => update('prompt_google_translate', v)}
                onReset={() => reset('prompt_google_translate')}
                rows={7}
                appendNote={
                  'French source zones:\n' +
                  '  "headline": "Jusqu\'à -60% de réduction"\n' +
                  '  "promo_code": "EXTRADISCOUNT"\n' +
                  '  "cta": "ACHETER MAINTENANT"\n' +
                  '  ...\n\n' +
                  'Dutch (nl):\n' +
                  '  RULES (mandatory): - Utiliser "%" sans tiret...\n' +
                  '  TERMS (use exactly): - "Acheter maintenant" → "Nu shoppen"\n' +
                  'German (de): ...\n\n' +
                  'Respond ONLY with valid JSON:\n' +
                  '{ "<lang_code>": { "<zone_label>": "<translated text>" } }'
                }
              />

              <StepCard
                stepNum={3}
                modelLabel="NB2 · gemini-3.1-flash-image-preview · Modèle image"
                modelType="image"
                title="Rendu avec textes cités (règles critiques)"
                description="NB2 reproduit l'image en citant chaque texte pré-traduit entre guillemets. Modifiez ici les règles de rendu qui s'appliquent après la liste des textes."
                value={prompts.prompt_google_render}
                onChange={(v) => update('prompt_google_render', v)}
                onReset={() => reset('prompt_google_render')}
                rows={5}
                prependNote={
                  'Reproduce this French advertising image adapted to [language].\n\n' +
                  'A language expert has pre-translated all text zones. Render each one exactly as quoted:\n\n' +
                  '  - headline: render "Tot -60% korting" in the same typographic style as the original\n' +
                  '  - promo_code: render "EXTRADISCOUNT" in the same typographic style as the original\n' +
                  '  - cta: render "NU SHOPPEN" in the same typographic style as the original\n' +
                  '  ...\n\n' +
                  'Critical rules:'
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Save button */}
        <div className="mt-6">
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 rounded-[12px] bg-brand-green text-white font-bold text-sm hover:bg-brand-green-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : saved ? '✓ Enregistré' : `Enregistrer — ${tab === 'classique' ? 'Classique' : tab === 'precision' ? 'Précision' : 'Natif'}`}
          </button>
        </div>

      </div>
    </main>
  )
}
