'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { GenerationTask } from '@/types/generation'

interface TaskWithVersions extends GenerationTask {
  versions?: string[]
}

interface ImageDetailModalProps {
  task: TaskWithVersions
  jobId: string
  onClose: () => void
  onRegenerated: () => Promise<void>
}

export default function ImageDetailModal({ task, jobId, onClose, onRegenerated }: ImageDetailModalProps) {
  const [prompt, setPrompt] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [versionIndex, setVersionIndex] = useState<number>(-1) // -1 = version actuelle

  // Toutes les versions : historique + version actuelle à la fin
  const allVersions = [...(task.versions || []), ...(task.output_path ? [task.output_path] : [])]
  const currentPath = versionIndex === -1
    ? task.output_path
    : allVersions[versionIndex]

  // Reset à la version actuelle quand task change
  useEffect(() => {
    setVersionIndex(-1)
  }, [task.output_path])

  const handleRegenerate = async (withPrompt: boolean) => {
    setIsRegenerating(true)
    try {
      const res = await fetch(`/api/generate/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          customPrompt: withPrompt ? prompt : undefined,
        }),
      })
      if (res.ok) {
        setPrompt('')
        setVersionIndex(-1)
        await onRegenerated()
      }
    } finally {
      setIsRegenerating(false)
    }
  }

  const canGoPrev = allVersions.length > 1 && (versionIndex === -1 ? allVersions.length - 2 >= 0 : versionIndex > 0)
  const canGoNext = versionIndex !== -1 && versionIndex < allVersions.length - 1

  const goPrev = () => {
    if (versionIndex === -1) setVersionIndex(allVersions.length - 2)
    else setVersionIndex(versionIndex - 1)
  }

  const goNext = () => {
    if (versionIndex === allVersions.length - 1) setVersionIndex(-1)
    else setVersionIndex(versionIndex + 1)
  }

  const displayIndex = versionIndex === -1 ? allVersions.length : versionIndex + 1

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
        {/* Image preview — bounded height, never overflows */}
        <div className="relative bg-surface flex items-center justify-center overflow-hidden flex-shrink-0 p-4" style={{ height: '55vh' }}>
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

          {/* Navigation versions */}
          {allVersions.length > 1 && !isRegenerating && (
            <>
              {canGoPrev && (
                <button
                  onClick={(e) => { e.stopPropagation(); goPrev() }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors text-sm"
                >
                  ‹
                </button>
              )}
              {canGoNext && (
                <button
                  onClick={(e) => { e.stopPropagation(); goNext() }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors text-sm"
                >
                  ›
                </button>
              )}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                v{displayIndex} / {allVersions.length}
              </div>
            </>
          )}
        </div>

        {/* Content — scrollable if needed */}
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

          {/* Prompt input */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
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
          <p className="text-[11px] text-text-disabled mt-1">
            Sélectionnez un mot pour l&apos;ajouter au glossaire
          </p>
          <p className="text-[11px] text-amber-500 mt-1 mb-4">
            ⚠ Privilégiez un prompt correctif précis dès la première régénération — chaque itération supplémentaire peut affecter la fidélité du visuel.
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleRegenerate(false)}
              disabled={isRegenerating}
              className="
                px-4 py-2 rounded-[8px] text-sm font-semibold
                border border-border text-text-primary bg-white
                hover:bg-surface transition-colors
                disabled:opacity-50
              "
            >
              {isRegenerating ? '...' : '⟳ Régénérer'}
            </button>
            <button
              onClick={() => {
                if (prompt.trim()) {
                  handleRegenerate(true)
                } else {
                  onClose()
                }
              }}
              disabled={isRegenerating}
              className="
                px-4 py-2 rounded-[8px] text-sm font-semibold
                border border-brand-green text-brand-green bg-white
                hover:bg-brand-green hover:text-white transition-colors
                disabled:opacity-50
              "
            >
              ✓ Valider
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
