'use client'

import { motion } from 'framer-motion'

const adminSections = [
  { name: 'Configuration API', href: '/admin/api-config', icon: '🔑', description: 'Connecter Gemini, LLM de vérification et Google Drive' },
  { name: 'Pays & Langues', href: '/admin/countries', icon: '🌍', description: 'Gérer les associations pays-langues' },
  { name: 'Prompts système', href: '/admin/prompts', icon: '💬', description: 'Configurer les prompts de traduction par langue' },
  { name: 'Glossaire', href: '/admin/glossary', icon: '📖', description: 'Gérer les traductions de terminologie de marque' },
  { name: 'Utilisation API', href: '/admin/usage', icon: '📊', description: 'Voir les coûts et statistiques de génération' },
]

export default function AdminPage() {
  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[600px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold text-text-primary">Panneau Admin</h1>
          <p className="text-sm text-text-secondary mt-1">Configurer les paramètres HoorTRAD</p>
        </motion.div>

        <div className="space-y-3">
          {adminSections.map((section, i) => (
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
          ))}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => { window.location.href = '/' }}
            className="text-sm text-brand-teal hover:text-brand-teal-hover transition-colors font-semibold"
          >
            ← Retour à l&apos;accueil
          </button>
        </div>
      </div>
    </main>
  )
}
