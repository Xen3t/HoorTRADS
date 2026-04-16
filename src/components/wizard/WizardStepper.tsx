'use client'

export type StepStatus = 'pending' | 'active' | 'done'

interface Step {
  label: string
  status: StepStatus
  href?: string
}

interface WizardStepperProps {
  steps: Step[]
}

export default function WizardStepper({ steps }: WizardStepperProps) {
  return (
    <div className="flex items-center justify-center">
      <div className="flex items-center bg-white rounded-[12px] border border-border shadow-sm p-1.5 gap-1">
        {steps.map((step, i) => {
          const isClickable = step.status === 'done' && step.href
          const Tag = isClickable ? 'a' : 'span'

          return (
            <Tag
              key={step.label}
              {...(isClickable ? { href: step.href } : {})}
              style={step.status === 'done' ? { backgroundColor: 'var(--color-brand-green-light)' } : undefined}
              className={`
                relative flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-semibold
                transition-all duration-200 select-none
                ${step.status === 'active'
                  ? 'bg-brand-green text-white shadow-sm'
                  : step.status === 'done'
                    ? 'text-brand-green cursor-pointer'
                    : 'text-text-disabled cursor-default'
                }
              `}
            >
              {step.status === 'done' ? (
                <span className="w-5 h-5 rounded-full bg-brand-green text-white flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
              ) : (
                <span className={`
                  w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
                  ${step.status === 'active' ? 'bg-white/30 text-white' : 'bg-border text-text-disabled'}
                `}>
                  {i + 1}
                </span>
              )}
              {step.label}
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
