'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'

const adminGroups: { label: string; items: { name: string; href: string; icon: string; description: string; disabled?: boolean }[] }[] = [
  {
    label: 'Observabilité',
    items: [
      { name: 'Logs IA', href: '/admin/logs', icon: '🔬', description: 'Prompts, scores de vérification, erreurs' },
      { name: 'Utilisation API', href: '/admin/usage', icon: '📊', description: 'Coûts et statistiques de génération' },
      { name: 'Feedback', href: '/admin/feedback', icon: '💬', description: 'Bugs et suggestions depuis l\'app' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { name: 'Prompts système', href: '/admin/prompts', icon: '🧠', description: 'Prompts d\'extraction, traduction et rendu' },
      { name: 'Configuration API', href: '/admin/api-config', icon: '🔑', description: 'Clés API, modèles, Google Drive' },
      { name: 'Pays & Langues', href: '/admin/countries', icon: '🌍', description: 'Associations pays-langues' },
      { name: 'Glossaire', href: '/admin/glossary', icon: '📖', description: 'Terminologie de marque' },
    ],
  },
  {
    label: 'Équipe',
    items: [
      { name: 'Utilisateurs', href: '/admin/users', icon: '👥', description: 'Comptes et rôles (graphiste / admin)' },
    ],
  },
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

  let delay = 0

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-10"
        >
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Panneau Admin</h1>
            <p className="text-sm text-text-secondary mt-1">Configurer les paramètres HoorTRADS</p>
          </div>
          <Link href="/" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Accueil</Link>
        </motion.div>

        <div className="space-y-8">
          {adminGroups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">{group.label}</p>
              <div className="grid grid-cols-2 gap-3">
                {group.items.map((section) => {
                  const d = delay
                  delay += 0.05
                  return section.disabled ? (
                    <motion.div
                      key={section.href}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: d }}
                      title="Temporairement désactivé"
                      className="flex items-start gap-3 p-4 bg-white rounded-[12px] shadow-sm opacity-40 cursor-not-allowed"
                    >
                      <span className="text-2xl mt-0.5">{section.icon}</span>
                      <div>
                        <p className="font-semibold text-sm text-text-primary">{section.name}</p>
                        <p className="text-xs text-text-secondary mt-0.5">{section.description}</p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.a
                      key={section.href}
                      href={section.href}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: d }}
                      className="flex items-start gap-3 p-4 bg-white rounded-[12px] shadow-sm hover:shadow-default hover:translate-y-[-1px] transition-all duration-200"
                    >
                      <span className="text-2xl mt-0.5">{section.icon}</span>
                      <div>
                        <p className="font-semibold text-sm text-text-primary">{section.name}</p>
                        <p className="text-xs text-text-secondary mt-0.5">{section.description}</p>
                      </div>
                    </motion.a>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className={`mt-8 flex items-center justify-between px-4 py-3 rounded-[12px] border ${maintenance ? 'bg-amber-50 border-amber-300' : 'bg-white border-border'}`}>
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
      </div>
    </main>
  )
}
