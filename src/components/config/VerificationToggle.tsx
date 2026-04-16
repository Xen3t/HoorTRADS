'use client'

import { motion } from 'framer-motion'

interface VerificationToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

export default function VerificationToggle({ enabled, onChange }: VerificationToggleProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3"
    >
      <button
        onClick={() => onChange(!enabled)}
        className={`
          relative w-10 h-[22px] rounded-full transition-colors duration-200
          ${enabled ? 'bg-brand-green' : 'bg-border'}
        `}
        role="switch"
        aria-checked={enabled}
        aria-label="Vérification des traductions"
      >
        <motion.div
          className="absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm"
          animate={{ left: enabled ? '20px' : '2px' }}
          transition={{ duration: 0.2 }}
        />
      </button>
      <span className="text-sm font-medium text-text-secondary">Vérification des traductions</span>
    </motion.div>
  )
}
