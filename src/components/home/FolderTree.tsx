'use client'

import { motion } from 'framer-motion'
import type { SubfolderEntry } from '@/types/folder'

interface FolderTreeProps {
  subfolders: SubfolderEntry[]
  selectedFolders: Set<string>
  onToggleFolder: (folderName: string) => void
}

export default function FolderTree({ subfolders, selectedFolders, onToggleFolder }: FolderTreeProps) {
  if (subfolders.length === 0) return null

  const totalSelected = subfolders
    .filter((f) => selectedFolders.has(f.name))
    .reduce((sum, f) => sum + f.imageCount, 0)

  return (
    <div className="bg-white border border-border rounded-[12px] p-4 text-left">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-text-secondary">Sélectionner les dossiers à traduire</span>
        <span className="text-xs text-text-disabled">{totalSelected} images sélectionnées</span>
      </div>
      <div className="space-y-1">
        {subfolders.map((folder, i) => (
          <motion.button
            key={folder.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            onClick={() => onToggleFolder(folder.name)}
            className={`
              w-full flex items-center gap-3 py-2.5 px-3 rounded-[8px]
              transition-all duration-200 text-left
              ${selectedFolders.has(folder.name)
                ? 'bg-brand-green-light'
                : 'hover:bg-white'
              }
            `}
          >
            <div
              className={`
                w-5 h-5 rounded flex items-center justify-center flex-shrink-0
                transition-all duration-200 text-xs
                ${selectedFolders.has(folder.name)
                  ? 'bg-brand-green text-white'
                  : 'border-2 border-border bg-white'
                }
              `}
            >
              {selectedFolders.has(folder.name) && '✓'}
            </div>
            <span className="text-base">📁</span>
            <span className="font-medium text-sm text-text-primary flex-1">{folder.name}</span>
            <span className="text-xs text-text-disabled">
              {folder.imageCount} image{folder.imageCount !== 1 ? 's' : ''}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
