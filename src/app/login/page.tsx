'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'

function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.href = next
      } else {
        const data = await res.json()
        setError(data.error || 'Erreur de connexion')
      }
    } catch {
      setError('Erreur serveur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-[380px]"
    >
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-text-primary">HoorTRADS</h1>
        <p className="text-sm text-text-secondary mt-1">Connectez-vous pour continuer</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-[16px] border border-border p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1.5">Identifiant</label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder=""
            autoComplete="username"
            autoFocus
            required
            className="
              w-full px-3 py-2.5 rounded-[8px] text-sm
              border border-border bg-surface
              focus:outline-none focus:border-brand-green focus:bg-white
              transition-colors
            "
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1.5">Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            className="
              w-full px-3 py-2.5 rounded-[8px] text-sm
              border border-border bg-surface
              focus:outline-none focus:border-brand-green focus:bg-white
              transition-colors
            "
          />
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-brand-red font-medium"
          >
            {error}
          </motion.p>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="
            w-full py-2.5 rounded-[10px]
            bg-brand-green text-white font-bold text-sm
            hover:bg-brand-green-hover transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </motion.div>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-surface">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
