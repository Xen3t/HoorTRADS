'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'

type ToastVariant = 'success' | 'error' | 'info'

interface NotificationToastProps {
  message: string
  variant?: ToastVariant
  onDismiss: () => void
  autoDismissMs?: number
}

const variantStyles: Record<ToastVariant, string> = {
  success: 'bg-brand-green text-white',
  error: 'bg-brand-red text-white',
  info: 'bg-brand-teal text-white',
}

export default function NotificationToast({
  message,
  variant = 'info',
  onDismiss,
  autoDismissMs = 4000,
}: NotificationToastProps) {
  useEffect(() => {
    if (variant !== 'error') {
      const timer = setTimeout(onDismiss, autoDismissMs)
      return () => clearTimeout(timer)
    }
  }, [onDismiss, autoDismissMs, variant])

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, y: 0 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`
        fixed top-6 right-6 z-50
        px-5 py-3 rounded-[12px] shadow-lg
        flex items-center gap-3
        text-sm font-semibold
        ${variantStyles[variant]}
      `}
    >
      <span>{message}</span>
      <button onClick={onDismiss} className="opacity-70 hover:opacity-100 transition-opacity">
        &times;
      </button>
    </motion.div>
  )
}
