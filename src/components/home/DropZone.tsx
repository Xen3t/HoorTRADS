'use client'

import { useState, useCallback, DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { isValidImageFormat } from '@/lib/files/image-validator'
import type { ImportedImage } from '@/types/images'

interface DropZoneProps {
  onImagesImported: (images: ImportedImage[]) => void
}

export default function DropZone({ onImagesImported }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const droppedFiles = Array.from(e.dataTransfer.files)
      const validFiles = droppedFiles.filter((f) => isValidImageFormat(f.name))

      if (validFiles.length === 0) return

      setIsUploading(true)

      try {
        const formData = new FormData()
        validFiles.forEach((file) => formData.append('files', file))

        const response = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await response.json()

        if (response.ok && data.images) {
          onImagesImported(data.images)
        }
      } finally {
        setIsUploading(false)
      }
    },
    [onImagesImported]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      tabIndex={0}
      role="button"
      aria-label="Déposez vos images ici pour les importer"
      className={`
        w-full rounded-[12px] border border-dashed py-6 px-6 text-center
        transition-colors duration-200 cursor-pointer
        ${isDragOver ? 'border-brand-green bg-brand-green-light' : 'border-border bg-surface'}
        ${isUploading ? 'opacity-60 pointer-events-none' : ''}
      `}
    >
      <AnimatePresence mode="wait">
        {isUploading ? (
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-text-secondary text-sm">Envoi des images...</p>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-4xl opacity-20 mb-3">🖼️</div>
            <p className="text-text-secondary">Glissez vos images ici</p>
            <p className="text-text-disabled text-xs mt-1">PNG, JPG, WebP</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
