'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function MaintenancePage() {
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.href = '/'
      } else {
        const data = await res.json()
        setError(data.error || 'Erreur')
      }
    } catch {
      setError('Erreur serveur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-8 bg-surface">
      <div className="text-center max-w-[400px] w-full">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold text-text-primary mb-2">
            Hoor<span className="text-brand-green">TRADS</span>
          </h1>
          <div className="mt-8 bg-white rounded-[16px] border border-border p-8 shadow-sm">
            <p className="text-2xl mb-2">🔧</p>
            <p className="font-semibold text-text-primary">Maintenance en cours</p>
            <p className="text-sm text-text-secondary mt-2">
              L&apos;application est temporairement indisponible. Revenez dans quelques instants.
            </p>

            <button
              onClick={() => setShowForm(!showForm)}
              className="mt-6 text-xs text-text-disabled hover:text-text-secondary transition-colors"
            >
              Accès administrateur
            </button>

            <AnimatePresence>
              {showForm && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleDisable}
                  className="mt-4 space-y-3 overflow-hidden"
                >
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Identifiant"
                    required
                    className="w-full px-3 py-2.5 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green transition-colors"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe"
                    required
                    className="w-full px-3 py-2.5 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green transition-colors"
                  />
                  {error && <p className="text-xs text-brand-red">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-[10px] bg-brand-green text-white font-bold text-sm hover:bg-brand-green-hover transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Vérification...' : 'Désactiver la maintenance'}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </main>
  )
}
