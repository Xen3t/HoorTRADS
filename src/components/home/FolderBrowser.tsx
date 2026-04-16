'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface FolderEntry {
  name: string
  path: string
  isDirectory: boolean
}

interface FolderBrowserProps {
  onSelect: (path: string) => void
  onCancel: () => void
}

export default function FolderBrowser({ onSelect, onCancel }: FolderBrowserProps) {
  const [entries, setEntries] = useState<FolderEntry[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [manualPath, setManualPath] = useState('')

  const browse = async (folderPath?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const url = folderPath
        ? `/api/browse-folder?path=${encodeURIComponent(folderPath)}`
        : '/api/browse-folder'
      const res = await fetch(url)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Échec de la navigation')
        return
      }

      setEntries(data.entries || [])
      setCurrentPath(data.currentPath || '')
      setParentPath(data.parentPath || null)
      setManualPath(data.currentPath || '')
    } catch {
      setError('Erreur de connexion')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    browse()
  }, [])

  const handleNavigate = (path: string) => {
    browse(path)
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualPath.trim()) browse(manualPath.trim())
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="bg-white rounded-[16px] shadow-lg border border-border overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <span className="text-sm font-semibold text-text-primary">Parcourir les dossiers</span>
        <button
          onClick={onCancel}
          className="text-text-disabled hover:text-text-primary transition-colors text-lg"
        >
          &times;
        </button>
      </div>

      {/* Path input */}
      <form onSubmit={handleManualSubmit} className="flex gap-2 px-4 py-3 border-b border-border">
        <input
          type="text"
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
          placeholder="Saisir un chemin..."
          className="
            flex-1 px-3 py-2 rounded-[8px] text-xs
            border border-border bg-white text-text-primary
            focus:border-brand-green focus:outline-none
          "
        />
        <button
          type="submit"
          className="px-3 py-2 text-xs font-semibold text-white bg-brand-teal rounded-[8px] hover:bg-brand-teal-hover transition-colors"
        >
          Go
        </button>
      </form>

      {/* Folder list */}
      <div className="max-h-[300px] overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-6 text-center text-text-disabled text-sm">Chargement...</div>
        ) : error ? (
          <div className="px-4 py-4 text-center text-brand-red text-sm">{error}</div>
        ) : (
          <div className="py-1">
            {/* Back button */}
            {parentPath && (
              <button
                onClick={() => handleNavigate(parentPath)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-surface transition-colors text-left"
              >
                <span>⬆️</span>
                <span>..</span>
              </button>
            )}

            {/* Folders */}
            {entries.map((entry, i) => (
              <motion.button
                key={entry.path}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, delay: i * 0.02 }}
                onClick={() => handleNavigate(entry.path)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface transition-colors text-left"
              >
                <span>📁</span>
                <span className="truncate">{entry.name}</span>
              </motion.button>
            ))}

            {entries.length === 0 && !parentPath && (
              <div className="px-4 py-4 text-center text-text-disabled text-sm">Aucun dossier trouvé</div>
            )}
          </div>
        )}
      </div>

      {/* Footer — Select button */}
      {currentPath && (
        <div className="px-4 py-3 border-t border-border bg-surface">
          <div className="text-xs text-text-disabled truncate mb-2">{currentPath}</div>
          <button
            onClick={() => onSelect(currentPath)}
            className="
              w-full py-2.5 rounded-[8px]
              bg-brand-green text-white font-semibold text-sm
              hover:bg-brand-green-hover transition-colors
            "
          >
            Sélectionner ce dossier
          </button>
        </div>
      )}
    </motion.div>
  )
}
