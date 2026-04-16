'use client'

import { motion } from 'framer-motion'
import type { Session } from '@/types/session'

interface SessionCardProps {
  session: Session
  onClick: (session: Session) => void
  onDelete: (session: Session) => void
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'A l\'instant'
  if (diffMins < 60) return `il y a ${diffMins}m`
  if (diffHours < 24) return `il y a ${diffHours}h`
  if (diffDays < 7) return `il y a ${diffDays}j`

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function SessionCard({ session, onClick, onDelete }: SessionCardProps) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      className="
        w-full flex items-center
        p-4 bg-white rounded-[12px] shadow-sm
        hover:shadow-default hover:bg-surface
        transition-all duration-200
        group
      "
    >
      <button
        onClick={() => onClick(session)}
        className="flex-1 text-left cursor-pointer"
      >
        <p className="font-semibold text-sm text-text-primary">{session.name}</p>
        <p className="text-xs text-text-secondary mt-0.5">
          {session.image_count} images · {session.market_count} marchés
        </p>
      </button>
      <span className="text-xs text-text-disabled mr-3">{formatRelativeDate(session.updated_at)}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete(session)
        }}
        className="
          text-text-disabled hover:text-brand-red
          opacity-0 group-hover:opacity-100
          transition-all duration-200
          text-sm p-1
        "
        title="Supprimer"
      >
        ×
      </button>
    </motion.div>
  )
}
