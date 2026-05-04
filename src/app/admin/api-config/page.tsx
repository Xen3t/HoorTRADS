'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const GEMINI_MODELS = [
  { group: 'Debug', models: [
    { value: 'TEST', label: 'TEST — Toujours en échec (test backup)' },
  ]},
  { group: 'Gemini 3.1 — Texte', models: [
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite (preview)' },
  ]},
  { group: 'Gemini 3.1 — Image (NB2)', models: [
    { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (NB2)' },
    { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image (NB2 Pro)' },
  ]},
  { group: 'Gemini 2.5', models: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ]},
  { group: 'Gemini 2.0', models: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  ]},
]

const MODEL_DEFAULTS: Record<string, string> = {
  model_generate: 'gemini-3.1-flash-image-preview',
  model_extract: 'gemini-3.1-flash-lite-preview',
  model_translate: 'gemini-3.1-pro-preview',
  model_verify: 'gemini-3.1-pro-preview',
}


interface ApiConfig {
  gemini_api_key: string
  model_generate: string
  model_extract: string
  model_translate: string
  model_verify: string
  generate_temperature: string
  generate_top_p: string
  generate_top_k: string
  drive_client_id: string
  drive_client_secret: string
  openai_api_key: string
  openai_model_extract: string
  openai_model_translate: string
  pretrans_gemini_enabled: string
  pretrans_openai_enabled: string
  image_provider: string
  openai_model_generate: string
  // Unified primary/backup model selection
  primary_model_extract: string
  primary_model_translate: string
  primary_model_generate: string
  primary_model_verify: string
  primary_model_doc_filter: string
  backup_enabled: string
  backup_model_extract: string
  backup_model_translate: string
  backup_model_generate: string
  backup_model_verify: string
  backup_model_doc_filter: string
  openai_image_orchestrator: string
  synthesis_html_enabled: string
}

const DEFAULTS: ApiConfig = {
  gemini_api_key: '',
  model_generate: MODEL_DEFAULTS['model_generate'],
  model_extract: MODEL_DEFAULTS['model_extract'],
  model_translate: MODEL_DEFAULTS['model_translate'],
  model_verify: MODEL_DEFAULTS['model_verify'],
  generate_temperature: '0.2',
  generate_top_p: '0.9',
  generate_top_k: '40',
  drive_client_id: '',
  drive_client_secret: '',
  openai_api_key: '',
  openai_model_extract: 'gpt-5-nano',
  openai_model_translate: 'gpt-5-mini',
  pretrans_gemini_enabled: 'true',
  pretrans_openai_enabled: 'true',
  image_provider: 'gemini',
  openai_model_generate: 'gpt-image-2-2026-04-21',
  primary_model_extract: 'gemini-3.1-flash-lite-preview',
  primary_model_translate: 'gemini-3.1-pro-preview',
  primary_model_generate: 'gemini-3.1-flash-image-preview',
  primary_model_verify: 'gemini-3.1-pro-preview',
  primary_model_doc_filter: 'gemini-3.1-flash-lite-preview',
  backup_enabled: 'true',
  backup_model_extract: 'gpt-5.4-nano',
  backup_model_translate: 'gpt-5.4-mini',
  backup_model_generate: 'gpt-image-2',
  backup_model_verify: 'gpt-5.4-mini',
  backup_model_doc_filter: 'gpt-5.4-nano',
  openai_image_orchestrator: 'gpt-5.4-mini',
  synthesis_html_enabled: 'false',
}

const OPENAI_MODELS = [
  { group: 'GPT-5.5', models: [
    { value: 'gpt-5.5', label: 'GPT-5.5' },
    { value: 'gpt-5.5-pro', label: 'GPT-5.5 Pro' },
  ]},
  { group: 'GPT-5.4', models: [
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
  ]},
  { group: 'GPT-5 (ancienne série)', models: [
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  ]},
  { group: 'GPT-4.1', models: [
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  ]},
  { group: 'o-series (raisonnement)', models: [
    { value: 'o4-mini', label: 'o4-mini' },
    { value: 'o3', label: 'o3' },
  ]},
  { group: 'Images (génération)', models: [
    { value: 'gpt-image-2', label: 'GPT Image 2' },
  ]},
]

const ALL_GEMINI_VALUES = GEMINI_MODELS.flatMap((g) => g.models.map((m) => m.value))
const ALL_OPENAI_VALUES = OPENAI_MODELS.flatMap((g) => g.models.map((m) => m.value))

function isImageModel(modelId: string): boolean {
  if (modelId === 'TEST') return false
  return modelId.toLowerCase().includes('image')
}
function isTextModel(modelId: string): boolean {
  if (modelId === 'TEST') return true
  return !isImageModel(modelId) && !modelId.startsWith('o')
}
function isGeminiImageModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('image') && !modelId.toLowerCase().startsWith('gpt-')
}

function ModelSelect({ value, onChange, provider = 'gemini', filter }: { value: string; onChange: (v: string) => void; provider?: 'gemini' | 'openai' | 'mixed'; filter?: (modelValue: string) => boolean }) {
  let groups: typeof GEMINI_MODELS
  let allValues: string[]
  if (provider === 'mixed') {
    groups = [
      ...GEMINI_MODELS.map((g) => ({ ...g, group: `Gemini — ${g.group}` })),
      ...OPENAI_MODELS.map((g) => ({ ...g, group: `OpenAI — ${g.group}` })),
    ]
    if (filter) {
      groups = groups
        .map((g) => ({ ...g, models: g.models.filter((m) => filter(m.value)) }))
        .filter((g) => g.models.length > 0)
    }
    allValues = groups.flatMap((g) => g.models.map((m) => m.value))
  } else if (provider === 'openai') {
    groups = OPENAI_MODELS
    allValues = ALL_OPENAI_VALUES
  } else {
    groups = GEMINI_MODELS
    allValues = ALL_GEMINI_VALUES
  }
  const isCustom = value && !allValues.includes(value)
  const placeholder = provider === 'openai' ? 'ex: gpt-5-chat-latest' : provider === 'mixed' ? 'ex: gemini-3.1-pro-exp-0123 ou gpt-5-chat-latest' : 'ex: gemini-3.1-pro-exp-0123'
  return (
    <div className="space-y-1.5">
      <select
        value={isCustom ? '__custom__' : (value || '__custom__')}
        onChange={(e) => { if (e.target.value !== '__custom__') onChange(e.target.value) }}
        className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-white focus:border-brand-green focus:outline-none"
      >
        {groups.map((group) => (
          <optgroup key={group.group} label={group.group}>
            {group.models.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </optgroup>
        ))}
        <optgroup label="Autre">
          <option value="__custom__">ID personnalisé…</option>
        </optgroup>
      </select>
      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-white focus:border-brand-green focus:outline-none font-mono"
        />
      )}
    </div>
  )
}

export default function AdminApiConfigPage() {
  const [config, setConfig] = useState<ApiConfig>(DEFAULTS)
  const [saved, setSaved] = useState(false)
  const [activeRole, setActiveRole] = useState<'primary' | 'backup'>('primary')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.config) setConfig((prev) => ({ ...prev, ...data.config }))
      })
      .catch(() => setError('Impossible de charger la configuration'))
      .finally(() => setLoading(false))
  }, [])

  const update = (key: keyof ApiConfig, value: string) =>
    setConfig((prev) => {
      const next = { ...prev, [key]: value }
      // Constraint: at least one pre-translation provider must stay enabled
      if (key === 'pretrans_gemini_enabled' && value !== 'true' && (next.pretrans_openai_enabled || 'true') !== 'true') {
        next.pretrans_openai_enabled = 'true'
      }
      if (key === 'pretrans_openai_enabled' && value !== 'true' && (next.pretrans_gemini_enabled || 'true') !== 'true') {
        next.pretrans_gemini_enabled = 'true'
      }
      return next
    })

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error('Erreur serveur')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Échec de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-text-secondary text-sm">Chargement...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Configuration API</h1>
            <p className="text-sm text-text-secondary">Connecter les services et configurer les modèles</p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
        </div>

        {/* API keys — Gemini + OpenAI */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[12px] shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔑</span>
              <h2 className="font-bold text-text-primary">Clés API</h2>
            </div>
            <button onClick={() => setShowKey(!showKey)} className="text-xs text-text-secondary hover:text-text-primary transition-colors">
              {showKey ? '🙈 Masquer' : '👁 Afficher'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Gemini (ai.google.dev)</label>
              <input
                type={showKey ? 'text' : 'password'}
                value={config.gemini_api_key}
                onChange={(e) => update('gemini_api_key', e.target.value)}
                placeholder="AIza..."
                className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
              />
              {config.gemini_api_key && <p className="text-xs text-brand-green font-semibold mt-1">✓ Renseignée</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">OpenAI (platform.openai.com)</label>
              <input
                type={showKey ? 'text' : 'password'}
                value={config.openai_api_key}
                onChange={(e) => update('openai_api_key', e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
              />
              {config.openai_api_key && <p className="text-xs text-brand-green font-semibold mt-1">✓ Renseignée</p>}
            </div>
          </div>
        </motion.div>

        {/* Configuration IA — Principal / Backup */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="bg-white rounded-[12px] shadow-sm p-5 mb-4">
          {/* Header avec onglet Principal / Backup */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{activeRole === 'primary' ? '⚡' : '🛡️'}</span>
              <h2 className="font-bold text-text-primary">
                Configuration IA
                <span className="text-text-disabled font-normal text-sm ml-2">
                  {activeRole === 'primary' ? '— principal' : '— backup (fallback auto)'}
                </span>
              </h2>
            </div>
            <div className="inline-flex border border-border rounded-full overflow-hidden">
              <button
                onClick={() => setActiveRole('primary')}
                className={`px-3 py-1 text-xs font-semibold transition-all ${activeRole === 'primary' ? 'bg-brand-green text-white' : 'bg-white text-text-secondary hover:bg-surface'}`}
              >
                Principal
              </button>
              <button
                onClick={() => setActiveRole('backup')}
                className={`px-3 py-1 text-xs font-semibold transition-all ${activeRole === 'backup' ? 'bg-brand-green text-white' : 'bg-white text-text-secondary hover:bg-surface'}`}
              >
                Backup
              </button>
            </div>
          </div>

          {activeRole === 'backup' && (
            <div className="flex items-center justify-between px-3 py-2.5 mb-4 rounded-[8px] bg-surface border border-border">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">Activer le backup automatique</p>
                <p className="text-[11px] text-text-disabled">En cas d&apos;échec du modèle principal (503, timeout, fetch failed), l&apos;app bascule sur le modèle backup sans rien demander.</p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none shrink-0 ml-3">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={(config.backup_enabled || 'true') === 'true'}
                    onChange={(e) => update('backup_enabled', e.target.checked ? 'true' : 'false')}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-border rounded-full peer-checked:bg-brand-green transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                </div>
              </label>
            </div>
          )}

          {(() => {
            const prefix = activeRole === 'primary' ? 'primary' : 'backup'
            const steps: { key: string; icon: string; label: string; desc: string }[] = [
              { key: 'extract', icon: '🔎', label: 'Extraction de texte', desc: 'Lit l’image source française et extrait les zones de texte.' },
              { key: 'doc_filter', icon: '📄', label: 'Filtre doc config', desc: 'Si un fichier de config est attaché à la session, filtre son contenu par langue (prix, codes promo, mentions légales) avant la traduction.' },
              { key: 'translate', icon: '🌐', label: 'Traduction', desc: 'Traduit les zones extraites vers toutes les langues cibles.' },
              { key: 'generate', icon: '🎨', label: 'Génération d’image', desc: 'Génère les visuels traduits à partir de l’image source française.' },
              { key: 'verify', icon: '🔍', label: 'Vérification', desc: 'Valide la qualité des traductions et attribue un score.' },
            ]
            const disabled = activeRole === 'backup' && (config.backup_enabled || 'true') !== 'true'
            return (
              <div className={`space-y-5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
                {steps.map((s) => {
                  const configKey = `${prefix}_model_${s.key}` as keyof ApiConfig
                  const currentValue = (config[configKey] as string) || ''
                  const filter = s.key === 'generate'
                    ? (v: string) => v === 'TEST' || isImageModel(v)
                    : s.key === 'verify'
                      ? (v: string) => v === 'TEST' || !isImageModel(v)
                      : isTextModel
                  return (
                    <div key={s.key}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{s.icon}</span>
                        <span className="text-sm font-semibold text-text-primary">{s.label}</span>
                      </div>
                      <p className="text-xs text-text-disabled mb-2 ml-7">{s.desc}</p>
                      <div className="ml-7">
                        <ModelSelect
                          provider="mixed"
                          filter={filter}
                          value={currentValue}
                          onChange={(v) => update(configKey, v)}
                        />
                      </div>
                      {/* Conditional Gemini NB2 params when a Gemini image model is selected for "generate" */}
                      {s.key === 'generate' && isGeminiImageModel(currentValue) && (
                        <div className="ml-7 mt-3 bg-surface rounded-[8px] p-3 space-y-3">
                          <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">Paramètres Nano Banana 2</p>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-text-primary">Température</label>
                              <span className="text-xs font-mono text-brand-green">{config.generate_temperature || '0.2'}</span>
                            </div>
                            <input type="range" min="0" max="2" step="0.05" value={config.generate_temperature || '0.2'} onChange={(e) => update('generate_temperature', e.target.value)} className="w-full accent-brand-green" />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-text-primary">Top-p</label>
                              <span className="text-xs font-mono text-brand-green">{config.generate_top_p || '0.9'}</span>
                            </div>
                            <input type="range" min="0" max="1" step="0.05" value={config.generate_top_p || '0.9'} onChange={(e) => update('generate_top_p', e.target.value)} className="w-full accent-brand-green" />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-text-primary">Top-k</label>
                              <span className="text-xs font-mono text-brand-green">{config.generate_top_k || '40'}</span>
                            </div>
                            <input type="range" min="1" max="100" step="1" value={config.generate_top_k || '40'} onChange={(e) => update('generate_top_k', e.target.value)} className="w-full accent-brand-green" />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </motion.div>


        {/* Rapport Automatique */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="bg-white rounded-[12px] shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">📄</span>
                <h2 className="font-bold text-text-primary">Rapport Automatique</h2>
              </div>
              <p className="text-xs text-text-disabled">
                Génère un fichier HTML autonome à côté des images après chaque export. Contient le tableau des zones extraites,
                les traductions IA et celles validées par l&apos;utilisateur, plus les durées par étape.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none shrink-0">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={(config.synthesis_html_enabled || 'false') === 'true'}
                  onChange={(e) => update('synthesis_html_enabled', e.target.checked ? 'true' : 'false')}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-border rounded-full peer-checked:bg-brand-green transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </div>
            </label>
          </div>
        </motion.div>

        {/* Google Drive */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="bg-white rounded-[12px] shadow-sm p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">☁️</span>
            <h2 className="font-bold text-text-primary">Google Drive <span className="text-text-disabled font-normal text-sm">(optionnel)</span></h2>
          </div>
          <p className="text-sm text-text-secondary mb-3">Destination d&apos;export optionnelle. Nécessite des identifiants OAuth2.</p>
          <label className="block text-xs font-semibold text-text-secondary mb-1">Client ID</label>
          <input
            type={showKey ? 'text' : 'password'}
            value={config.drive_client_id}
            onChange={(e) => update('drive_client_id', e.target.value)}
            placeholder="Google OAuth2 Client ID"
            className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none mb-3"
          />
          <label className="block text-xs font-semibold text-text-secondary mb-1">Client Secret</label>
          <input
            type={showKey ? 'text' : 'password'}
            value={config.drive_client_secret}
            onChange={(e) => update('drive_client_secret', e.target.value)}
            placeholder="Google OAuth2 Client Secret"
            className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
          />
        </motion.div>

        {error && <p className="text-sm text-brand-red mb-3 text-center">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-[12px] bg-brand-green text-white font-bold text-sm hover:bg-brand-green-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : saved ? '✓ Enregistré' : 'Enregistrer la configuration'}
        </button>
      </div>
    </main>
  )
}
