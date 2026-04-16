'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

interface GlossaryTerm {
  id: string
  source: string
  target: string
  language: string
}

export default function AdminGlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [newSource, setNewSource] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newLang, setNewLang] = useState('de')

  const handleAdd = () => {
    if (!newSource.trim() || !newTarget.trim()) return
    setTerms([
      ...terms,
      {
        id: Date.now().toString(),
        source: newSource.trim(),
        target: newTarget.trim(),
        language: newLang,
      },
    ])
    setNewSource('')
    setNewTarget('')
  }

  const handleDelete = (id: string) => {
    setTerms(terms.filter((t) => t.id !== id))
  }

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Glossaire</h1>
            <p className="text-sm text-text-secondary">{terms.length} termes configurés</p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
        </div>

        {/* Add term form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[12px] shadow-sm p-5 mb-4"
        >
          <p className="text-sm font-semibold text-text-secondary mb-3">Ajouter un terme</p>
          <div className="flex gap-2">
            <input
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              placeholder="Terme français"
              className="flex-1 px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
            />
            <span className="self-center text-text-disabled">→</span>
            <input
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="Traduction"
              className="flex-1 px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
            />
            <select
              value={newLang}
              onChange={(e) => setNewLang(e.target.value)}
              className="px-2 py-2 rounded-[8px] text-sm border border-border bg-white"
            >
              <option value="de">DE</option>
              <option value="es">ES</option>
              <option value="it">IT</option>
              <option value="en">EN</option>
              <option value="nl">NL</option>
              <option value="pt">PT</option>
              <option value="pl">PL</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={!newSource.trim() || !newTarget.trim()}
              className="px-4 py-2 bg-brand-green text-white font-semibold text-sm rounded-[8px] hover:bg-brand-green-hover disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
        </motion.div>

        {/* Term list */}
        {terms.length > 0 ? (
          <div className="bg-white rounded-[12px] shadow-sm overflow-hidden">
            {terms.map((term, i) => (
              <motion.div
                key={term.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface"
              >
                <span className="text-sm font-medium text-text-primary flex-1">{term.source}</span>
                <span className="text-text-disabled">→</span>
                <span className="text-sm text-text-primary flex-1">{term.target}</span>
                <span className={`fi fi-${term.language === 'en' ? 'gb' : term.language}`} style={{ fontSize: '12px' }} />
                <span className="text-xs text-text-disabled uppercase">{term.language}</span>
                <button
                  onClick={() => handleDelete(term.id)}
                  className="text-text-disabled hover:text-brand-red transition-colors text-sm"
                >
                  ×
                </button>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-text-disabled text-sm">
            Aucun terme dans le glossaire. Ajoutez des termes ci-dessus pour améliorer la cohérence des traductions.
          </div>
        )}
      </div>
    </main>
  )
}
