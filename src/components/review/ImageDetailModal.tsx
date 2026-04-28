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
  onNavigate?: (direction: 'prev' | 'next') => void
  hasPrev?: boolean
  hasNext?: boolean
}

export default function ImageDetailModal({ task, jobId, onClose, onRegenerated, onRegeneratingChange, onNavigate, hasPrev, hasNext }: ImageDetailModalProps) {
  const [prompt, setPrompt] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [versionIndex, setVersionIndex] = useState<number>(-1) // -1 = version actuelle
  // sliderPos = position du handle (0 = far left = translated fully visible, 100 = far right = source fully visible)
  const [sliderPos, setSliderPos] = useState(0)
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)
  // Zoom + pan
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const imageAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isDraggingSlider) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      const area = imageAreaRef.current
      if (!area) return
      const rect = area.getBoundingClientRect()
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX
      if (clientX == null) return
      const pct = ((clientX - rect.left) / rect.width) * 100
      setSliderPos(Math.max(0, Math.min(100, pct)))
    }
    const onUp = () => setIsDraggingSlider(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [isDraggingSlider])

  // Reset slider to translated when task changes
  useEffect(() => { setSliderPos(0); setZoom(1); setPan({ x: 0, y: 0 }) }, [task.id])

  // Mouse wheel zoom — zoom toward cursor position
  useEffect(() => {
    const area = imageAreaRef.current
    if (!area) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = area.getBoundingClientRect()
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2
      setZoom((prevZoom) => {
        const delta = -e.deltaY * 0.002
        const next = Math.max(1, Math.min(8, prevZoom * (1 + delta)))
        if (next === 1) {
          setPan({ x: 0, y: 0 })
        } else {
          setPan((prevPan) => {
            const scale = next / prevZoom
            return {
              x: cx - (cx - prevPan.x) * scale,
              y: cy - (cy - prevPan.y) * scale,
            }
          })
        }
        return next
      })
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [])

  // Pan handlers when zoomed
  useEffect(() => {
    if (!isPanning) return
    const onMove = (e: MouseEvent) => {
      setPan({
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
      })
    }
    const onUp = () => setIsPanning(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isPanning])

  const startPan = (e: React.MouseEvent) => {
    if (zoom <= 1) return
    e.preventDefault()
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    setIsPanning(true)
  }

  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // Keyboard navigation with arrow keys (ignored if focus is in the textarea)
  useEffect(() => {
    if (!onNavigate) return
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault()
        onNavigate('prev')
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault()
        onNavigate('next')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNavigate, hasPrev, hasNext])

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
        className="relative w-full max-w-[1280px] mx-4"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white rounded-[16px] shadow-lg overflow-hidden flex flex-col md:flex-row" style={{ maxHeight: '92vh' }}>
        {/* Prev button — slightly overlapping the modal's left edge */}
        {onNavigate && hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate('prev') }}
            aria-label="Image précédente"
            title="Image précédente (←)"
            style={{ left: '-56px' }}
            className="absolute top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center text-text-primary hover:scale-105 transition-all border border-border"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}
        {/* Next button — slightly overlapping the modal's right edge */}
        {onNavigate && hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate('next') }}
            aria-label="Image suivante"
            title="Image suivante (→)"
            style={{ right: '-56px' }}
            className="absolute top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center text-text-primary hover:scale-105 transition-all border border-border"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}

      {/* Left column: image + versions */}
      <div className="flex flex-col md:flex-1 md:min-w-0">
        {/* Image preview */}
        <div
          ref={imageAreaRef}
          onMouseDown={startPan}
          onDoubleClick={resetZoom}
          className={`relative bg-surface flex items-center justify-center overflow-hidden p-4 flex-1 min-h-0 select-none ${zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
          style={{ minHeight: '40vh' }}
        >
          {currentPath ? (
            <div
              className="relative max-w-full max-h-full flex items-center justify-center"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center', transition: isPanning ? 'none' : 'transform 0.1s ease-out' }}
            >
              {/* Source FR — absolute, se cale sur les dimensions de la générée */}
              {task.source_image_path && (
                <motion.img
                  key={`src-${task.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isRegenerating ? 0.2 : 1 }}
                  transition={{ duration: 0.2 }}
                  src={`/api/serve-image?path=${encodeURIComponent(task.source_image_path)}`}
                  alt="Source FR"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={{ zIndex: 0 }}
                  draggable={false}
                />
              )}
              {/* Translated image — en flux (dicte la taille du container), clippée depuis la gauche */}
              <motion.img
                key={currentPath}
                initial={{ opacity: 0 }}
                animate={{ opacity: isRegenerating ? 0.2 : 1 }}
                transition={{ duration: 0.2 }}
                src={`/api/serve-image?path=${encodeURIComponent(currentPath)}&v=${currentPath}`}
                alt={`${task.source_image_name} - ${task.country_code}`}
                className="relative max-w-full max-h-[84vh] object-contain block pointer-events-none"
                style={{ zIndex: 1, ...(task.source_image_path ? { clipPath: `inset(0 0 0 ${sliderPos}%)` } : {}) }}
                draggable={false}
              />
              {/* Slider handle (only if we have source to compare with) */}
              {task.source_image_path && !isRegenerating && (
                <div
                  className="absolute top-0 bottom-0 flex items-center justify-center cursor-ew-resize touch-none"
                  style={{ left: `calc(${sliderPos}% - 2px)`, width: '4px' }}
                  onMouseDown={(e) => { e.preventDefault(); setIsDraggingSlider(true) }}
                  onTouchStart={(e) => { e.preventDefault(); setIsDraggingSlider(true) }}
                >
                  <div className="w-[3px] h-full bg-white shadow-md" />
                  <div className="absolute w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center border border-border">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary">
                      <polyline points="15 18 9 12 15 6"/>
                      <polyline points="9 18 3 12 9 6" style={{ display: 'none' }}/>
                    </svg>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary -ml-1">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <span className="text-5xl text-text-disabled">🖼️</span>
          )}

          {/* Labels : SOURCE apparaît à gauche quand le slider a commencé à découvrir la source */}
          {task.source_image_path && !isRegenerating && sliderPos > 0 && (
            <div className="absolute top-3 left-3 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-full tracking-wide pointer-events-none">
              SOURCE
            </div>
          )}
          {task.source_image_path && !isRegenerating && sliderPos < 100 && (
            <div className="absolute top-3 right-3 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-full tracking-wide pointer-events-none">
              {task.country_code}
            </div>
          )}

          {/* Zoom indicator + reset */}
          {zoom > 1 && !isRegenerating && (
            <button
              onClick={(e) => { e.stopPropagation(); resetZoom() }}
              className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/70 hover:bg-black/85 text-white text-[10px] font-bold tracking-wide pointer-events-auto flex items-center gap-1.5 transition-colors"
              title="Réinitialiser le zoom (double-clic)"
            >
              <span>{Math.round(zoom * 100)}%</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
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
      </div>

        {/* Content — right column on desktop */}
        <div className="p-5 overflow-y-auto md:w-[420px] md:border-l md:border-border md:flex-shrink-0">
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
          <div className="flex flex-col gap-2">
            <button
              onClick={() => doRegenerate({ fromSource: false, withPrompt: true })}
              disabled={isRegenerating || !prompt.trim()}
              title={!prompt.trim() ? 'Saisis un prompt correctif pour activer ce bouton' : 'Appliquer le prompt correctif à l’image actuelle'}
              className="
                flex items-center justify-center gap-2 w-full
                px-4 py-2 rounded-[8px] text-sm font-semibold
                bg-brand-green text-white
                hover:bg-brand-green-hover transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-brand-green
              "
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              {isRegenerating ? 'Génération...' : 'Appliquer le prompt correctif'}
            </button>
            <button
              onClick={() => doRegenerate({ fromSource: true, withPrompt: false })}
              disabled={isRegenerating}
              className="
                flex items-center justify-center gap-2 w-full
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
        </div>
      </motion.div>
    </div>
  )
}
