'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Feedback {
  id: string
  user_id: string | null
  user_email: string | null
  category: string
  message: string
  page_url: string | null
  created_at: string
  status: string
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  bug: { label: 'Bug', color: 'bg-red-100 text-red-700' },
  suggestion: { label: 'Suggestion', color: 'bg-blue-100 text-blue-700' },
  question: { label: 'Question', color: 'bg-amber-100 text-amber-700' },
  general: { label: 'Autre', color: 'bg-slate-100 text-slate-700' },
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [isClearingAll, setIsClearingAll] = useState(false)

  useEffect(() => {
    fetch('/api/feedback')
      .then((r) => r.json())
      .then((d) => setItems(d.feedback || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const deleteOne = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/feedback?id=${id}`, { method: 'DELETE' })
      if (res.ok) setItems((prev) => prev.filter((f) => f.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const deleteAll = async () => {
    setIsClearingAll(true)
    try {
      const res = await fetch('/api/feedback?all=1', { method: 'DELETE' })
      if (res.ok) {
        setItems([])
        setConfirmClearAll(false)
      }
    } finally {
      setIsClearingAll(false)
    }
  }

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[800px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Feedback</h1>
            <p className="text-sm text-text-secondary">{items.length} feedback{items.length > 1 ? 's' : ''} au total</p>
          </div>
          <div className="flex items-center gap-3">
            {items.length > 0 && (
              <button
                onClick={() => setConfirmClearAll(true)}
                className="text-xs text-text-disabled hover:text-brand-red transition-colors"
              >
                Tout supprimer
              </button>
            )}
            <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
          </div>
        </div>

        {loading ? (
          <p className="text-text-secondary text-sm text-center py-10">Chargement...</p>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-[12px] shadow-sm p-10 text-center">
            <p className="text-text-secondary text-sm">Aucun retour pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((f, i) => {
              const cat = CATEGORY_LABELS[f.category] || CATEGORY_LABELS.general
              const d = new Date(f.created_at)
              const dateStr = d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
              const isDeleting = deletingId === f.id
              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: isDeleting ? 0.4 : 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="bg-white rounded-[12px] shadow-sm p-4 group"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                      <span className="text-xs text-text-secondary truncate">{f.user_email || 'Anonyme'}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] text-text-disabled">{dateStr}</span>
                      <button
                        onClick={() => deleteOne(f.id)}
                        disabled={isDeleting}
                        className="text-text-disabled hover:text-brand-red transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        title="Supprimer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{f.message}</p>
                  {f.page_url && (
                    <p className="text-[10px] text-text-disabled font-mono mt-2">{f.page_url}</p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      <AnimatePresence>
        {confirmClearAll && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => !isClearingAll && setConfirmClearAll(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[16px] shadow-xl p-6 max-w-[420px] w-full mx-4"
            >
              <h3 className="text-base font-bold text-text-primary mb-2">Supprimer tous les retours ?</h3>
              <p className="text-sm text-text-secondary mb-6">
                Action irréversible. {items.length} feedback{items.length > 1 ? 's' : ''} seront effacé{items.length > 1 ? 's' : ''} définitivement.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmClearAll(false)}
                  disabled={isClearingAll}
                  className="px-4 py-2 rounded-[8px] text-sm font-semibold border border-border text-text-secondary hover:bg-surface transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={deleteAll}
                  disabled={isClearingAll}
                  className="px-4 py-2 rounded-[8px] text-sm font-semibold bg-brand-red text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {isClearingAll ? 'Suppression...' : 'Tout supprimer'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  )
}
