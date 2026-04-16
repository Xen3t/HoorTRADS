'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface AuthUser {
  id: string
  name: string
  role: 'admin' | 'graphiste'
}

export default function UserWidget() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [open, setOpen] = useState(false)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [pwd, setPwd] = useState({ current: '', next: '' })
  const [pwdError, setPwdError] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdSuccess, setPwdSuccess] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.user) setUser(d.user) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowChangePwd(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwd.next || pwd.next.length < 4) { setPwdError('Minimum 4 caractères'); return }
    setPwdSaving(true)
    setPwdError('')
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.next }),
      })
      if (res.ok) {
        setPwdSuccess(true)
        setPwd({ current: '', next: '' })
        setTimeout(() => { setPwdSuccess(false); setShowChangePwd(false); setOpen(false) }, 1500)
      } else {
        const d = await res.json()
        setPwdError(d.error || 'Erreur')
      }
    } finally {
      setPwdSaving(false)
    }
  }

  if (!user) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setShowChangePwd(false) }}
        className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
      >
        <span className="text-sm font-semibold">{user.name}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className={`text-text-disabled transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 bg-white rounded-[12px] shadow-lg border border-border w-56 z-50 overflow-hidden"
          >
            {!showChangePwd ? (
              <>
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-bold text-text-primary">{user.name}</p>
                  <p className="text-[10px] text-text-disabled capitalize">{user.role}</p>
                </div>
                <div className="py-1">
                  {user.role === 'admin' && (
                    <a
                      href="/admin"
                      className="block w-full text-left px-4 py-2.5 text-sm text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
                    >
                      Panneau Admin
                    </a>
                  )}
                  <button
                    onClick={() => setShowChangePwd(true)}
                    className="w-full text-left px-4 py-2.5 text-sm text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
                  >
                    Changer le mot de passe
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm text-brand-red hover:bg-red-50 transition-colors"
                  >
                    Déconnexion
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleChangePwd} className="p-4 space-y-3">
                <p className="text-xs font-bold text-text-primary mb-1">Nouveau mot de passe</p>
                <input
                  type="password"
                  value={pwd.current}
                  onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                  placeholder="Mot de passe actuel"
                  autoFocus
                  className="w-full px-3 py-2 rounded-[8px] text-xs border border-border bg-surface focus:outline-none focus:border-brand-green"
                />
                <input
                  type="password"
                  value={pwd.next}
                  onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                  placeholder="Nouveau mot de passe"
                  className="w-full px-3 py-2 rounded-[8px] text-xs border border-border bg-surface focus:outline-none focus:border-brand-green"
                />
                {pwdError && <p className="text-[10px] text-brand-red">{pwdError}</p>}
                {pwdSuccess && <p className="text-[10px] text-brand-green font-bold">Mot de passe changé ✓</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowChangePwd(false); setPwd({ current: '', next: '' }); setPwdError('') }}
                    className="flex-1 py-1.5 rounded-[6px] border border-border text-xs text-text-secondary hover:bg-surface"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={pwdSaving}
                    className="flex-1 py-1.5 rounded-[6px] bg-brand-green text-white text-xs font-bold hover:bg-brand-green-hover disabled:opacity-60"
                  >
                    {pwdSaving ? '...' : 'Valider'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
