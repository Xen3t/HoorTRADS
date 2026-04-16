'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { GenerationTask } from '@/types/generation'
import ScoreBadge from './ScoreBadge'

interface TaskWithVersions extends GenerationTask {
  versions?: string[]
}

interface ImageDetailModalProps {
  task: TaskWithVersions
  jobId: string
  onClose: () => void
  onRegenerated: () => Promise<void>
  onRegeneratingChange?: (taskId: string | null) => void
}

export default function ImageDetailModal({ task, jobId, onClose, onRegenerated, onRegeneratingChange }: ImageDetailModalProps) {
  const [prompt, setPrompt] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [versionIndex, setVersionIndex] = useState<number>(-1) // -1 = version actuelle
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Toutes les versions : historique + version actuelle à la fin
  const allVersions = [...(task.versions || []), ...(task.output_path ? [task.output_path] : [])]
  const currentPath = versionIndex === -1
    ? task.output_path
    : allVersions[versionIndex]

  // Reset à la version actuelle quand task change
  useEffect(() => {
    setVersionIndex(-1)
  }, [task.output_path])

  const doRegenerate = async ({ fromSource, withPrompt }: { fromSource: boolean; withPrompt: boolean }) => {
    if (isRegenerating) return
    setIsRegenerating(true)
    onRegeneratingChange?.(task.id)
    try {
      const res = await fetch(`/api/generate/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          customPrompt: withPrompt ? prompt : undefined,
          useSourceImage: fromSource,
          imageOverridePath: fromSource ? undefined : (currentPath || undefined),
        }),
      })
      if (res.ok) {
        setPrompt('')
        setVersionIndex(-1)
        await onRegenerated()
      }
    } finally {
      setIsRegenerating(false)
      onRegeneratingChange?.(null)
    }
  }

  const handleCtrlEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && prompt.trim()) {
      e.preventDefault()
      doRegenerate({ fromSource: false, withPrompt: true })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-[16px] shadow-lg w-full max-w-[900px] mx-4 overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image preview */}
        <div className="relative bg-surface flex items-center justify-center overflow-hidden flex-shrink-0 p-4" style={{ height: '50vh' }}>
          {currentPath ? (
            <motion.img
              key={currentPath}
              initial={{ opacity: 0 }}
              animate={{ opacity: isRegenerating ? 0.2 : 1 }}
              transition={{ duration: 0.3 }}
              src={`/api/serve-image?path=${encodeURIComponent(currentPath)}&v=${currentPath}`}
              alt={`${task.source_image_name} - ${task.country_code}`}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <span className="text-5xl text-text-disabled">🖼️</span>
          )}

          {/* Overlay génération */}
          {isRegenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 rounded-none">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-10 h-10 border-2 border-white border-t-transparent rounded-full"
              />
              <p className="text-sm text-white font-semibold drop-shadow">Génération en cours...</p>
            </div>
          )}
        </div>

        {/* Galerie des versions */}
        {allVersions.length > 1 && !isRegenerating && (
          <div className="flex items-end justify-center gap-2 px-4 py-2 bg-surface border-b border-border overflow-x-auto">
            {allVersions.map((vPath, i) => {
              const isActive = versionIndex === -1 ? i === allVersions.length - 1 : i === versionIndex
              return (
                <button
                  key={vPath}
                  onClick={() => setVersionIndex(i === allVersions.length - 1 ? -1 : i)}
                  className={`shrink-0 rounded-[4px] overflow-hidden border-2 transition-all ${isActive ? 'border-brand-green scale-105' : 'border-transparent opacity-60 hover:opacity-100 hover:border-border'}`}
                >
                  <img
                    src={`/api/serve-image?path=${encodeURIComponent(vPath)}&v=${vPath}`}
                    alt={`v${i + 1}`}
                    className="w-14 h-10 object-cover block"
                  />
                  <span className="block text-center text-[9px] text-text-disabled py-0.5">v{i + 1}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Content — scrollable si besoin */}
        <div className="p-5 overflow-y-auto">
          {/* Metadata */}
          <div className="flex items-center gap-3 mb-4">
            <span className={`fi fi-${task.country_code.toLowerCase()}`} style={{ fontSize: '18px' }} />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {task.country_code} &middot; {task.target_language}
              </p>
            </div>
            {task.status === 'failed' && (
              <span className="ml-auto text-xs bg-brand-red-light text-brand-red px-2 py-0.5 rounded font-semibold">
                Échec
              </span>
            )}
          </div>

          {/* Verification result */}
          {task.verification_status && task.verification_notes && (() => {
            const score = parseInt(task.verification_status) || 0
            let notes: { score?: number; issues?: string[]; summary?: string; extractedText?: Record<string, string> } = {}
            try { notes = JSON.parse(task.verification_notes) } catch {}
            const borderColor = score >= 4 ? 'border-green-200 bg-green-50' : score >= 3 ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
            return (
              <div className={`mb-4 p-3 rounded-[8px] border text-xs ${borderColor}`}>
                <div className="flex items-center gap-3 mb-2">
                  <ScoreBadge score={score} size="md" />
                  <div>
                    <p className="font-semibold text-text-primary text-sm">{notes.summary || 'Vérification effectuée'}</p>
                    {notes.issues && notes.issues.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-text-secondary">
                        {notes.issues.map((issue, i) => <li key={i}>• {issue}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
                {notes.extractedText && Object.keys(notes.extractedText).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-black/10">
                    <p className="text-[10px] font-bold text-text-disabled uppercase mb-1.5">Texte détecté</p>
                    <div className="space-y-1">
                      {Object.entries(notes.extractedText).map(([key, val]) => (
                        <div key={key} className="flex gap-2">
                          <span className="text-text-disabled capitalize w-20 shrink-0">{key.replace(/_/g, ' ')}</span>
                          <span className="text-text-primary font-medium">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Prompt correctif */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleCtrlEnter}
              placeholder="Prompt correctif..."
              rows={2}
              disabled={isRegenerating}
              className="
                w-full px-3 py-2 rounded-[8px] text-sm
                border border-border bg-white
                focus:border-brand-green focus:outline-none
                transition-colors duration-200 resize-none
                disabled:opacity-50
              "
            />
            <span className="absolute bottom-2 right-2 text-[10px] text-text-disabled pointer-events-none select-none">
              Ctrl + ↵
            </span>
          </div>

          <p className="text-[11px] text-amber-500 mt-1 mb-4">
            ⚠ Privilégiez un prompt correctif précis dès la première régénération — chaque itération supplémentaire peut affecter la fidélité du visuel.
          </p>

          {/* Actions */}
          <div className="flex justify-end">
            <button
              onClick={() => doRegenerate({ fromSource: true, withPrompt: false })}
              disabled={isRegenerating}
              className="
                flex items-center gap-2
                px-4 py-2 rounded-[8px] text-sm font-semibold
                border border-border text-text-primary bg-white
                hover:bg-surface transition-colors
                disabled:opacity-50
              "
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
              </svg>
              {isRegenerating ? 'Génération...' : 'Régénérer depuis source FR'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
