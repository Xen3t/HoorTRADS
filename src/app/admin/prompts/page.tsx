'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

const DEFAULT_PROMPT = 'Translate all text in this image to {language}. Do not change any other elements of the image — preserve the layout, colors, fonts, and design exactly as they are.'

export default function AdminPromptsPage() {
  const [basePrompt, setBasePrompt] = useState(DEFAULT_PROMPT)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    // In V2: save to SQLite via API
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Prompts système</h1>
            <p className="text-sm text-text-secondary">Configurer les prompts de traduction</p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[12px] shadow-sm p-5 mb-4"
        >
          <label className="block text-sm font-semibold text-text-secondary mb-2">
            Prompt de traduction de base
          </label>
          <textarea
            value={basePrompt}
            onChange={(e) => setBasePrompt(e.target.value)}
            rows={5}
            className="
              w-full px-3 py-2 rounded-[8px] text-sm
              border border-border bg-white text-text-primary
              focus:border-brand-green focus:outline-none
              resize-none
            "
          />
          <p className="text-xs text-text-disabled mt-1">
            Utilisez {'{language}'} comme variable pour le nom de la langue cible
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[12px] shadow-sm p-5 mb-6"
        >
          <p className="text-sm font-semibold text-text-secondary mb-2">Formats publicitaires (génération JSON)</p>
          <div className="flex flex-wrap gap-2">
            {['1080x1080', '1080x1920', '1920x1080', '1080x1350'].map((f) => (
              <span key={f} className="px-3 py-1 bg-surface rounded-[20px] text-xs font-semibold text-text-primary">
                {f}
              </span>
            ))}
          </div>
          <p className="text-xs text-text-disabled mt-2">
            Ces formats génèrent automatiquement traductions.json
          </p>
        </motion.div>

        <button
          onClick={handleSave}
          className="
            w-full py-3 rounded-[12px]
            bg-brand-green text-white font-bold text-sm
            hover:bg-brand-green-hover transition-colors
          "
        >
          {saved ? '✓ Enregistré' : 'Enregistrer les modifications'}
        </button>
      </div>
    </main>
  )
}
