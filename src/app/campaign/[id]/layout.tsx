'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import WizardStepper from '@/components/wizard/WizardStepper'
import type { StepStatus } from '@/components/wizard/WizardStepper'

const STEP_CONFIG_DEFAULT = [
  { label: 'Configuration', path: 'configure' },
  { label: 'Traductions', path: 'translations' },
  { label: 'Visuels', path: 'review' },
  { label: 'Export', path: 'export' },
]

const STEP_CONFIG_PRE_RENDER = [
  { label: 'Configuration', path: 'configure' },
  { label: 'Traductions', path: 'text-review' },
  { label: 'Visuels', path: 'review' },
  { label: 'Export', path: 'export' },
]

// Map session current_step values to step paths
const SESSION_STEP_TO_PATH: Record<string, string> = {
  configure: 'configure',
  generating: 'configure',
  generate: 'configure',
  'text-review': 'text-review',
  translations: 'translations',
  review: 'review',
  reviewing: 'review',
  export: 'export',
  exported: 'export',
}

function getSessionId(pathname: string): string {
  return pathname.split('/')[2] || ''
}

function computeStatuses(
  urlSegment: string,
  furthestPath: string,
  steps: typeof STEP_CONFIG_DEFAULT
): StepStatus[] {
  const activeIndex = steps.findIndex((s) => s.path === urlSegment)
  const furthestIndex = steps.findIndex((s) => s.path === furthestPath)

  return steps.map((_, i) => {
    if (i === activeIndex) return 'active'
    if (i <= furthestIndex) return 'done'   // <=  inclut le furthest lui-même
    return 'pending'
  })
}

export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isRenderingPhase = searchParams.get('rendering') === '1'
  const sessionId = getSessionId(pathname)
  const urlSegment = pathname.split('/').pop() || ''

  // Furthest step reached — fetched from session
  const [furthestPath, setFurthestPath] = useState(urlSegment)
  const [sessionIsPreRender, setSessionIsPreRender] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        const currentStep: string = data.session?.current_step || ''
        const mapped = SESSION_STEP_TO_PATH[currentStep] || currentStep
        setFurthestPath(mapped)
        // If the session is waiting for text review, force pre-render layout
        if (currentStep === 'text-review') setSessionIsPreRender(true)
      })
      .catch((e) => console.error('[layout]', e))
  }, [sessionId])

  const isPreRenderFlow = pathname.includes('text-review') || sessionIsPreRender
  const stepConfig = isPreRenderFlow ? STEP_CONFIG_PRE_RENDER : STEP_CONFIG_DEFAULT

  const activeStepConfig = stepConfig

  // Pendant la génération : Traductions si phase 1, Visuels si phase NB2 (rendering=1)
  const effectiveSegment = urlSegment === 'generate'
    ? (isRenderingPhase ? 'review' : 'translations')
    : urlSegment
  const statuses = computeStatuses(effectiveSegment, furthestPath, activeStepConfig)

  const steps = activeStepConfig.map((step, i) => ({
    label: step.label,
    status: statuses[i] as StepStatus,
    href: statuses[i] === 'done' && step.path
      ? `/campaign/${sessionId}/${step.path}`
      : undefined,
  }))

  return (
    <div className="min-h-screen pt-8">
      <div className="max-w-[700px] mx-auto px-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => { window.location.href = '/' }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-border bg-white hover:bg-surface text-text-secondary hover:text-text-primary transition-colors shrink-0"
            title="Accueil"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span className="text-xs font-semibold">Accueil</span>
          </button>
          <div className="flex-1">
            <WizardStepper steps={steps} />
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
