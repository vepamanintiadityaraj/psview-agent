'use client'

import { useState } from 'react'
import AppShell from '@/components/AppShell'
import CompanyForm from '@/components/CompanyForm'
import AgentProfile from '@/components/AgentProfile'
import ConversationSimulator from '@/components/ConversationSimulator'
import ScreenTransition from '@/components/ScreenTransition'
import { AgentConfig, CompanyContext } from '@/types'
import Logo from '@/components/Logo'
import { cn } from '@/lib/utils'

type Step = 'onboard' | 'agent' | 'simulate'

const STEPS: { id: Step; label: string; num: number }[] = [
  { id: 'onboard', label: 'Company', num: 1 },
  { id: 'agent', label: 'Agent', num: 2 },
  { id: 'simulate', label: 'Simulate', num: 3 },
]

export default function Home() {
  const [step, setStep] = useState<Step>('onboard')
  const [companyContext, setCompanyContext] = useState<CompanyContext | null>(null)
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null)

  return (
    <AppShell>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo size="md" />
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Autonomous Recruiting Agent
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {STEPS.map((s) => {
              const isActive = step === s.id
              const isDone =
                (s.id === 'onboard' && (step === 'agent' || step === 'simulate')) ||
                (s.id === 'agent' && step === 'simulate')
              const canNav =
                s.id === 'onboard' ||
                (s.id === 'agent' && companyContext) ||
                (s.id === 'simulate' && agentConfig)

              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!canNav}
                  onClick={() => {
                    if (!canNav) return
                    if (s.id === 'onboard') setStep('onboard')
                    if (s.id === 'agent' && companyContext) setStep('agent')
                    if (s.id === 'simulate' && agentConfig) setStep('simulate')
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                    isActive && 'bg-foreground text-background font-medium',
                    !isActive && isDone && canNav && 'text-foreground hover:bg-muted',
                    !isActive && !isDone && 'text-muted-foreground',
                    !canNav && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span className={cn(
                    'w-5 h-5 rounded-full text-xs flex items-center justify-center border',
                    isActive ? 'border-background/30' : 'border-border',
                  )}>
                    {isDone && !isActive ? '✓' : s.num}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <ScreenTransition stepKey={step}>
          {step === 'onboard' && (
            <CompanyForm
              onComplete={(ctx, config) => {
                setCompanyContext(ctx)
                setAgentConfig(config)
                setStep('agent')
              }}
            />
          )}
          {step === 'agent' && agentConfig && (
            <AgentProfile
              agentConfig={agentConfig}
              onSimulate={() => setStep('simulate')}
              onBack={() => setStep('onboard')}
            />
          )}
          {step === 'simulate' && agentConfig && (
            <ConversationSimulator
              agentConfig={agentConfig}
              onBack={() => setStep('agent')}
            />
          )}
        </ScreenTransition>
      </main>
    </AppShell>
  )
}
