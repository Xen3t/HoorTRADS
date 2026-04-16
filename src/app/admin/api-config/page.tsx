'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface ApiConfig {
  gemini_api_key: string
  verification_provider: string
  verification_api_key: string
  drive_client_id: string
  drive_client_secret: string
}

const DEFAULTS: ApiConfig = {
  gemini_api_key: '',
  verification_provider: 'gemini',
  verification_api_key: '',
  drive_client_id: '',
  drive_client_secret: '',
}

export default function AdminApiConfigPage() {
  const [config, setConfig] = useState<ApiConfig>(DEFAULTS)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showKeys, setShowKeys] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.config) {
          setConfig((prev) => ({ ...prev, ...data.config }))
        }
      })
      .catch(() => setError('Impossible de charger la configuration'))
      .finally(() => setLoading(false))
  }, [])

  const updateConfig = (key: keyof ApiConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

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
            <p className="text-sm text-text-secondary">Connecter les services externes</p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
        </div>

        {/* Show/hide toggle */}
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setShowKeys(!showKeys)}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            {showKeys ? '🙈 Masquer les clés' : '👁 Afficher les clés'}
          </button>
        </div>

        {/* Gemini API */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[12px] shadow-sm p-5 mb-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤖</span>
            <h2 className="text-sm font-bold text-text-primary">Gemini (Génération d&apos;images)</h2>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Utilisé pour traduire le texte dans les images. Modèle : Gemini 3.1 Flash Image Preview (NB2)
          </p>
          <label className="block text-xs font-semibold text-text-secondary mb-1">Clé API</label>
          <input
            type={showKeys ? 'text' : 'password'}
            value={config.gemini_api_key}
            onChange={(e) => updateConfig('gemini_api_key', e.target.value)}
            placeholder="Entrez votre clé API Gemini"
            className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
          />
          <p className="text-[10px] text-text-disabled mt-1">
            Obtenez votre clé sur ai.google.dev
          </p>
          {config.gemini_api_key && (
            <div className="mt-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-green" />
              <span className="text-[10px] text-brand-green font-semibold">Clé renseignée</span>
            </div>
          )}
        </motion.div>

        {/* Verification LLM */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[12px] shadow-sm p-5 mb-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔍</span>
            <h2 className="text-sm font-bold text-text-primary">Vérification des traductions</h2>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            LLM optionnel pour vérifier la qualité des traductions.
          </p>
          <label className="block text-xs font-semibold text-text-secondary mb-1">Fournisseur</label>
          <select
            value={config.verification_provider}
            onChange={(e) => updateConfig('verification_provider', e.target.value)}
            className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-white mb-3"
          >
            <option value="gemini">Gemini Flash (par défaut)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="mistral">Mistral</option>
          </select>
          {config.verification_provider !== 'gemini' && (
            <>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Clé API</label>
              <input
                type={showKeys ? 'text' : 'password'}
                value={config.verification_api_key}
                onChange={(e) => updateConfig('verification_api_key', e.target.value)}
                placeholder={`Clé API ${config.verification_provider}`}
                className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
              />
            </>
          )}
          {config.verification_provider === 'gemini' && (
            <p className="text-[10px] text-text-disabled">
              Utilise la même clé API Gemini que pour la génération
            </p>
          )}
        </motion.div>

        {/* Google Drive */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-[12px] shadow-sm p-5 mb-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">☁️</span>
            <h2 className="text-sm font-bold text-text-primary">Google Drive (Optionnel)</h2>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Destination d&apos;export optionnelle. Nécessite des identifiants OAuth2.
          </p>
          <label className="block text-xs font-semibold text-text-secondary mb-1">Client ID</label>
          <input
            type={showKeys ? 'text' : 'password'}
            value={config.drive_client_id}
            onChange={(e) => updateConfig('drive_client_id', e.target.value)}
            placeholder="Google OAuth2 Client ID"
            className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none mb-2"
          />
          <label className="block text-xs font-semibold text-text-secondary mb-1">Client Secret</label>
          <input
            type={showKeys ? 'text' : 'password'}
            value={config.drive_client_secret}
            onChange={(e) => updateConfig('drive_client_secret', e.target.value)}
            placeholder="Google OAuth2 Client Secret"
            className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
          />
        </motion.div>

        {error && (
          <p className="text-sm text-brand-red mb-3 text-center">{error}</p>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="
            w-full py-3 rounded-[12px]
            bg-brand-green text-white font-bold text-sm
            hover:bg-brand-green-hover transition-colors
            disabled:opacity-50
          "
        >
          {saving ? 'Enregistrement...' : saved ? '✓ Enregistré' : 'Enregistrer la configuration'}
        </button>
      </div>
    </main>
  )
}
