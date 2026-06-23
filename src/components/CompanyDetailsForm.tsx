'use client'

import { CompanyContext } from '@/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  CULTURE_SUGGESTIONS, VALUE_SUGGESTIONS, ROLE_SUGGESTIONS,
  COMPANY_SIZE_OPTIONS, TONE_LABELS, toneLabel,
} from '@/lib/company'
import { Building2, Plus, X, Target, Sparkles, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const SOURCE_LABELS: Record<string, string> = {
  url: 'From website',
  name: 'From search',
  describe: 'From pasted text',
  manual: 'Manual entry',
}

function TagButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
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
    <div className="flex items-start gap-2 p-3 mb-4 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-900">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}

export default function CompanyDetailsForm({
  context,
  setContext,
  targetRole,
  setTargetRole,
  needsManualInput = [],
  onEnrich,
  enriching,
}: Props) {
  const [customCulture, setCustomCulture] = useState('')
  const [customValue, setCustomValue] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [customHiredRole, setCustomHiredRole] = useState('')

  function toggleCulture(tag: string) {
    setContext(c => ({
      ...c,
      culture: c.culture.includes(tag) ? c.culture.filter(x => x !== tag) : [...c.culture, tag],
    }))
  }

  function toggleValue(tag: string) {
    setContext(c => ({
      ...c,
      values: c.values.includes(tag) ? c.values.filter(x => x !== tag) : [...c.values, tag],
    }))
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
  const hiredRoleOptions = [...new Set([...ROLE_SUGGESTIONS, ...context.rolesHired])]
  const needsCulture = needsManualInput.includes('culture') && context.culture.length === 0
  const needsValues = needsManualInput.includes('values') && context.values.length === 0

  return (
    <div className="space-y-6">
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
            <Input
              value={context.name}
              onChange={e => setContext(c => ({ ...c, name: e.target.value }))}
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Industry *</label>
            <Input
              value={context.industry}
              onChange={e => setContext(c => ({ ...c, industry: e.target.value }))}
              placeholder="e.g. HR Tech"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Website</label>
            <Input
              value={context.url}
              onChange={e => setContext(c => ({ ...c, url: e.target.value }))}
              placeholder="https://company.com"
            />
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

        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Company size</label>
          {context.companySize && (
            <p className="text-xs text-muted-foreground mb-2">
              From research: {context.companySize}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {COMPANY_SIZE_OPTIONS.map(size => (
              <TagButton
                key={size}
                active={context.companySize === size}
                onClick={() => setContext(c => ({ ...c, companySize: c.companySize === size ? '' : size }))}
              >
                {size}
              </TagButton>
            ))}
          </div>
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEnrich}
            disabled={enriching || !context.name || !context.description}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {enriching ? 'Suggesting…' : 'AI suggest missing fields'}
          </Button>
        )}
      </div>

      <div className="panel p-6">
        <label className="text-sm font-medium mb-1 block">Culture *</label>
        <p className="text-sm text-muted-foreground mb-3">How it feels to work there</p>
        {needsCulture && (
          <ManualEntryBanner>
            Not found on the company website — add culture traits manually.
          </ManualEntryBanner>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          {CULTURE_SUGGESTIONS.map(tag => (
            <TagButton key={tag} active={context.culture.includes(tag)} onClick={() => toggleCulture(tag)}>
              {tag}
            </TagButton>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add custom trait…"
            value={customCulture}
            onChange={e => setCustomCulture(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && customCulture.trim()) {
                setContext(c => ({ ...c, culture: [...c.culture, customCulture.trim()] }))
                setCustomCulture('')
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (customCulture.trim()) {
                setContext(c => ({ ...c, culture: [...c.culture, customCulture.trim()] }))
                setCustomCulture('')
              }
            }}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        {context.culture.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {context.culture.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button type="button" onClick={() => toggleCulture(tag)} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="panel p-6">
        <label className="text-sm font-medium mb-1 block">Values *</label>
        <p className="text-sm text-muted-foreground mb-3">What the company stands for</p>
        {needsValues && (
          <ManualEntryBanner>
            Not found on the company website — add company values manually.
          </ManualEntryBanner>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          {VALUE_SUGGESTIONS.map(tag => (
            <TagButton key={tag} active={context.values.includes(tag)} onClick={() => toggleValue(tag)}>
              {tag}
            </TagButton>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add custom value…"
            value={customValue}
            onChange={e => setCustomValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && customValue.trim()) {
                setContext(c => ({ ...c, values: [...c.values, customValue.trim()] }))
                setCustomValue('')
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (customValue.trim()) {
                setContext(c => ({ ...c, values: [...c.values, customValue.trim()] }))
                setCustomValue('')
              }
            }}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        {context.values.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {context.values.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button type="button" onClick={() => toggleValue(tag)} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="panel p-6">
        <div className="flex items-center justify-between mb-4">
          <label className="text-sm font-medium">Communication tone</label>
          <Badge variant="secondary">{TONE_LABELS[toneIndex]}</Badge>
        </div>
        <Slider
          value={[context.tone]}
          onValueChange={(val) => setContext(c => ({ ...c, tone: Array.isArray(val) ? val[0] : val }))}
          min={0}
          max={100}
          step={5}
          className="mb-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Formal</span>
          <span>{toneLabel(context.tone)}</span>
          <span>Casual</span>
        </div>
      </div>

      <div className="panel p-6 space-y-6">
        <div>
          <label className="text-sm font-medium mb-1 block">Roles they hire</label>
          <p className="text-sm text-muted-foreground mb-3">
            Optional context — roles seen on their careers page. Select all that apply.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {hiredRoleOptions.map(role => (
              <TagButton
                key={role}
                active={context.rolesHired.includes(role)}
                onClick={() => toggleHiredRole(role)}
              >
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (customHiredRole.trim()) {
                  toggleHiredRole(customHiredRole.trim())
                  setCustomHiredRole('')
                }
              }}
            >
              <Plus className="w-3 h-3" />
            </Button>
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
                if (e.key === 'Enter' && customRole.trim()) {
                  setTargetRole(customRole.trim())
                  setCustomRole('')
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (customRole.trim()) {
                  setTargetRole(customRole.trim())
                  setCustomRole('')
                }
              }}
            >
              Set
            </Button>
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
