'use client'

import { useState } from 'react'
import { AgentConfig } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, Play, Brain, Briefcase, Building2, MapPin, Users,
  ChevronDown, ChevronUp, MessageSquare, Shield, Star, CheckCircle, XCircle,
} from 'lucide-react'
import { OUTREACH_MESSAGE_COUNT } from '@/lib/anthropic-models'
import { cn } from '@/lib/utils'

interface Props {
  agentConfig: AgentConfig
  onSimulate: () => void
  onBack: () => void
}

type ProfileTab = 'about' | 'outreach' | 'guidelines'

const MESSAGE_TAGS = [
  { label: 'FIRST TOUCH', cls: 'bg-green-100 text-green-800 border-green-200' },
  { label: 'FOLLOW-UP',   cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  { label: 'QUALIFY',     cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { label: 'VALUE PITCH', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  { label: 'CLOSE',       cls: 'bg-slate-100 text-slate-700 border-slate-200' },
]

const FLUFF = [
  'amazing opportunity', 'rockstar', 'ninja', 'guru', 'superstar',
  'excited to share', 'unique opportunity', 'dream job',
]

function computeQualityScore(
  seq: AgentConfig['messageSequence'],
  ctx: AgentConfig['companyContext'],
  role: string | undefined,
) {
  const bodies = seq.map(m => m.body.toLowerCase())
  const subjects = seq.map(m => m.subject)
  const co = ctx.name.toLowerCase()
  const roleParts = (role ?? '').toLowerCase().split(' ').filter(w => w.length > 3)
  return [
    {
      label: `All messages reference ${ctx.name} by name`,
      pass: bodies.every(b => b.includes(co)),
    },
    {
      label: 'No generic recruiter fluff language',
      pass: bodies.every(b => !FLUFF.some(f => b.includes(f))),
    },
    {
      label: 'Unique subject lines across the sequence',
      pass: new Set(subjects).size === subjects.length,
    },
    {
      label: 'Each message is concise (50–250 words)',
      pass: bodies.every(b => { const w = b.trim().split(/\s+/).length; return w >= 50 && w <= 300 }),
    },
    {
      label: role ? `Sequence is tailored to the ${role} role` : 'Messages are role-specific',
      pass: roleParts.length === 0 || bodies.some(b => roleParts.some(p => b.includes(p))),
    },
  ]
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function AgentProfile({ agentConfig, onSimulate, onBack }: Props) {
  const { personality, messageSequence, companyContext, targetRole } = agentConfig
  const [tab, setTab] = useState<ProfileTab>('about')
  const [showReasoning, setShowReasoning] = useState(false)
  const [expandedMsg, setExpandedMsg] = useState<string | null>(messageSequence[0]?.id ?? null)

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: 'about', label: 'About' },
    { id: 'outreach', label: `Outreach · ${messageSequence.length}` },
    { id: 'guidelines', label: 'Guidelines' },
  ]

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      <div className="bg-white border-b border-border sticky top-14 z-40">
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Button>
          <span className="text-sm text-muted-foreground">Step 2 of 3 · Agent profile</span>
          <Button onClick={onSimulate} size="sm">
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Simulate
          </Button>
        </div>
      </div>

      {agentConfig.warning && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="p-3 rounded-md text-sm text-amber-900 bg-amber-50 border border-amber-200">
            {agentConfig.warning}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* LinkedIn-style profile card */}
        <div className="bg-white rounded-lg border border-border overflow-hidden shadow-sm">
          <div className="h-28 bg-gradient-to-r from-[#0a66c2] to-[#004182]" />

          <div className="px-6 pb-2">
            <div className="-mt-12 mb-3 flex justify-between items-end">
              <div className="w-24 h-24 rounded-full border-4 border-white bg-[#e8e8e8] flex items-center justify-center text-xl font-semibold text-[#666]">
                {initials(personality.name)}
              </div>
              <Button onClick={onSimulate} className="mb-1 bg-[#0a66c2] hover:bg-[#004182]">
                <MessageSquare className="w-4 h-4 mr-2" />
                Message
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1">
              <h1 className="text-2xl font-semibold text-[#191919]">{personality.name}</h1>
              {personality.archetype && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0a66c2] text-white">
                  {personality.archetype}
                </span>
              )}
              {agentConfig.autoRetried && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800">
                  ↻ auto-retried
                </span>
              )}
            </div>
            <p className="text-base text-[#191919] mt-0.5 leading-snug">{personality.role}</p>
            <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {companyContext.name}
              </span>
              {companyContext.industry && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  {companyContext.industry}
                </span>
              )}
              {companyContext.companySize && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {companyContext.companySize}
                </span>
              )}
              {targetRole && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  Hiring: {targetRole}
                </span>
              )}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border-t border-border mt-4 px-6">
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                  tab === t.id
                    ? 'border-[#0a66c2] text-[#0a66c2]'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {tab === 'about' && (
            <>
              <div className="bg-white rounded-lg border border-border p-6 shadow-sm">
                <h2 className="text-lg font-semibold mb-3">About</h2>
                <p className="text-sm text-[#191919] leading-relaxed">{personality.bio}</p>
                <p className="mt-4 text-sm italic text-muted-foreground border-l-2 border-[#0a66c2] pl-3">
                  {personality.signatureTrait}
                </p>
              </div>

              <div className="bg-white rounded-lg border border-border p-6 shadow-sm">
                <h2 className="text-lg font-semibold mb-3">Experience</h2>
                <div className="flex gap-3">
                  <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0 text-sm font-semibold">
                    {companyContext.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{personality.role}</p>
                    <p className="text-sm text-muted-foreground">{companyContext.name} · Full-time</p>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {companyContext.description.slice(0, 280)}
                      {companyContext.description.length > 280 ? '…' : ''}
                    </p>
                    {targetRole && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        Recruiting for {targetRole}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {personality.reasoningTrace && (
                <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowReasoning(!showReasoning)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40"
                  >
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <Brain className="w-4 h-4 text-muted-foreground" />
                      Configuration reasoning
                    </span>
                    {showReasoning ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showReasoning && (
                    <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
                      {personality.reasoningTrace}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'outreach' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground px-1">
                {OUTREACH_MESSAGE_COUNT}-touch sequence — standard for cold outreach over 2–3 weeks
                (intro → follow-up → qualify → nudge → close).
              </p>

              {messageSequence.map((msg, i) => {
                const isExpanded = expandedMsg === msg.id
                return (
                  <div key={msg.id} className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
                    <div className="p-4 flex gap-3">
                      <div className="w-12 h-12 rounded-full bg-[#0a66c2]/10 text-[#0a66c2] flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials(personality.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{personality.name}</span>
                          {MESSAGE_TAGS[i] && (
                            <span className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                              MESSAGE_TAGS[i].cls,
                            )}>
                              {MESSAGE_TAGS[i].label}
                            </span>
                          )}
                          <Badge variant="secondary" className="text-[10px] ml-auto">
                            {msg.intent.split(':')[0].trim()}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{personality.role}</p>
                        <p className="text-sm font-semibold mt-3 text-[#191919]">{msg.subject}</p>
                        <p className={cn(
                          'text-sm text-[#191919] leading-relaxed mt-2 whitespace-pre-wrap',
                          !isExpanded && 'line-clamp-4',
                        )}>
                          {msg.body}
                        </p>
                        <div className="flex items-center gap-3 mt-3">
                          <span className="text-xs text-muted-foreground">{msg.tone}</span>
                          <button
                            type="button"
                            onClick={() => setExpandedMsg(isExpanded ? null : msg.id)}
                            className="text-xs font-semibold text-[#0a66c2] hover:underline"
                          >
                            {isExpanded ? 'Show less' : '…see more'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Quality scoring */}
              {(() => {
                const criteria = (agentConfig.evalCriteria && agentConfig.evalCriteria.length > 0)
                  ? agentConfig.evalCriteria
                  : computeQualityScore(messageSequence, companyContext, targetRole)
                const passed = criteria.filter(c => c.pass).length
                const pct = Math.round((passed / criteria.length) * 100)
                return (
                  <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        Agent Quality
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-green-600">{passed}/{criteria.length}</span>
                        <span className="text-xs text-muted-foreground">— {pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-4">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <ul className="space-y-2">
                      {criteria.map((c, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                          {c.pass
                            ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                            : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          }
                          <span>{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })()}

              <Button onClick={onSimulate} size="lg" className="w-full bg-[#0a66c2] hover:bg-[#004182]">
                <Play className="w-4 h-4 mr-2" />
                Start simulation with message 1
              </Button>
            </div>
          )}

          {tab === 'guidelines' && (
            <div className="bg-white rounded-lg border border-border p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  How I communicate
                </h2>
                <ul className="space-y-2">
                  {personality.communicationRules.map((rule, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-[#0a66c2] font-bold shrink-0">·</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-border pt-6">
                <h3 className="text-sm font-semibold mb-3">Never</h3>
                <ul className="space-y-2">
                  {personality.avoidList.map((rule, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{rule}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
