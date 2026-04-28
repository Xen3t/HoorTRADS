'use client'

import { motion } from 'framer-motion'
import type { GenerationTask } from '@/types/generation'
import ScoreBadge from './ScoreBadge'

interface ImageCardProps {
  task: GenerationTask
  size: 'large' | 'compact'
  onReload: () => void
  isRegenerating?: boolean
  isSelected?: boolean
  onToggleSelect?: (taskId: string) => void
  selectionActive?: boolean
}

const BG_COLORS = [
  'bg-blue-100', 'bg-purple-100', 'bg-pink-100', 'bg-amber-100',
  'bg-emerald-100', 'bg-cyan-100', 'bg-rose-100', 'bg-indigo-100',
]

function getColorForTask(task: GenerationTask): string {
  const hash = (task.source_image_name + task.country_code).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return BG_COLORS[hash % BG_COLORS.length]
}

export default function ImageCard({ task, size, onReload, isRegenerating = false, isSelected = false, onToggleSelect, selectionActive = false }: ImageCardProps) {
  const isFailed = task.status === 'failed'
  const bgColor = getColorForTask(task)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`
        relative group rounded-[8px] overflow-hidden cursor-pointer
        transition-all duration-200 hover:shadow-default
        w-full
        ${isFailed ? 'ring-2 ring-brand-red' : ''}
        ${isSelected ? 'ring-2 ring-brand-teal' : ''}
      `}
    >
      {/* Image */}
      <div className={`relative ${bgColor} w-full`}>
        {task.output_path && task.status === 'done' ? (
          <img
            src={`/api/serve-image?path=${encodeURIComponent(task.output_path)}&v=${task.created_at}`}
            alt={`${task.source_image_name} - ${task.country_code}`}
            loading="lazy"
            className={`w-full h-auto block transition-opacity duration-300 ${isRegenerating ? 'opacity-30' : 'opacity-100'}`}
          />
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: size === 'large' ? '100px' : '70px' }}
          >
            <span className={`text-text-disabled ${size === 'large' ? 'text-2xl' : 'text-lg'}`}>🖼️</span>
          </div>
        )}

        {/* Regenerating overlay */}
        {isRegenerating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 backdrop-blur-[1px]">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 border-2 border-white border-t-transparent rounded-full"
            />
            <span className="text-[10px] font-bold text-white tracking-wide drop-shadow">RÉGÉNÉRATION...</span>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
        <div className="flex items-center gap-1">
          <span className={`fi fi-${task.country_code.toLowerCase()}`} style={{ fontSize: '10px' }} />
          <span className="text-white text-[10px] font-semibold truncate">
            {task.source_image_name}
          </span>
        </div>
      </div>

      {/* Checkbox — top left */}
      {onToggleSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(task.id) }}
          aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
          className={`
            absolute top-1.5 left-1.5
            w-5 h-5 rounded-[4px] border-2 flex items-center justify-center
            transition-all duration-150
            ${isSelected
              ? 'bg-brand-teal border-brand-teal text-white'
              : `border-white/70 bg-black/20 text-transparent ${selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
            }
          `}
          title={isSelected ? 'Désélectionner' : 'Sélectionner'}
        >
          {isSelected && (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2 6 5 9 10 3"/>
            </svg>
          )}
        </button>
      )}

      {/* Score badge */}
      {task.verification_status && (
        <div className="absolute top-1.5 right-8">
          <ScoreBadge score={parseInt(task.verification_status) || 0} size="sm" />
        </div>
      )}

      {/* Failed badge */}
      {isFailed && (
        <div className="absolute top-1.5 right-1.5">
          <span className="bg-brand-red text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
            !
          </span>
        </div>
      )}

      {/* Action icons — bottom right */}
      <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {task.output_path && task.status === 'done' && (
          <a
            href={`/api/serve-image?path=${encodeURIComponent(task.output_path)}&download=1`}
            onClick={(e) => e.stopPropagation()}
            aria-label="Télécharger"
            title="Télécharger cette image"
            className="w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </a>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onReload() }}
          aria-label="Régénérer"
          title="Régénérer depuis source FR"
          className="w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70"
        >
          ⟳
        </button>
      </div>
    </motion.div>
  )
}
