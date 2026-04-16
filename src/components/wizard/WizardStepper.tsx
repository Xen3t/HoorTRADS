'use client'

import { motion } from 'framer-motion'

export type StepStatus = 'pending' | 'active' | 'done'

interface Step {
  label: string
  status: StepStatus
}

interface WizardStepperProps {
  steps: Step[]
  onStepClick?: (index: number) => void
}

export default function WizardStepper({ steps, onStepClick }: WizardStepperProps) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          {/* Step circle + label */}
          <button
            onClick={() => step.status === 'done' && onStepClick?.(i)}
            disabled={step.status === 'pending'}
            className={`
              flex items-center gap-2
              ${step.status === 'done' ? 'cursor-pointer' : ''}
              ${step.status === 'pending' ? 'cursor-default' : ''}
            `}
          >
            <motion.div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center
                text-xs font-bold transition-all duration-300
                ${step.status === 'active'
                  ? 'bg-brand-green text-white shadow-[0_0_0_4px_#e8f2dc]'
                  : step.status === 'done'
                    ? 'bg-brand-green text-white'
                    : 'bg-border/50 text-text-disabled/60'
                }
              `}
              animate={step.status === 'active' ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
            >
              {step.status === 'done' ? '✓' : i + 1}
            </motion.div>
            <span
              className={`
                text-xs font-semibold hidden sm:block
                ${step.status === 'active' || step.status === 'done'
                  ? 'text-brand-green'
                  : 'text-text-disabled'
                }
              `}
            >
              {step.label}
            </span>
          </button>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div
              className={`
                w-8 h-0.5 mx-2
                ${step.status === 'done' ? 'bg-brand-green' : 'bg-border'}
              `}
            />
          )}
        </div>
      ))}
    </div>
  )
}
