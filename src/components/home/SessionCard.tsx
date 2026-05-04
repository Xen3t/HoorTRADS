'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Session } from '@/types/session'

interface SessionCardProps {
  session: Session
  onDelete: (session: Session) => void
  onRename: (session: Session, newName: string) => void
  onArchive?: (session: Session) => void
  onUnarchive?: (session: Session) => void
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

const STEP_TO_PATH: Record<string, string> = {
  draft:        'configure',
  configure:    'configure',
  configuring:  'configure',
  generating:   'generate',
  generate:     'generate',
  'text-review':'text-review',
  translations: 'text-review',
  review:       'review',
  reviewing:    'review',
  export:       'export',
  exported:     'export',
}

const STEP_LABELS: Record<string, { label: string; color: string }> = {
  draft:        { label: 'Brouillon',   color: 'bg-surface text-text-disabled' },
  configure:    { label: 'Config',      color: 'bg-surface text-text-secondary' },
  configuring:  { label: 'Config',      color: 'bg-surface text-text-secondary' },
  generating:   { label: 'Génération',  color: 'bg-brand-teal-light text-brand-teal' },
  generate:     { label: 'Génération',  color: 'bg-brand-teal-light text-brand-teal' },
  'text-review':{ label: 'Traductions', color: 'bg-brand-teal-light text-brand-teal' },
  translations: { label: 'Traductions', color: 'bg-brand-teal-light text-brand-teal' },
  review:       { label: 'Visuels',     color: 'bg-brand-green-light text-brand-green' },
  reviewing:    { label: 'Visuels',     color: 'bg-brand-green-light text-brand-green' },
  export:       { label: 'Export',      color: 'bg-surface text-text-secondary' },
  exported:     { label: 'Exporté',     color: 'bg-brand-green-light text-brand-green' },
}

export default function SessionCard({ session, onDelete, onRename, onArchive, onUnarchive }: SessionCardProps) {
  const step = STEP_LABELS[session.current_step] || STEP_LABELS.configure
  const path = STEP_TO_PATH[session.current_step] || 'configure'
  const href = `/campaign/${session.id}/${path}`

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(session.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) inputRef.current?.select()
  }, [isEditing])

  const confirmRename = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== session.name) onRename(session, trimmed)
    else setEditName(session.name)
    setIsEditing(false)
  }

  return (
    <motion.div
      whileHover={{ y: -1 }}
      className="relative group"
    >
      <a
        href={isEditing ? undefined : href}
        onClick={isEditing ? (e) => e.preventDefault() : undefined}
        className="
          w-full flex items-center gap-3
          p-4 bg-white rounded-[12px] shadow-sm
          hover:shadow-default
          transition-all duration-200
          block
        "
      >
        <div className="flex-1 min-w-0 pr-20">
          <div className="flex items-center gap-2 mb-0.5">
            {isEditing ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={confirmRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename()
                  if (e.key === 'Escape') { setEditName(session.name); setIsEditing(false) }
                }}
                onClick={(e) => e.preventDefault()}
                className="font-semibold text-sm text-text-primary bg-transparent border-b border-brand-teal outline-none w-full"
              />
            ) : (
              <p className="font-semibold text-sm text-text-primary truncate">{session.name}</p>
            )}
            <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${step.color}`}>
              {step.label}
            </span>
          </div>
          <p className="text-xs text-text-secondary">
            {session.image_count} images · {session.market_count} marchés · {formatRelativeDate(session.created_at)}
          </p>
        </div>
      </a>

      {/* Action buttons — hover only, outside the link */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        {onRename && (
          <button
            onClick={(e) => { e.preventDefault(); setEditName(session.name); setIsEditing(true) }}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] text-text-disabled hover:text-brand-teal hover:bg-teal-50 transition-all duration-200"
            title="Renommer cette session"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
        {onArchive && (
          <button
            onClick={(e) => { e.preventDefault(); onArchive(session) }}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] text-text-disabled hover:text-amber-500 hover:bg-amber-50 transition-all duration-200"
            title="Archiver cette session"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 8 21 21 3 21 3 8"/>
              <rect x="1" y="3" width="22" height="5"/>
              <line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
          </button>
        )}
        {onUnarchive && (
          <button
            onClick={(e) => { e.preventDefault(); onUnarchive(session) }}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] text-text-disabled hover:text-brand-teal hover:bg-teal-50 transition-all duration-200"
            title="Désarchiver cette session"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 8 21 21 3 21 3 8"/>
              <rect x="1" y="3" width="22" height="5"/>
              <polyline points="10 12 12 10 14 12"/>
              <line x1="12" y1="10" x2="12" y2="16"/>
            </svg>
          </button>
        )}
        <button
          onClick={(e) => { e.preventDefault(); onDelete(session) }}
          className="w-8 h-8 flex items-center justify-center rounded-[8px] text-text-disabled hover:text-brand-red hover:bg-red-50 transition-all duration-200"
          title="Supprimer cette session"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </motion.div>
  )
}
