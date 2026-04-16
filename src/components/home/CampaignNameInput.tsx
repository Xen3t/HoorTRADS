'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

interface CampaignNameInputProps {
  initialName: string
  onNameChange: (name: string) => void
}

export default function CampaignNameInput({ initialName, onNameChange }: CampaignNameInputProps) {
  const [name, setName] = useState(initialName)
  const [isEditing, setIsEditing] = useState(false)

  const handleBlur = () => {
    setIsEditing(false)
    if (name.trim() !== initialName) {
      onNameChange(name.trim())
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center justify-center gap-2"
    >
      {isEditing ? (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
          autoFocus
          className="
            text-xl font-bold text-text-primary text-center
            bg-transparent border-b-2 border-brand-green
            outline-none px-2 py-1
          "
        />
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="
            flex items-center gap-2
            text-xl font-bold text-text-primary
            hover:text-brand-green transition-colors duration-200
            cursor-text
          "
        >
          {name}
          <span className="text-text-disabled text-sm">✏️</span>
        </button>
      )}
    </motion.div>
  )
}
