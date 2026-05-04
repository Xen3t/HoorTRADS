'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import SessionCard from '@/components/home/SessionCard'
import type { Session } from '@/types/session'
import NotificationToast from '@/components/shared/NotificationToast'
import UserWidget from '@/components/home/UserWidget'
import NotificationBell from '@/components/home/NotificationBell'

export default function ArchivesPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' | 'info' } | null>(null)

  useEffect(() => {
    fetch('/api/sessions/archived')
      .then((r) => r.json())
      .then((data) => {
        if (data.sessions) setSessions(data.sessions)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleUnarchive = async (session: Session) => {
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: 0 }),
      })
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== session.id))
        setToast({ message: 'Session restaurée.', variant: 'success' })
      }
    } catch {
      setToast({ message: 'Erreur lors de la restauration. Réessayez.', variant: 'error' })
    }
  }

  const handleDelete = async (session: Session) => {
    try {
      const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' })
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== session.id))
      }
    } catch {
      setToast({ message: 'Erreur lors de la suppression. Réessayez.', variant: 'error' })
    }
  }

  const handleRename = async (session: Session, newName: string) => {
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
      if (res.ok) {
        setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, name: newName } : s))
      }
    } catch {
      setToast({ message: 'Erreur lors du renommage. Réessayez.', variant: 'error' })
    }
  }

  return (
    <main
      className="min-h-screen px-8 pt-24 pb-12 relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #ffffff 0%, #e8eaed 100%)' }}
    >
      <div className="absolute top-6 right-6 flex items-center gap-3">
        <NotificationBell />
        <UserWidget />
      </div>

      <div className="w-full max-w-[600px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-text-disabled hover:text-text-secondary transition-colors mb-8"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Retour
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-[10px] bg-amber-50 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8"/>
                <rect x="1" y="3" width="22" height="5"/>
                <line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-text-primary">Archives</h1>
              <p className="text-xs text-text-disabled">{sessions.length} session{sessions.length !== 1 ? 's' : ''} archivée{sessions.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[60px] bg-white rounded-[12px] animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 text-text-disabled text-sm"
            >
              Aucune session archivée.
            </motion.div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {sessions.map((session, i) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                  >
                    <SessionCard
                      session={session}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onUnarchive={handleUnarchive}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {toast && (
          <NotificationToast
            message={toast.message}
            variant={toast.variant}
            onDismiss={() => setToast(null)}
          />
        )}
      </AnimatePresence>
    </main>
  )
}
