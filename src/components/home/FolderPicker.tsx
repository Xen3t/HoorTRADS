'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import FolderBrowser from './FolderBrowser'
import type { ImportedImage } from '@/types/images'
import type { FolderNode, SubfolderEntry } from '@/types/folder'

interface ScanResponse {
  images: ImportedImage[]
  rootName: string
  rootPath: string
  tree: FolderNode
  totalImages: number
  subfolders: SubfolderEntry[]
}

interface FolderPickerProps {
  onImagesImported: (data: ScanResponse) => void
}

export default function FolderPicker({ onImagesImported }: FolderPickerProps) {
  const [showBrowser, setShowBrowser] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scanFolder = async (folderPath: string) => {
    setIsScanning(true)
    setError(null)

    try {
      const response = await fetch('/api/scan-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Échec du scan du dossier')
        return
      }

      if (data.warning) {
        setError(data.warning)
        return
      }

      if (data.images) {
        onImagesImported(data)
        setShowBrowser(false)
      }
    } catch {
      setError('Erreur de connexion. Veuillez réessayer.')
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="text-center"
    >
      {!showBrowser ? (
        <button
          onClick={() => setShowBrowser(true)}
          className="
            w-full bg-brand-green text-white font-bold text-sm
            px-6 py-4 rounded-[12px]
            hover:bg-brand-green-hover hover:shadow-lg
            transition-all duration-200
            flex items-center justify-center gap-3
          "
        >
          <span className="text-lg">📁</span>
          Sélectionner un dossier sur le serveur
        </button>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {isScanning ? (
              <div className="py-8 text-text-secondary text-sm">Scan en cours...</div>
            ) : (
              <FolderBrowser
                onSelect={(path) => scanFolder(path)}
                onCancel={() => {
                  setShowBrowser(false)
                  setError(null)
                }}
              />
            )}
            {error && (
              <p className="text-xs text-brand-red mt-2">{error}</p>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  )
}
