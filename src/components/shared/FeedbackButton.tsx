'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'question', label: 'Question' },
  { value: 'general', label: 'Autre' },
]

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [category, setCategory] = useState('bug')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const submit = async () => {
    if (message.trim().length < 3) return
    setIsSending(true)
    setStatus('idle')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          category,
          page_url: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      })
      if (res.ok) {
        setStatus('success')
        setMessage('')
        setTimeout(() => {
          setIsOpen(false)
          setStatus('idle')
        }, 1500)
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Feedback"
        title="Envoyer un feedback"
        className="
          fixed bottom-5 right-5 z-30
          w-11 h-11 rounded-full
          bg-brand-teal text-white shadow-lg
          flex items-center justify-center
          hover:bg-brand-teal-hover hover:scale-105
          transition-all duration-200
        "
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end md:items-center justify-end md:justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => !isSending && setIsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[16px] shadow-xl w-full max-w-[420px] m-4 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-text-primary">Votre retour</h3>
                <button
                  onClick={() => !isSending && setIsOpen(false)}
                  className="text-text-disabled hover:text-text-primary text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <p className="text-xs text-text-secondary mb-3">
                Bug, suggestion, question — toute remarque est utile.
              </p>

              <div className="flex gap-1.5 mb-3 flex-wrap">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      category === c.value
                        ? 'bg-brand-teal text-white border-brand-teal'
                        : 'bg-white text-text-secondary border-border hover:border-brand-teal'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Dites-nous ce qui cloche, ce qui manque, ou une idée..."
                rows={5}
                maxLength={5000}
                className="w-full px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-teal focus:outline-none resize-none"
                disabled={isSending}
              />

              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-text-disabled">{message.length}/5000</span>
                <div className="flex items-center gap-2">
                  {status === 'success' && (
                    <span className="text-xs text-brand-green font-semibold">Envoyé !</span>
                  )}
                  {status === 'error' && (
                    <span className="text-xs text-brand-red font-semibold">Erreur</span>
                  )}
                  <button
                    onClick={submit}
                    disabled={isSending || message.trim().length < 3}
                    className="
                      px-4 py-2 rounded-[8px]
                      bg-brand-teal text-white font-semibold text-sm
                      hover:bg-brand-teal-hover transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed
                    "
                  >
                    {isSending ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
