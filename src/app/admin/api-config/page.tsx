'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const GEMINI_MODELS = [
  { group: 'Gemini 3 (Preview)', models: [
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite Preview' },
    { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview (NB2)' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview' },
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
  { group: 'Gemini 1.5', models: [
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ]},
]

const MODEL_DEFAULTS: Record<string, string> = {
  model_generate: 'gemini-3.1-flash-image-preview',
  model_extract: 'gemini-3.1-flash-lite-preview',
  model_translate: 'gemini-3.1-pro-preview',
  model_verify: 'gemini-3.1-pro-preview',
}

const MODEL_USAGES = [
  {
    key: 'model_extract',
    icon: '🔎',
    label: 'Extraction de texte',
    desc: 'Lit l\'image source française et extrait toutes les zones de texte visibles (mode Natif)',
  },
  {
    key: 'model_translate',
    icon: '🌐',
    label: 'Traduction',
    desc: 'Traduit les zones extraites vers toutes les langues cibles en un seul appel (mode Natif)',
  },
  {
    key: 'model_generate',
    icon: '🤖',
    label: 'Génération d\'images (NB2)',
    desc: 'Génère les visuels traduits depuis l\'image source française — doit supporter la génération d\'images',
  },
  {
    key: 'model_verify',
    icon: '🔍',
    label: 'Vérification des traductions',
    desc: 'Valide la qualité du texte traduit et attribue un score 0–5 (VALIDE / LIMITE / À CORRIGER)',
  },
]

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
  verification_mode: string
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
  verification_mode: 'post_render',
}

const ALL_MODEL_VALUES = GEMINI_MODELS.flatMap((g) => g.models.map((m) => m.value))

function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isCustom = value && !ALL_MODEL_VALUES.includes(value)
  return (
    <div className="space-y-1.5">
      <select
        value={isCustom ? '__custom__' : (value || '__custom__')}
        onChange={(e) => { if (e.target.value !== '__custom__') onChange(e.target.value) }}
        className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-white focus:border-brand-green focus:outline-none"
      >
        {GEMINI_MODELS.map((group) => (
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
          placeholder="ex: gemini-3.1-pro-exp-0123"
          className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-white focus:border-brand-green focus:outline-none font-mono"
        />
      )}
    </div>
  )
}

export default function AdminApiConfigPage() {
  const [config, setConfig] = useState<ApiConfig>(DEFAULTS)
  const [saved, setSaved] = useState(false)
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
    setConfig((prev) => ({ ...prev, [key]: value }))

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

        {/* Clé API Gemini */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[12px] shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔑</span>
              <h2 className="font-bold text-text-primary">Clé API Gemini</h2>
            </div>
            <button onClick={() => setShowKey(!showKey)} className="text-xs text-text-secondary hover:text-text-primary transition-colors">
              {showKey ? '🙈 Masquer' : '👁 Afficher'}
            </button>
          </div>
          <p className="text-sm text-text-secondary mb-3">
            Une seule clé utilisée pour toutes les étapes — extraction, traduction, génération et vérification.
          </p>
          <input
            type={showKey ? 'text' : 'password'}
            value={config.gemini_api_key}
            onChange={(e) => update('gemini_api_key', e.target.value)}
            placeholder="Entrez votre clé API Gemini"
            className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
          />
          <p className="text-xs text-text-disabled mt-1">Obtenez votre clé sur ai.google.dev</p>
          {config.gemini_api_key && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-green" />
              <span className="text-xs text-brand-green font-semibold">Clé renseignée</span>
            </div>
          )}
        </motion.div>

        {/* Modèles */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="bg-white rounded-[12px] shadow-sm p-5 mb-4">
          <h2 className="font-bold text-text-primary mb-4">Modèles utilisés</h2>
          <div className="space-y-5">
            {MODEL_USAGES.map((u) => (
              <div key={u.key}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{u.icon}</span>
                  <span className="text-sm font-semibold text-text-primary">{u.label}</span>
                  {(config[u.key as keyof ApiConfig] || MODEL_DEFAULTS[u.key]) === MODEL_DEFAULTS[u.key] && (
                    <span className="text-[10px] bg-surface text-text-disabled px-1.5 py-0.5 rounded-full">défaut</span>
                  )}
                </div>
                <p className="text-xs text-text-disabled mb-2 ml-7">{u.desc}</p>
                <div className="ml-7">
                  <ModelSelect
                    value={config[u.key as keyof ApiConfig] || MODEL_DEFAULTS[u.key]}
                    onChange={(v) => update(u.key as keyof ApiConfig, v)}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* NB2 Generation params */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }} className="bg-white rounded-[12px] shadow-sm p-5 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎛️</span>
            <h2 className="font-bold text-text-primary">Paramètres Nano Banana 2</h2>
          </div>
          <p className="text-sm text-text-secondary mb-1">
            Contrôle la créativité et la stabilité lors de la génération d&apos;images.
            Des valeurs basses réduisent les hallucinations ; des valeurs élevées augmentent la variété.
          </p>
          <div className="bg-surface rounded-[8px] px-4 py-3 mb-4 text-xs text-text-secondary space-y-1">
            <p><span className="font-semibold text-text-primary">Température basse (ex : 0.2)</span> → le modèle suit fidèlement le prompt, peu de variation. Recommandé pour limiter les hallucinations.</p>
            <p><span className="font-semibold text-text-primary">Température haute (ex : 1.0+)</span> → le modèle est plus créatif mais risque d&apos;inventer des éléments visuels non demandés.</p>
            <p className="pt-1 text-text-disabled">Valeurs recommandées anti-hallucinations : Température 0.2 · Top-p 0.9 · Top-k 40</p>
          </div>
          <div className="space-y-4">
            {/* Temperature */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-text-primary">Température</label>
                <span className="text-sm font-mono text-brand-green">{config.generate_temperature || '0.2'}</span>
              </div>
              <input
                type="range" min="0" max="2" step="0.05"
                value={config.generate_temperature || '0.2'}
                onChange={(e) => update('generate_temperature', e.target.value)}
                className="w-full accent-brand-green"
              />
              <div className="flex justify-between text-[10px] text-text-disabled mt-0.5">
                <span>0 – Déterministe</span>
                <span>2 – Très créatif</span>
              </div>
            </div>
            {/* Top-p */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-text-primary">Top-p <span className="font-normal text-text-disabled">(nucleus sampling)</span></label>
                <span className="text-sm font-mono text-brand-green">{config.generate_top_p || '0.9'}</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.05"
                value={config.generate_top_p || '0.9'}
                onChange={(e) => update('generate_top_p', e.target.value)}
                className="w-full accent-brand-green"
              />
              <div className="flex justify-between text-[10px] text-text-disabled mt-0.5">
                <span>0 – Très restrictif</span>
                <span>1 – Aucun filtrage</span>
              </div>
            </div>
            {/* Top-k */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-text-primary">Top-k</label>
                <span className="text-sm font-mono text-brand-green">{config.generate_top_k || '40'}</span>
              </div>
              <input
                type="range" min="1" max="100" step="1"
                value={config.generate_top_k || '40'}
                onChange={(e) => update('generate_top_k', e.target.value)}
                className="w-full accent-brand-green"
              />
              <div className="flex justify-between text-[10px] text-text-disabled mt-0.5">
                <span>1 – Très concentré</span>
                <span>100 – Très ouvert</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Pipeline */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="bg-white rounded-[12px] shadow-sm p-5 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">⚙️</span>
            <h2 className="font-bold text-text-primary">Pipeline de vérification</h2>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            Choisir quand la vérification des traductions intervient dans le flux de génération.
          </p>
          <div className="space-y-3">
            {[
              {
                value: 'post_render',
                label: 'Après la génération (défaut)',
                desc: 'Extract → Traduction → NB2 → Vérification image + texte',
              },
              {
                value: 'pre_render',
                label: 'Avant la génération',
                desc: 'Extract → Traduction → Vérification texte → NB2 → Vérification visuelle',
              },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => update('verification_mode', opt.value)}
                className={`w-full text-left px-4 py-3 rounded-[8px] border transition-colors ${
                  (config.verification_mode || 'post_render') === opt.value
                    ? 'border-brand-green bg-brand-green-light'
                    : 'border-border hover:border-brand-green/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                    (config.verification_mode || 'post_render') === opt.value
                      ? 'border-brand-green bg-brand-green'
                      : 'border-border'
                  }`} />
                  <span className="text-sm font-semibold text-text-primary">{opt.label}</span>
                </div>
                <p className="text-xs text-text-secondary ml-5">{opt.desc}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-text-disabled mt-3">S&apos;applique uniquement au mode Natif (extract + traduction séparé)</p>
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
