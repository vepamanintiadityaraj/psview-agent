'use client'

import { useState, useEffect } from 'react'
import { CompanyContext, AgentConfig } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import CompanyDetailsForm from '@/components/CompanyDetailsForm'
import ManualChatForm from '@/components/ManualChatForm'
import {
  EMPTY_CONTEXT, DEMO_COMPANIES, mergeCompanyData, canBuildAgent, suggestLinkedInFromWebsite,
} from '@/lib/company'
import {
  Globe, Loader2, ChevronRight, PenLine, AlertCircle,
} from 'lucide-react'
import { postJsonWithRetry } from '@/lib/fetch-retry'
import { OUTREACH_MESSAGE_COUNT } from '@/lib/anthropic-models'
import { cn } from '@/lib/utils'

type EntryMode = 'url' | 'manual'

const ENTRY_MODES: { id: EntryMode; label: string; icon: typeof Globe; hint: string }[] = [
  { id: 'url',    label: 'Website', icon: Globe,    hint: 'Research from URL' },
  { id: 'manual', label: 'Manual',  icon: PenLine,  hint: 'Enter yourself' },
]

interface Props {
  onComplete: (ctx: CompanyContext, config: AgentConfig) => void
}

function applyApiResponse(data: Record<string, unknown>, source: CompanyContext['source']): Partial<CompanyContext> {
  return {
    name:        (data.name        as string)   || '',
    url:         (data.url         as string)   || '',
    linkedinUrl: (data.linkedinUrl as string)   || '',
    description: (data.description as string)   || '',
    industry:    (data.industry    as string)   || '',
    culture:     (data.culture     as string[]) || [],
    values:      (data.values      as string[]) || [],
    rolesHired:  (data.rolesHired  as string[]) || [],
    tone:        (data.suggestedTone as number) ?? 50,
    mission:     (data.mission     as string)   || '',
    companySize: (data.companySize as string)   || '',
    hiringIntent:(data.hiringIntent as string)  || '',
    source,
  }
}

function buildResearchWarnings(data: Record<string, unknown>): string {
  const needs = (data.needsManualInput as string[] | undefined) ?? []
  const parts: string[] = []
  if (needs.includes('culture')) parts.push('Culture was not found on the website — AI suggestions have been loaded below.')
  if (needs.includes('values'))  parts.push('Values were not found on the website — AI suggestions have been loaded below.')
  if (!(data.rolesHired as string[] | undefined)?.length) parts.push('No open roles found — pick a target role below.')
  return parts.join(' ')
}

export default function CompanyForm({ onComplete }: Props) {
  const [entryMode, setEntryMode] = useState<EntryMode>('url')
  const [showForm, setShowForm] = useState(false)

  const [url, setUrl] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')

  const [loadingCompany, setLoadingCompany] = useState(false)
  const [loadingAgent, setLoadingAgent]   = useState(false)
  const [enriching, setEnriching]         = useState(false)
  const [configStep, setConfigStep] = useState<{ n: number; total: number; label: string } | null>(null)
  const [context, setContext]   = useState<CompanyContext>({ ...EMPTY_CONTEXT })
  const [targetRole, setTargetRole] = useState('')
  const [error, setError]     = useState('')
  const [warning, setWarning] = useState('')
  const [needsManualInput, setNeedsManualInput] = useState<string[]>([])
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const [buildElapsed, setBuildElapsed] = useState(0)

  useEffect(() => {
    if (!loadingAgent) { setBuildElapsed(0); return }
    const start = Date.now()
    const id = setInterval(() => setBuildElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [loadingAgent])

  async function researchCompany(payload: Record<string, unknown>) {
    setLoadingCompany(true)
    setWaitSeconds(null)
    setError('')
    setWarning('')
    setNeedsManualInput([])
    try {
      const data = await postJsonWithRetry<Record<string, unknown>>(
        '/api/scrape-company',
        payload,
        setWaitSeconds,
      )
      const source = (payload.mode as CompanyContext['source']) ?? 'url'
      const apiResult = applyApiResponse(data, source)
      // Preserve the linkedin URL we sent if API doesn't return one
      setContext(prev => mergeCompanyData(prev, {
        ...apiResult,
        linkedinUrl: (apiResult.linkedinUrl as string) || linkedinUrl.trim() || prev.linkedinUrl,
      }))
      setNeedsManualInput((data.needsManualInput as string[]) ?? [])

      const roles = (data.rolesHired as string[] | undefined) ?? []
      if (roles.length && !targetRole) setTargetRole(roles[0])

      const researchWarning = buildResearchWarnings(data)
      if (researchWarning) setWarning(researchWarning)

      setShowForm(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not research company'
      const suffix = /quota/i.test(msg)
        ? ' Fill in the form below and use Build Agent — a template will load if the API is still limited.'
        : ' You can still fill in details manually.'
      setError(`${msg}.${suffix}`)
      setShowForm(true)
      setContext(prev => ({ ...prev, source: entryMode === 'manual' ? 'manual' : prev.source }))
    } finally {
      setLoadingCompany(false)
      setWaitSeconds(null)
    }
  }

  function handleUrlAnalyze() {
    if (!url.trim() || !linkedinUrl.trim()) return
    researchCompany({ mode: 'url', url: url.trim(), linkedinUrl: linkedinUrl.trim() })
  }

  async function enrichManual() {
    setEnriching(true)
    setError('')
    try {
      const res = await fetch('/api/scrape-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'enrich',
          name: context.name,
          description: context.description,
          industry: context.industry,
          culture: context.culture,
          values: context.values,
          url: context.url,
          hiringIntent: context.hiringIntent,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Enrichment failed')
      setContext(prev => mergeCompanyData(prev, applyApiResponse(data, 'manual')))
      if (data.rolesHired?.length && !targetRole) setTargetRole(data.rolesHired[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not suggest fields')
    } finally {
      setEnriching(false)
    }
  }

  async function buildAgent() {
    const check = canBuildAgent(context, targetRole)
    if (!check.ok) { setError(`Missing: ${check.missing.join(', ')}`); return }

    setLoadingAgent(true)
    setConfigStep(null)
    setWaitSeconds(null)
    setError('')
    setWarning('')

    try {
      const res = await fetch('/api/configure-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyContext: context, targetRole, allowFallback: true }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Failed to configure agent')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''
      let agentConfig: (AgentConfig & { warning?: string }) | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const evt of events) {
          const lines = evt.split('\n')
          const eventLine = lines.find(l => l.startsWith('event: '))
          const dataLine  = lines.find(l => l.startsWith('data: '))
          if (!eventLine || !dataLine) continue
          const type = eventLine.slice(7)
          const data = JSON.parse(dataLine.slice(6))
          if (type === 'step') setConfigStep(data)
          if (type === 'done') {
            if (data.warning) setWarning(data.warning)
            agentConfig = { ...data, companyContext: context, targetRole }
          }
          if (type === 'error') throw new Error(data.message)
        }
      }

      if (!agentConfig) throw new Error('No configuration received')
      onComplete(context, agentConfig)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to configure agent. Please try again.'
      setError(
        /quota/i.test(msg)
          ? `${msg} Click "Build Agent" again in a minute, or fill the form and retry.`
          : msg,
      )
    } finally {
      setLoadingAgent(false)
      setConfigStep(null)
      setWaitSeconds(null)
    }
  }

  function loadDemo(demo: (typeof DEMO_COMPANIES)[number]) {
    setUrl(demo.url)
    setLinkedinUrl(demo.linkedin)
    setEntryMode('url')
    setError('')
    researchCompany({ mode: 'url', url: demo.url, linkedinUrl: demo.linkedin })
  }

  function switchMode(mode: EntryMode) {
    setEntryMode(mode)
    setError('')
    setWarning('')
    setShowForm(false)
    setContext({ ...EMPTY_CONTEXT })
    setTargetRole('')
  }

  function handleManualDone(ctx: CompanyContext, role: string) {
    setContext(ctx)
    setTargetRole(role)
    setShowForm(true)
  }

  const buildCheck = canBuildAgent(context, targetRole)

  return (
    <div className="page-container max-w-2xl">
      <div className="mb-10">
        <p className="text-sm text-muted-foreground mb-1">Step 1 of 3</p>
        <h1 className="text-2xl font-semibold mb-2">Company context</h1>
        <p className="text-muted-foreground">
          Tell us about the company — culture, values, and hiring goals. You set the voice; the agent builds its own recruiter persona from that.
        </p>
        <p className="text-sm text-muted-foreground mt-2 panel p-3">
          <strong className="text-foreground">Who shapes the recruiter?</strong> You control tone, culture, values, and hiring intent.
          The agent autonomously chooses its name, bio, and outreach style grounded in your inputs — not a generic template.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-6">
        {ENTRY_MODES.map(({ id, label, icon: Icon, hint }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchMode(id)}
            className={cn(
              'flex flex-col items-start text-left gap-1 p-3 rounded-lg border transition-colors',
              entryMode === id
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card hover:border-foreground/30',
            )}
          >
            <Icon className="w-4 h-4 shrink-0 opacity-70" />
            <span className="text-sm font-medium">{label}</span>
            <span className={cn('text-xs', entryMode === id ? 'text-background/70' : 'text-muted-foreground')}>
              {hint}
            </span>
          </button>
        ))}
      </div>

      {/* URL mode input panel */}
      {entryMode === 'url' && !showForm && (
        <div className="panel p-6 mb-6">
          <label className="text-sm font-medium mb-3 block">Company website</label>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="stripe.com"
              value={url}
              onChange={e => {
                const v = e.target.value
                setUrl(v)
                if (!linkedinUrl.trim()) {
                  const suggested = suggestLinkedInFromWebsite(v)
                  if (suggested) setLinkedinUrl(suggested)
                }
              }}
              onKeyDown={e => e.key === 'Enter' && handleUrlAnalyze()}
            />
            <Button
              onClick={handleUrlAnalyze}
              disabled={!url.trim() || !linkedinUrl.trim() || loadingCompany}
              className="shrink-0"
            >
              {loadingCompany ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Analyze'}
            </Button>
          </div>

          <label className="text-sm font-medium mb-2 block">LinkedIn company page *</label>
          <Input
            placeholder="linkedin.com/company/stripe"
            value={linkedinUrl}
            onChange={e => setLinkedinUrl(e.target.value)}
            className="mb-4"
          />

          {loadingCompany && waitSeconds !== null && (
            <p className="text-sm text-muted-foreground mb-3">Retrying in {waitSeconds}s…</p>
          )}
          <p className="text-sm text-muted-foreground mb-4">
            Website + LinkedIn are both researched for size, culture, and values. If culture or values
            aren&apos;t found on either source, AI suggestions load automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            {DEMO_COMPANIES.map(demo => (
              <Button
                key={demo.url}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadDemo(demo)}
                disabled={loadingCompany}
                title={demo.hint}
              >
                {demo.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Manual mode — chat onboarding */}
      {entryMode === 'manual' && !showForm && (
        <div className="mb-6">
          <ManualChatForm onDone={handleManualDone} />
        </div>
      )}

      {(error || warning) && (
        <div className={cn(
          'panel p-4 mb-6 text-sm flex items-start gap-2',
          error ? 'border-destructive/30 text-destructive' : 'border-amber-300 text-amber-800 bg-amber-50',
        )}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error || warning}</span>
        </div>
      )}

      {showForm && (
        <div className="space-y-6">
          <CompanyDetailsForm
            context={context}
            setContext={setContext}
            targetRole={targetRole}
            setTargetRole={setTargetRole}
            needsManualInput={needsManualInput}
            onEnrich={context.source === 'manual' ? enrichManual : undefined}
            enriching={enriching}
          />

          <Button onClick={buildAgent} disabled={!buildCheck.ok || loadingAgent} size="lg" className="w-full">
            {loadingAgent ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {configStep
                  ? `${configStep.label} (${configStep.n}/${configStep.total})`
                  : `Configuring… ${buildElapsed > 0 ? `(${buildElapsed}s)` : ''}`}
              </>
            ) : (
              <>
                Build agent
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>

          {!loadingAgent && (
            <p className="text-center text-xs text-muted-foreground -mt-4">
              Generate → audit → auto-retry if needed. Usually 25–50s.
            </p>
          )}

          {!buildCheck.ok && (
            <p className="text-center text-sm text-muted-foreground">
              Still needed: {buildCheck.missing.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
