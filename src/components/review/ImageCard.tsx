'use client'

import { motion } from 'framer-motion'
import type { GenerationTask } from '@/types/generation'

interface ImageCardProps {
  task: GenerationTask
  size: 'large' | 'compact'
  onClick: () => void
  onReload: () => void
  isRegenerating?: boolean
}

const BG_COLORS = [
  'bg-blue-100', 'bg-purple-100', 'bg-pink-100', 'bg-amber-100',
  'bg-emerald-100', 'bg-cyan-100', 'bg-rose-100', 'bg-indigo-100',
]

function getColorForTask(task: GenerationTask): string {
  const hash = (task.source_image_name + task.country_code).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return BG_COLORS[hash % BG_COLORS.length]
}

export default function ImageCard({ task, size, onClick, onReload, isRegenerating = false }: ImageCardProps) {
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
        ${isFailed ? 'ring-2 ring-brand-red' : ''}
      `}
      onClick={onClick}
    >
      {/* Image */}
      {/* Container has no fixed height — image dictates its own aspect ratio */}
      <div className={`relative ${bgColor} w-full`}>
        {task.output_path && task.status === 'done' ? (
          <img
            src={`/api/serve-image?path=${encodeURIComponent(task.output_path)}&v=${task.created_at}`}
            alt={`${task.source_image_name} - ${task.country_code}`}
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
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full"
            />
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

      {/* Failed badge */}
      {isFailed && (
        <div className="absolute top-1.5 right-1.5">
          <span className="bg-brand-red text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
            !
          </span>
        </div>
      )}

      {/* Reload icon — bottom right */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onReload()
        }}
        className="
          absolute bottom-1.5 right-1.5
          w-6 h-6 rounded-full
          bg-black/50 text-white text-xs
          flex items-center justify-center
          opacity-0 group-hover:opacity-100
          transition-opacity duration-200
          hover:bg-black/70
        "
        title="Régénérer"
      >
        ⟳
      </button>
    </motion.div>
  )
}
