'use client'

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import FolderBrowser from '@/components/home/FolderBrowser'
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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelect = async (path: string) => {
    setShowBrowser(false)
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/scan-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: path }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erreur lors du scan du dossier.')
        return
      }

      if (data.totalImages === 0) {
        setError('Aucune image valide trouvée dans ce dossier (PNG, JPG, WebP).')
        return
      }

      onImagesImported({
        images: data.images,
        rootName: data.rootName,
        rootPath: data.rootPath,
        tree: data.tree,
        totalImages: data.totalImages,
        subfolders: data.subfolders || [],
      })
    } catch {
      setError('Erreur de connexion. Veuillez réessayer.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="text-center">
      <button
        onClick={() => { setError(null); setShowBrowser(true) }}
        disabled={isLoading}
        className="
          w-full bg-brand-green text-white font-bold text-sm
          px-6 py-4 rounded-[12px]
          hover:bg-brand-green-hover hover:shadow-lg
          transition-all duration-200
          flex items-center justify-center gap-3
          disabled:opacity-60
        "
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        {isLoading ? 'Scan en cours...' : 'Sélectionner un dossier sur le serveur'}
      </button>

      {error && (
        <p className="text-xs text-brand-red mt-2">{error}</p>
      )}

      <AnimatePresence>
        {showBrowser && (
          <div className="mt-4 text-left">
            <FolderBrowser
              onSelect={handleSelect}
              onCancel={() => setShowBrowser(false)}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
