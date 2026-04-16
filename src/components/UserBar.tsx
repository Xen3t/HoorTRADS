'use client'

import { useEffect, useState } from 'react'

interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'graphiste'
}

export default function UserBar() {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.user) setUser(d.user) })
      .catch(() => {})
  }, [])

  if (!user) return null

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="text-text-disabled">
        {user.name}
        <span className="ml-1 opacity-60">({user.role})</span>
      </span>
      <button
        onClick={handleLogout}
        className="text-brand-teal hover:text-brand-teal-hover transition-colors"
      >
        Déconnexion
      </button>
    </div>
  )
}
