'use client'

import { usePathname } from 'next/navigation'
import WizardStepper from '@/components/wizard/WizardStepper'
import type { StepStatus } from '@/components/wizard/WizardStepper'

const STEP_CONFIG = [
  { label: 'Import', path: '' },
  { label: 'Configuration', path: 'configure' },
  { label: 'Génération', path: 'generate' },
  { label: 'Vérification', path: 'review' },
  { label: 'Export', path: 'export' },
]

function getStepStatuses(currentPath: string): StepStatus[] {
  const currentSegment = currentPath.split('/').pop() || ''
  const currentIndex = STEP_CONFIG.findIndex((s) => s.path === currentSegment)

  return STEP_CONFIG.map((_, i) => {
    if (i < currentIndex) return 'done'
    if (i === currentIndex) return 'active'
    return 'pending'
  })
}

export default function CampaignLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const statuses = getStepStatuses(pathname)

  const steps = STEP_CONFIG.map((step, i) => ({
    label: step.label,
    status: statuses[i],
  }))

  return (
    <div className="min-h-screen pt-4">
      <div className="max-w-[700px] mx-auto px-8">
        <button
          onClick={() => { window.location.href = '/' }}
          className="text-xs text-text-disabled hover:text-text-secondary transition-colors mb-3 block"
        >
          ← Retour à l&apos;accueil
        </button>
        <WizardStepper steps={steps} />
      </div>
      {children}
    </div>
  )
}
