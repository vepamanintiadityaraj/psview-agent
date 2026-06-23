'use client'

import { CompanyContext } from '@/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  CULTURE_SUGGESTIONS, VALUE_SUGGESTIONS, ROLE_SUGGESTIONS,
  TONE_LABELS, toneLabel, urgencyLabel,
} from '@/lib/company'
import { Building2, Plus, X, Target, Sparkles, AlertCircle, Loader2 } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const SOURCE_LABELS: Record<string, string> = {
  url: 'From website',
  name: 'From search',
  describe: 'From pasted text',
  manual: 'Manual entry',
}

function TagButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
        active
          ? 'bg-foreground text-background border-foreground'
          : 'bg-card text-muted-foreground border-border hover:border-foreground/30',
      )}
    >
      {children}
    </button>
  )
}

interface Props {
  context: CompanyContext
  setContext: React.Dispatch<React.SetStateAction<CompanyContext>>
  targetRole: string
  setTargetRole: (role: string) => void
  needsManualInput?: string[]
  onEnrich?: () => void
  enriching?: boolean
}

function ManualEntryBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 mb-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-900">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}

type ChipDef = { label: string; kind: 'culture' | 'values'; ai: boolean }

export default function CompanyDetailsForm({
  context,
  setContext,
  targetRole,
  setTargetRole,
  needsManualInput = [],
  onEnrich,
  enriching,
}: Props) {
  const [customTag, setCustomTag] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [customHiredRole, setCustomHiredRole] = useState('')

  // AI suggestions for missing culture/values
  const [aiSuggestions, setAiSuggestions] = useState<{ culture: string[]; values: string[] } | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!fetchedRef.current && needsManualInput.length > 0 && context.description.trim()) {
      fetchedRef.current = true
      fetchSuggestions()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchSuggestions() {
    setLoadingSuggestions(true)
    try {
      const res = await fetch('/api/suggest-culture-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyContext: context }),
      })
      if (res.ok) setAiSuggestions(await res.json())
    } catch { /* ignore */ } finally {
      setLoadingSuggestions(false)
    }
  }

  // Build unified chip list: AI suggestions first (✦), then static pool
  const aiChips: ChipDef[] = [
    ...(aiSuggestions?.culture ?? []).map(l => ({ label: l, kind: 'culture' as const, ai: true })),
    ...(aiSuggestions?.values ?? []).map(l => ({ label: l, kind: 'values' as const, ai: true })),
  ]
  const aiLabels = new Set(aiChips.map(c => c.label.toLowerCase()))
  const staticChips: ChipDef[] = [
    ...CULTURE_SUGGESTIONS.map(l => ({ label: l, kind: 'culture' as const, ai: false })),
    ...VALUE_SUGGESTIONS.map(l => ({ label: l, kind: 'values' as const, ai: false })),
  ].filter(c => !aiLabels.has(c.label.toLowerCase()))
  const allChips = [...aiChips, ...staticChips]

  function isChipActive(chip: ChipDef): boolean {
    return chip.kind === 'culture'
      ? context.culture.includes(chip.label)
      : context.values.includes(chip.label)
  }

  function toggleChip(chip: ChipDef) {
    if (chip.kind === 'culture') {
      setContext(c => ({
        ...c,
        culture: c.culture.includes(chip.label) ? c.culture.filter(x => x !== chip.label) : [...c.culture, chip.label],
      }))
    } else {
      setContext(c => ({
        ...c,
        values: c.values.includes(chip.label) ? c.values.filter(x => x !== chip.label) : [...c.values, chip.label],
      }))
    }
  }

  function removeSelected(label: string) {
    setContext(c => ({
      ...c,
      culture: c.culture.filter(x => x !== label),
      values: c.values.filter(x => x !== label),
    }))
  }

  function addCustomTag(val: string) {
    const v = val.trim()
    if (!v) return
    // Add custom entries to culture by default
    setContext(c => ({
      ...c,
      culture: c.culture.includes(v) ? c.culture : [...c.culture, v],
    }))
    setCustomTag('')
  }

  function toggleHiredRole(role: string) {
    setContext(c => ({
      ...c,
      rolesHired: c.rolesHired.includes(role)
        ? c.rolesHired.filter(r => r !== role)
        : [...c.rolesHired, role],
    }))
  }

  const toneIndex = Math.min(4, Math.floor(context.tone / 20))
  const urgency = context.urgency ?? 50
  const hiredRoleOptions = [...new Set([...ROLE_SUGGESTIONS, ...context.rolesHired])]
  const needsCulture = needsManualInput.includes('culture') && context.culture.length === 0
  const needsValues  = needsManualInput.includes('values')  && context.values.length === 0
  const selectedTags = [
    ...context.culture.map(l => ({ label: l, kind: 'culture' as const })),
    ...context.values.filter(v => !context.culture.includes(v)).map(l => ({ label: l, kind: 'values' as const })),
  ]

  return (
    <div className="space-y-6">
      {/* Company profile */}
      <div className="panel p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Company profile</span>
          {context.source && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {SOURCE_LABELS[context.source] ?? context.source}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Name *</label>
            <Input value={context.name} onChange={e => setContext(c => ({ ...c, name: e.target.value }))} placeholder="Acme Corp" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Industry *</label>
            <Input value={context.industry} onChange={e => setContext(c => ({ ...c, industry: e.target.value }))} placeholder="e.g. HR Tech" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Website</label>
            <Input value={context.url} onChange={e => setContext(c => ({ ...c, url: e.target.value }))} placeholder="https://company.com" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">LinkedIn *</label>
            <Input
              value={context.linkedinUrl ?? ''}
              onChange={e => setContext(c => ({ ...c, linkedinUrl: e.target.value }))}
              placeholder="linkedin.com/company/..."
            />
          </div>
        </div>

        {/* Company size */}
        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Company size</label>
          {context.companySize ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{context.companySize}</Badge>
              <button
                type="button"
                onClick={() => setContext(c => ({ ...c, companySize: '' }))}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(['1–10', '11–50', '51–200', '201–1000', '1000+'] as const).map(size => (
                <TagButton
                  key={size}
                  active={context.companySize === size}
                  onClick={() => setContext(c => ({ ...c, companySize: c.companySize === size ? '' : size }))}
                >
                  {size}
                </TagButton>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Description *</label>
          <Textarea
            value={context.description}
            onChange={e => setContext(c => ({ ...c, description: e.target.value }))}
            placeholder="Products, customers, market position…"
            className="resize-none"
            rows={3}
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Mission</label>
          <Textarea
            value={context.mission ?? ''}
            onChange={e => setContext(c => ({ ...c, mission: e.target.value }))}
            placeholder="Why does this company exist?"
            className="resize-none"
            rows={2}
          />
        </div>

        {onEnrich && (
          <Button type="button" variant="outline" size="sm" onClick={onEnrich} disabled={enriching || !context.name || !context.description}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {enriching ? 'Suggesting…' : 'AI suggest missing fields'}
          </Button>
        )}
      </div>

      {/* Culture & Values — unified chip panel */}
      <div className="panel p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium block">Culture &amp; Values</label>
            <p className="text-sm text-muted-foreground mt-0.5">How it feels to work there and what the company stands for</p>
          </div>
          {(needsCulture || needsValues) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {loadingSuggestions
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Loading AI suggestions…</>
                : aiSuggestions
                  ? <span className="text-green-700">AI suggestions loaded</span>
                  : <button type="button" onClick={fetchSuggestions} className="underline underline-offset-2 hover:text-foreground">Get AI suggestions</button>
              }
            </div>
          )}
        </div>

        {(needsCulture || needsValues) && (
          <ManualEntryBanner>Not found on the website — pick from the suggestions below or add your own.</ManualEntryBanner>
        )}

        {selectedTags.length === 0 && !needsCulture && !needsValues && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Select at least one culture trait or value to continue.
          </p>
        )}

        {/* Unified chip pool: AI suggestions first (✦), then static */}
        <div className="flex flex-wrap gap-2">
          {allChips.map(chip => (
            <TagButton key={`${chip.kind}-${chip.label}`} active={isChipActive(chip)} onClick={() => toggleChip(chip)}>
              {chip.ai && <span className="text-amber-500 mr-0.5">✦</span>}
              {chip.label}
            </TagButton>
          ))}
        </div>

        {/* Custom input */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a trait or value…"
            value={customTag}
            onChange={e => setCustomTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCustomTag(customTag) }}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => addCustomTag(customTag)}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>

        {/* Selected chips */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {selectedTags.map(({ label }) => (
              <Badge key={label} variant="secondary" className="gap-1 pr-1 whitespace-normal break-words max-w-full">
                {label}
                <button type="button" onClick={() => removeSelected(label)} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tone & Urgency */}
      <div className="panel p-6 space-y-6">
        {/* Communication tone */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-medium">Communication tone</label>
            <Badge variant="secondary">{TONE_LABELS[toneIndex]}</Badge>
          </div>
          <Slider
            value={[context.tone]}
            onValueChange={(val) => setContext(c => ({ ...c, tone: Array.isArray(val) ? val[0] : val }))}
            min={0} max={100} step={5}
            className="mb-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Very Formal</span>
            <span>Very Casual</span>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          {/* Hiring urgency */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <label className="text-sm font-medium block">Hiring urgency</label>
              <p className="text-xs text-muted-foreground mt-0.5">Controls how urgently the recruiter frames outreach</p>
            </div>
            <Badge
              variant="secondary"
              className={cn(
                urgency < 34 ? 'bg-blue-50 text-blue-700 border-blue-200' :
                urgency < 67 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                               'bg-red-50 text-red-700 border-red-200',
              )}
            >
              {urgencyLabel(urgency)}
            </Badge>
          </div>
          <Slider
            value={[urgency]}
            onValueChange={(val) => setContext(c => ({ ...c, urgency: Array.isArray(val) ? val[0] : val }))}
            min={0} max={100} step={5}
            className="mb-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Low — no pressure</span>
            <span>High — tight timeline</span>
          </div>
        </div>
      </div>

      {/* Roles */}
      <div className="panel p-6 space-y-6">
        <div>
          <label className="text-sm font-medium mb-1 block">Roles they hire</label>
          <p className="text-sm text-muted-foreground mb-3">Optional context — roles seen on their careers page.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {hiredRoleOptions.map(role => (
              <TagButton key={role} active={context.rolesHired.includes(role)} onClick={() => toggleHiredRole(role)}>
                {role}
              </TagButton>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add role from careers page…"
              value={customHiredRole}
              onChange={e => setCustomHiredRole(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customHiredRole.trim()) {
                  toggleHiredRole(customHiredRole.trim())
                  setCustomHiredRole('')
                }
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => {
              if (customHiredRole.trim()) { toggleHiredRole(customHiredRole.trim()); setCustomHiredRole('') }
            }}><Plus className="w-3 h-3" /></Button>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <label className="text-sm font-medium mb-1 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Target role for this agent *
          </label>
          <p className="text-sm text-muted-foreground mb-3">
            One role per simulation — the agent configures outreach and chat for this specific hire.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {hiredRoleOptions.map(role => (
              <TagButton key={`target-${role}`} active={targetRole === role} onClick={() => setTargetRole(role)}>
                {role}
              </TagButton>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Custom target role…"
              value={customRole}
              onChange={e => setCustomRole(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customRole.trim()) { setTargetRole(customRole.trim()); setCustomRole('') }
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => {
              if (customRole.trim()) { setTargetRole(customRole.trim()); setCustomRole('') }
            }}>Set</Button>
          </div>

          <label className="text-sm text-muted-foreground mb-1.5 block">Hiring intent (optional)</label>
          <Textarea
            value={context.hiringIntent ?? ''}
            onChange={e => setContext(c => ({ ...c, hiringIntent: e.target.value }))}
            placeholder="What makes an ideal candidate?"
            className="resize-none"
            rows={2}
          />
        </div>
      </div>
    </div>
  )
}
