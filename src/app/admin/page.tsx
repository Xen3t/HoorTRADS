'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const adminSections: { name: string; href: string; icon: string; description: string; disabled?: boolean }[] = [
  // ── Setup ──────────────────────────────────────────────────────────────────
  { name: 'Configuration API', href: '/admin/api-config', icon: '🔑', description: 'Clé Gemini, modèles par étape, pipeline de vérification, Google Drive' },
  { name: 'Pays & Langues', href: '/admin/countries', icon: '🌍', description: 'Gérer les associations pays-langues' },
  // ── Contenu & IA ───────────────────────────────────────────────────────────
  { name: 'Prompts système', href: '/admin/prompts', icon: '💬', description: 'Configurer les prompts de chaque IA par mode (Classique, Précision, Natif)' },
  { name: 'Glossaire', href: '/admin/glossary', icon: '📖', description: 'Gérer les traductions de terminologie de marque' },
  // ── Expérimentation ────────────────────────────────────────────────────────
  { name: 'Laboratoire de modèles', href: '/admin/lab', icon: '🧪', description: 'Tester extraction + traduction avec différents modèles Gemini' },
  // ── Observabilité ──────────────────────────────────────────────────────────
  { name: 'Logs Gemini', href: '/admin/logs', icon: '🔬', description: 'Prompts envoyés à Gemini, scores de vérification, erreurs' },
  { name: 'Utilisation API', href: '/admin/usage', icon: '📊', description: 'Voir les coûts et statistiques de génération' },
  // ── Équipe ─────────────────────────────────────────────────────────────────
  { name: 'Utilisateurs', href: '/admin/users', icon: '👥', description: 'Gérer les comptes et les rôles (graphiste / admin)' },
  // ── Référence ──────────────────────────────────────────────────────────────
  { name: 'Documentation', href: '/admin/about', icon: '📋', description: 'Pipeline, stratégies de traduction et roadmap' },
]

export default function AdminPage() {
  const [maintenance, setMaintenance] = useState(false)
  const [togglingMaintenance, setTogglingMaintenance] = useState(false)

  useEffect(() => {
    fetch('/api/admin/maintenance').then(r => r.json()).then(d => setMaintenance(d.enabled)).catch(() => {})
  }, [])

  const handleToggleMaintenance = async () => {
    setTogglingMaintenance(true)
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !maintenance }),
      })
      if (res.ok) setMaintenance(!maintenance)
    } finally {
      setTogglingMaintenance(false)
    }
  }

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[600px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold text-text-primary">Panneau Admin</h1>
          <p className="text-sm text-text-secondary mt-1">Configurer les paramètres HoorTRADS</p>
        </motion.div>

        <div className="space-y-3">
          {adminSections.map((section, i) => (
            section.disabled ? (
              <motion.div
                key={section.href}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                title="Temporairement désactivé"
                className="
                  flex items-center gap-4 p-4
                  bg-white rounded-[12px] shadow-sm
                  opacity-40 cursor-not-allowed
                "
              >
                <span className="text-2xl">{section.icon}</span>
                <div>
                  <p className="font-semibold text-sm text-text-primary">{section.name}</p>
                  <p className="text-xs text-text-secondary">{section.description}</p>
                </div>
              </motion.div>
            ) : (
              <motion.a
                key={section.href}
                href={section.href}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="
                  flex items-center gap-4 p-4
                  bg-white rounded-[12px] shadow-sm
                  hover:shadow-default hover:translate-y-[-1px]
                  transition-all duration-200
                "
              >
                <span className="text-2xl">{section.icon}</span>
                <div>
                  <p className="font-semibold text-sm text-text-primary">{section.name}</p>
                  <p className="text-xs text-text-secondary">{section.description}</p>
                </div>
              </motion.a>
            )
          ))}
        </div>

        {/* Maintenance toggle */}
        <div className={`mt-6 flex items-center justify-between px-4 py-3 rounded-[12px] border ${maintenance ? 'bg-amber-50 border-amber-300' : 'bg-white border-border'}`}>
          <div>
            <p className="text-sm font-semibold text-text-primary">Mode maintenance</p>
            <p className="text-xs text-text-secondary">{maintenance ? 'App inaccessible aux utilisateurs' : 'App en ligne'}</p>
          </div>
          <button
            onClick={handleToggleMaintenance}
            disabled={togglingMaintenance}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${maintenance ? 'bg-amber-500' : 'bg-border'} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${maintenance ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => { window.location.href = '/' }}
            className="text-sm text-brand-teal hover:text-brand-teal-hover transition-colors font-semibold block w-full text-center"
          >
            ← Retour à l&apos;accueil
          </button>
        </div>
      </div>
    </main>
  )
}
