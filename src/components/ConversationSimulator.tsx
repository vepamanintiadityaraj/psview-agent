'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { AgentConfig, CandidatePersona, ConversationMessage } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import CompanyContextCard from '@/components/CompanyContextCard'
import {
  MAX_ATTEMPTS, waitBeforeRetry, isRetryableResponse, RetryableError, isRetryableError,
} from '@/lib/fetch-retry'
import {
  ArrowLeft, Brain, Send, User, Bot, ChevronDown, ChevronUp,
  Loader2, RotateCcw, MessageSquare, Mail, FileText, UserCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function BriefRenderer({ text }: { text: string }) {
  const sections = text.trim().split(/\n{2,}/)
  return (
    <div className="space-y-2.5">
      {sections.map((section, i) => {
        const lines = section.split('\n').filter(Boolean)
        return (
          <div key={i}>
            {lines.map((line, j) => {
              // **Header:** → bold label
              const headerMatch = line.match(/^\*\*(.+?)\*\*:?\s*(.*)$/)
              if (headerMatch) {
                return (
                  <p key={j} className={cn('font-semibold text-foreground break-words', j > 0 && 'mt-1')}>
                    {headerMatch[1]}{headerMatch[2] ? ': ' : ''}<span className="font-normal text-foreground/80">{headerMatch[2]}</span>
                  </p>
                )
              }
              // Bullet: "- " or "• "
              if (/^[-•]\s/.test(line)) {
                return (
                  <p key={j} className="pl-3 text-foreground/80 break-words relative before:absolute before:left-0.5 before:content-['·']">
                    {line.replace(/^[-•]\s/, '')}
                  </p>
                )
              }
              // Quoted opener line
              if (line.startsWith('"') || line.startsWith('“')) {
                return (
                  <p key={j} className="italic text-foreground/80 break-words border-l-2 border-border pl-2 ml-1">
                    {line}
                  </p>
                )
              }
              return <p key={j} className="text-foreground/80 break-words">{line}</p>
            })}
          </div>
        )
      })}
    </div>
  )
}

const OUTREACH_TAGS = [
  { label: 'FIRST TOUCH', cls: 'bg-green-100 text-green-800 border-green-200' },
  { label: 'FOLLOW-UP',   cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  { label: 'QUALIFY',     cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { label: 'VALUE PITCH', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  { label: 'CLOSE',       cls: 'bg-slate-100 text-slate-700 border-slate-200' },
]

const STRATEGY_LABELS: Record<string, string> = {
  opening:    'Standard mode',
  engaging:   'Discovery mode',
  qualifying: 'Deep qualify mode',
  closing:    'Closing mode',
}

function WarmthChart({ history }: { history: number[] }) {
  if (history.length < 2) return null
  const W = 100
  const H = 36
  const pts = history.map((v, i) => ({
    x: (i / (history.length - 1)) * W,
    y: H - (v / 100) * H,
    v,
  }))
  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">Warmth over time</span>
        <span className="text-[10px] text-muted-foreground">{history.length} turns</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 36 }} preserveAspectRatio="none">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" strokeDasharray="3,3" />
        <polyline points={polyline} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 2.5 : 1.5}
            fill={p.v >= 67 ? '#22c55e' : p.v >= 34 ? '#f59e0b' : '#ef4444'} />
        ))}
      </svg>
    </div>
  )
}

function CandidateMemoryPanel({
  warmth, objectionCount, keyConcern, stage, escalationMode, warmthHistory,
}: {
  warmth: number
  objectionCount: number
  keyConcern: string
  stage: string
  escalationMode: boolean
  warmthHistory: number[]
}) {
  const barColor = warmth >= 67 ? 'bg-green-400' : warmth >= 34 ? 'bg-amber-400' : 'bg-red-400'
  const strategyLabel = escalationMode ? 'Escalation mode' : (STRATEGY_LABELS[stage] ?? 'Standard mode')
  return (
    <div className="panel p-4 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Candidate Memory
      </h3>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Warmth</span>
          <span className="text-xs font-semibold">{warmth}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', barColor)}
            style={{ width: `${warmth}%` }}
          />
        </div>
        <WarmthChart history={warmthHistory} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Objections</span>
        <span className="text-xs font-medium">{objectionCount === 0 ? 'None yet' : objectionCount}</span>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Key concern</p>
        <p className="text-xs italic text-foreground/70">{keyConcern || 'not yet identified'}</p>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground">Strategy mode</span>
        <span className={cn('text-xs font-medium', escalationMode && 'text-red-600')}>
          {strategyLabel}
        </span>
      </div>
    </div>
  )
}

interface Props {
  agentConfig: AgentConfig
  onBack: () => void
}

type ViewTab = 'chat' | 'outreach'

const STAGE_LABELS: Record<string, string> = {
  opening: 'Opening',
  engaging: 'Engaging',
  qualifying: 'Qualifying',
  closing: 'Closing',
}

const QUICK_REPLIES: { text: string; unexpected?: boolean }[] = [
  { text: "I'm interested, tell me more" },
  { text: "I'm not looking right now" },
  { text: "What's the salary range?" },
  { text: "Can we schedule a call?" },
  { text: "This doesn't sound like a fit" },
  { text: "What does the team look like?" },
  { text: 'Who is this? How did you get my email?', unexpected: true },
  { text: 'Please remove me from your list', unexpected: true },
]

function initialMessages(agentConfig: AgentConfig): ConversationMessage[] {
  const opening = agentConfig.messageSequence[0]
  if (!opening?.body) {
    return [{
      role: 'agent',
      content: `Hi — I'm ${agentConfig.personality.name} from ${agentConfig.companyContext.name}. I'd love to tell you about an opportunity we're hiring for.`,
      timestamp: Date.now(),
    }]
  }
  return [{ role: 'agent', content: opening.body, timestamp: Date.now() }]
}

async function consumeConversationStream(
  res: Response,
  onDelta: (delta: string) => void,
  onThinking?: (delta: string) => void,
) {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response stream')

  const decoder = new TextDecoder()
  let buffer = ''
  let result = {
    reply: '',
    reasoning: '',
    sentiment: 'neutral',
    stage: 'engaging',
    signalDetected: '',
    candidateRead: '',
    nextStrategy: '',
    riskFlags: '',
    responseCategory: 'expected',
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const event of events) {
      const lines = event.split('\n')
      const eventLine = lines.find(l => l.startsWith('event: '))
      const dataLine = lines.find(l => l.startsWith('data: '))
      if (!eventLine || !dataLine) continue

      const type = eventLine.slice(7)
      const data = JSON.parse(dataLine.slice(6))

      if (type === 'thinking') onThinking?.(data.delta)
      if (type === 'delta') onDelta(data.delta)
      if (type === 'done') result = { ...result, ...data }
      if (type === 'error') {
        if (data.retryable) throw new RetryableError(data.message)
        throw new Error(data.message)
      }
    }
  }

  return result
}

export default function ConversationSimulator({ agentConfig, onBack }: Props) {
  const { personality, messageSequence, companyContext } = agentConfig

  const [view, setView] = useState<ViewTab>('chat')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingIdx, setStreamingIdx] = useState<number | null>(null)
  const [sentiment, setSentiment] = useState<ConversationMessage['sentiment']>('neutral')
  const [stage, setStage] = useState('opening')
  const [expandedReasoning, setExpandedReasoning] = useState<number | null>(null)
  const [lastSignal, setLastSignal] = useState('')
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const [warmth, setWarmth] = useState(50)
  const [warmthHistory, setWarmthHistory] = useState<number[]>([50])
  const [objectionCount, setObjectionCount] = useState(0)
  const [keyConcern, setKeyConcern] = useState('')
  const [consecutiveNegatives, setConsecutiveNegatives] = useState(0)
  const [escalationMode, setEscalationMode] = useState(false)
  // Live reasoning stream
  const [liveThinking, setLiveThinking] = useState('')
  const [isThinkingPhase, setIsThinkingPhase] = useState(false)
  // Candidate persona
  const [persona, setPersona] = useState<CandidatePersona | null>(null)
  const [generatingPersona, setGeneratingPersona] = useState(false)
  const [showPersonaForm, setShowPersonaForm] = useState(false)
  const [personaForm, setPersonaForm] = useState({
    name: '', currentRole: '', currentCompany: '', background: '',
    tone: 'direct' as CandidatePersona['tone'], concerns: '',
  })
  // Handoff brief
  const [handoffBrief, setHandoffBrief] = useState<string | null>(null)
  const [generatingBrief, setGeneratingBrief] = useState(false)
  // Reply tone (0 = formal, 100 = casual)
  const [replyTone, setReplyTone] = useState(50)

  const bottomRef = useRef<HTMLDivElement>(null)

  const resetConversation = useCallback(() => {
    setMessages(persona ? initialMessages(agentConfig) : [])
    setSentiment('neutral')
    setStage('opening')
    setLastSignal('')
    setExpandedReasoning(null)
    setInput('')
    setWarmth(50)
    setWarmthHistory([50])
    setObjectionCount(0)
    setKeyConcern('')
    setConsecutiveNegatives(0)
    setEscalationMode(false)
    setLiveThinking('')
    setIsThinkingPhase(false)
    setHandoffBrief(null)
  }, [agentConfig])

  // Start the conversation with the opening message once a candidate is set
  useEffect(() => {
    if (persona && messages.length === 0) {
      setMessages(initialMessages(agentConfig))
    }
  }, [persona, agentConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingIdx])

  const generatePersona = useCallback(async () => {
    setGeneratingPersona(true)
    try {
      const res = await fetch('/api/generate-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole: agentConfig.targetRole, companyContext }),
      })
      if (res.ok) setPersona(await res.json())
    } catch { /* ignore */ } finally {
      setGeneratingPersona(false)
    }
  }, [agentConfig.targetRole, companyContext])

  const generateBrief = useCallback(async () => {
    setGeneratingBrief(true)
    try {
      const res = await fetch('/api/handoff-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: messages,
          personality,
          companyContext,
          targetRole: agentConfig.targetRole,
          candidatePersona: persona,
        }),
      })
      if (res.ok) {
        const { brief } = await res.json()
        setHandoffBrief(brief)
      }
    } catch { /* ignore */ } finally {
      setGeneratingBrief(false)
    }
  }, [messages, personality, companyContext, agentConfig.targetRole, persona])

  async function sendReply(text: string) {
    if (!text.trim() || loading) return

    const candidateMsg: ConversationMessage = {
      role: 'candidate',
      content: text.trim(),
      timestamp: Date.now(),
    }
    const updatedHistory = [...messages, candidateMsg]
    setMessages(updatedHistory)
    setInput('')
    setLoading(true)
    setWaitSeconds(null)
    setIsThinkingPhase(true)
    setLiveThinking('')

    const agentPlaceholder: ConversationMessage = {
      role: 'agent',
      content: '',
      reasoning: '',
      timestamp: Date.now(),
    }
    const agentIdx = updatedHistory.length
    setMessages([...updatedHistory, agentPlaceholder])
    setStreamingIdx(agentIdx)

    const payload = {
      personality,
      companyContext,
      conversationHistory: updatedHistory,
      candidatePersona: persona ?? undefined,
      replyTone,
    }

    try {
      let data: Awaited<ReturnType<typeof consumeConversationStream>> | null = null
      let seenFirstDelta = false

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          if (attempt > 1) {
            seenFirstDelta = false
            setIsThinkingPhase(true)
            setLiveThinking('')
            setMessages(prev => {
              const next = [...prev]
              next[agentIdx] = { role: 'agent', content: '', reasoning: '', timestamp: Date.now() }
              return next
            })
          }

          const res = await fetch('/api/conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Request failed' }))
            if (isRetryableResponse(res.status, err) && attempt < MAX_ATTEMPTS) {
              await waitBeforeRetry(setWaitSeconds)
              continue
            }
            throw new Error(err.error)
          }

          data = await consumeConversationStream(
            res,
            (delta) => {
              if (!seenFirstDelta) {
                seenFirstDelta = true
                setIsThinkingPhase(false)
              }
              setMessages(prev => {
                const next = [...prev]
                const msg = next[agentIdx]
                if (msg?.role === 'agent') {
                  next[agentIdx] = { ...msg, content: msg.content + delta }
                }
                return next
              })
            },
            (thinkingDelta) => {
              setLiveThinking(prev => prev + thinkingDelta)
            },
          )
          break
        } catch (e) {
          if (isRetryableError(e) && attempt < MAX_ATTEMPTS) {
            await waitBeforeRetry(setWaitSeconds)
            continue
          }
          throw e
        }
      }

      if (!data) throw new Error('Failed to generate reply')

      setMessages(prev => {
        const next = [...prev]
        next[agentIdx] = {
          role: 'agent',
          content: data!.reply || next[agentIdx]?.content || '',
          reasoning: data!.reasoning,
          sentiment: data!.sentiment as ConversationMessage['sentiment'],
          candidateRead: data!.candidateRead,
          nextStrategy: data!.nextStrategy,
          riskFlags: data!.riskFlags,
          responseCategory: data!.responseCategory as ConversationMessage['responseCategory'],
          timestamp: Date.now(),
        }
        return next
      })
      setSentiment(data.sentiment as ConversationMessage['sentiment'])
      setStage(data.stage)
      setLastSignal(data.signalDetected || '')
      setWarmth(prev => {
        const next = data!.sentiment === 'warm' || data!.sentiment === 'interested' ? Math.min(95, prev + 15)
          : data!.sentiment === 'cold' || data!.sentiment === 'disengaged' ? Math.max(5, prev - 20)
          : data!.responseCategory === 'hostile' ? Math.max(5, prev - 30)
          : prev
        setWarmthHistory(h => [...h, next])
        return next
      })
      if (
        data.sentiment === 'cold' ||
        data.responseCategory === 'hostile' ||
        data.responseCategory === 'unexpected'
      ) {
        setObjectionCount(prev => prev + 1)
      }
      if (data.candidateRead) setKeyConcern(data.candidateRead)

      const isNegative = data.sentiment === 'cold' || data.responseCategory === 'hostile'
      setConsecutiveNegatives(prev => {
        const next = isNegative ? prev + 1 : 0
        if (next >= 2) setEscalationMode(true)
        else if (!isNegative && data!.sentiment === 'warm') setEscalationMode(false)
        return next
      })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to generate reply'
      setMessages(prev => {
        const next = [...prev]
        next[agentIdx] = {
          role: 'agent',
          content: `__error__${errMsg}`,
          timestamp: Date.now(),
        }
        return next
      })
    } finally {
      setLoading(false)
      setStreamingIdx(null)
      setWaitSeconds(null)
      setIsThinkingPhase(false)
    }
  }

  const avatarSrc = personality.gender === 'female' ? '/avatars/female.png' : '/avatars/male.png'
  const [avatarError, setAvatarError] = useState(false)

  const isStreaming = streamingIdx !== null
  const agentMessageCount = messages.filter(m => m.role === 'agent' && !m.content.startsWith('__error__')).length
  const showBriefButton = agentMessageCount >= 2

  return (
    <div className="page-container max-w-6xl flex flex-col min-h-[calc(100vh-4rem)]">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground mb-1">Step 3 of 3</p>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Simulation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              You are the candidate. Nothing is sent externally.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-sm">
          <Bot className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">{personality.name}</span>
          <span className="text-muted-foreground">· {companyContext.name}</span>
        </div>
        {sentiment && (
          <Badge variant="outline" className="capitalize">{sentiment}</Badge>
        )}
        <Badge variant="secondary">{STAGE_LABELS[stage] || stage}</Badge>
        {lastSignal && (
          <span className="text-xs text-muted-foreground hidden md:inline truncate max-w-xs">
            Signal: {lastSignal}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={view === 'chat' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('chat')}
          >
            Chat
          </Button>
          <Button
            variant={view === 'outreach' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('outreach')}
          >
            Outreach ({messageSequence.length})
          </Button>
          <Button variant="outline" size="icon-sm" onClick={resetConversation} disabled={loading}>
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        <div className="panel flex-1 min-w-0 flex flex-col min-h-[500px]">
          {view === 'outreach' ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Messages the agent would send over time.
              </p>
              {messageSequence.map((msg, i) => (
                <div key={msg.id ?? i} className="border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Message {i + 1}</span>
                    {OUTREACH_TAGS[i] && (
                      <span className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                        OUTREACH_TAGS[i].cls,
                      )}>
                        {OUTREACH_TAGS[i].label}
                      </span>
                    )}
                    <Badge variant="outline" className="ml-auto text-xs">{msg.intent}</Badge>
                  </div>
                  <p className="font-medium mb-2">{msg.subject}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                </div>
              ))}
              <Button onClick={() => setView('chat')} className="w-full">
                <MessageSquare className="w-4 h-4 mr-2" />
                Start chat
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-16">
                    <UserCircle className="w-10 h-10 text-muted-foreground/40" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Set up a candidate first</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Generate or create a candidate profile to start the simulation.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={generatePersona} disabled={generatingPersona}>
                        {generatingPersona ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : null}
                        {generatingPersona ? 'Generating...' : 'Generate random'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowPersonaForm(true)}>
                        Enter details
                      </Button>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={cn('flex gap-3', msg.role === 'candidate' && 'flex-row-reverse')}>
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 overflow-hidden',
                      msg.role === 'agent' ? 'bg-muted' : 'bg-foreground text-background',
                    )}>
                      {msg.role === 'agent'
                        ? (!avatarError
                            ? <img src={avatarSrc} alt={personality.name} onError={() => setAvatarError(true)} className="w-full h-full object-cover object-top" />
                            : <Bot className="w-4 h-4 text-muted-foreground" />)
                        : <User className="w-4 h-4" />}
                    </div>

                    <div className={cn('max-w-[75%] space-y-1', msg.role === 'candidate' && 'items-end flex flex-col')}>
                      <p className="text-xs text-muted-foreground">
                        {msg.role === 'agent' ? personality.name : (persona?.name || 'You')}
                      </p>

                      {/* Live thinking panel — visible while agent is reasoning before first word */}
                      {isStreaming && streamingIdx === i && isThinkingPhase && liveThinking && (
                        <div className="rounded-lg border border-border bg-muted/40 p-3 mb-1 max-w-full">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Brain className="w-3 h-3 text-muted-foreground animate-pulse" />
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Thinking...</span>
                          </div>
                          <p className="text-[11px] font-mono text-muted-foreground leading-relaxed break-words">
                            {liveThinking.length > 380 ? '…' + liveThinking.slice(-380) : liveThinking}
                          </p>
                        </div>
                      )}

                      {msg.role === 'agent' && msg.content.startsWith('__error__') ? (
                        <div className="rounded-lg px-4 py-3 text-sm border border-destructive/40 bg-destructive/5 text-destructive space-y-2">
                          <p>{msg.content.slice(9) || 'Something went wrong.'}</p>
                          <button
                            type="button"
                            onClick={() => {
                              const lastCandidate = [...messages].reverse().find(m => m.role === 'candidate')
                              if (lastCandidate) sendReply(lastCandidate.content)
                            }}
                            className="text-xs underline underline-offset-2 hover:opacity-80"
                          >
                            Retry
                          </button>
                        </div>
                      ) : (
                        // Hide the empty bubble during thinking phase so only the thinking panel shows
                        (!isThinkingPhase || msg.content || !(isStreaming && streamingIdx === i)) && (
                          <div className={cn(
                            'rounded-lg px-4 py-3 text-sm leading-relaxed',
                            msg.role === 'agent' ? 'bg-muted' : 'bg-foreground text-background',
                          )}>
                            <p className="whitespace-pre-wrap">
                              {msg.content}
                              {isStreaming && streamingIdx === i && !isThinkingPhase && (
                                <span className="inline-block w-0.5 h-4 ml-0.5 bg-current animate-pulse align-middle" />
                              )}
                            </p>
                          </div>
                        )
                      )}

                      {msg.role === 'agent' && msg.responseCategory && msg.responseCategory !== 'expected' && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {msg.responseCategory} response
                        </Badge>
                      )}

                      {msg.role === 'agent' && (msg.reasoning || msg.candidateRead) && !isStreaming && (
                        <div className="w-full">
                          <button
                            type="button"
                            onClick={() => setExpandedReasoning(expandedReasoning === i ? null : i)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
                          >
                            <Brain className="w-3 h-3" />
                            {expandedReasoning === i ? 'Hide reasoning' : 'Show reasoning'}
                            {expandedReasoning === i ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                          {expandedReasoning === i && (
                            <div className="mt-2 p-3 rounded-lg border border-border bg-card text-sm space-y-3">
                              {msg.candidateRead && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Candidate read</p>
                                  <p className="text-muted-foreground leading-relaxed">{msg.candidateRead}</p>
                                </div>
                              )}
                              {msg.nextStrategy && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Next strategy</p>
                                  <p className="text-muted-foreground leading-relaxed">{msg.nextStrategy}</p>
                                </div>
                              )}
                              {msg.riskFlags && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Avoided</p>
                                  <p className="text-muted-foreground leading-relaxed">{msg.riskFlags}</p>
                                </div>
                              )}
                              {msg.reasoning && (
                                <div className="border-t border-border pt-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Thinking</p>
                                  <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                                    {msg.reasoning}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && waitSeconds !== null && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Retrying in {waitSeconds}s…
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border p-4 space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quick replies</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_REPLIES.map(({ text, unexpected }) => (
                      <Button
                        key={text}
                        variant="outline"
                        size="sm"
                        onClick={() => sendReply(text)}
                        disabled={loading}
                        className={cn(
                          'text-xs h-auto py-1.5',
                          unexpected && 'border-amber-200 text-amber-800 hover:bg-amber-50',
                        )}
                      >
                        {text}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type your reply as the candidate…"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendReply(input)
                      }
                    }}
                    rows={2}
                    className="resize-none"
                  />
                  <Button
                    onClick={() => sendReply(input)}
                    disabled={!input.trim() || loading}
                    size="icon"
                    className="shrink-0 self-end h-[72px] w-12"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="w-full lg:w-72 shrink-0 space-y-4">
          {/* Candidate persona */}
          <div className="panel p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <UserCircle className="w-3.5 h-3.5" />
                Candidate
              </h3>
              {persona && !showPersonaForm && (
                <div className="flex gap-1">
                  <button type="button" onClick={() => { setPersona(null); setShowPersonaForm(false) }}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* No persona yet — show two options */}
            {!persona && !showPersonaForm && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground italic leading-relaxed mb-3">
                  Add a candidate profile to make the roleplay more realistic.
                </p>
                <Button size="sm" variant="outline" onClick={generatePersona} disabled={generatingPersona} className="w-full h-7 text-xs">
                  {generatingPersona ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : null}
                  {generatingPersona ? 'Generating…' : 'Generate random'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowPersonaForm(true)} className="w-full h-7 text-xs">
                  Enter details
                </Button>
              </div>
            )}

            {/* Manual persona form */}
            {!persona && showPersonaForm && (
              <div className="space-y-2">
                <input
                  className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  placeholder="Name (e.g. Sarah Chen)"
                  value={personaForm.name}
                  onChange={e => setPersonaForm(f => ({ ...f, name: e.target.value }))}
                />
                <input
                  className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  placeholder="Current role (e.g. Senior SWE)"
                  value={personaForm.currentRole}
                  onChange={e => setPersonaForm(f => ({ ...f, currentRole: e.target.value }))}
                />
                <input
                  className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  placeholder="Current company (e.g. Stripe)"
                  value={personaForm.currentCompany}
                  onChange={e => setPersonaForm(f => ({ ...f, currentCompany: e.target.value }))}
                />
                <textarea
                  className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  placeholder="Background (optional)"
                  rows={2}
                  value={personaForm.background}
                  onChange={e => setPersonaForm(f => ({ ...f, background: e.target.value }))}
                />
                <input
                  className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  placeholder="Concerns, comma-separated (optional)"
                  value={personaForm.concerns}
                  onChange={e => setPersonaForm(f => ({ ...f, concerns: e.target.value }))}
                />
                <select
                  className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  value={personaForm.tone}
                  onChange={e => setPersonaForm(f => ({ ...f, tone: e.target.value as CandidatePersona['tone'] }))}
                >
                  {(['direct', 'skeptical', 'friendly', 'busy', 'curious'] as const).map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
                <div className="flex gap-1.5 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setShowPersonaForm(false)} className="flex-1 h-6 text-[11px]">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setPersona({
                        name: personaForm.name || 'Alex',
                        currentRole: personaForm.currentRole || 'Software Engineer',
                        currentCompany: personaForm.currentCompany || 'Current company',
                        background: personaForm.background || `${personaForm.name || 'Alex'} is a ${personaForm.currentRole || 'Software Engineer'}.`,
                        tone: personaForm.tone,
                        likelyConcerns: personaForm.concerns.split(',').map(s => s.trim()).filter(Boolean),
                      })
                      setShowPersonaForm(false)
                    }}
                    className="flex-1 h-6 text-[11px]"
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}

            {/* Persona display */}
            {persona && (
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">{persona.name}</p>
                  <p className="text-xs text-muted-foreground">{persona.currentRole} at {persona.currentCompany}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{persona.background}</p>
                {persona.likelyConcerns.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Concerns</p>
                    <ul className="space-y-1">
                      {persona.likelyConcerns.map((c, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground leading-snug flex gap-1.5">
                          <span className="shrink-0 mt-0.5 text-muted-foreground/50">·</span>
                          <span className="break-words min-w-0">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">Tone</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{persona.tone}</Badge>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={generatePersona} disabled={generatingPersona}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50">
                    {generatingPersona ? 'Regenerating…' : 'Regenerate'}
                  </button>
                  <button type="button" onClick={() => { setPersona(null); setShowPersonaForm(true) }}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reply tone slider */}
          <div className="panel p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Reply Tone
            </h3>
            <input
              type="range"
              min={0}
              max={100}
              value={replyTone}
              onChange={e => setReplyTone(Number(e.target.value))}
              className="w-full accent-foreground"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">Formal</span>
              <span className="text-[10px] font-medium text-foreground">
                {replyTone < 20 ? 'Very formal' : replyTone < 40 ? 'Formal' : replyTone < 60 ? 'Balanced' : replyTone < 80 ? 'Casual' : 'Very casual'}
              </span>
              <span className="text-[10px] text-muted-foreground">Casual</span>
            </div>
          </div>

          <CandidateMemoryPanel
            warmth={warmth}
            objectionCount={objectionCount}
            keyConcern={keyConcern}
            stage={stage}
            escalationMode={escalationMode}
            warmthHistory={warmthHistory}
          />

          {/* Handoff brief — appears after 2 agent replies */}
          {showBriefButton && (
            <div className="panel p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Handoff Brief
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generateBrief}
                  disabled={generatingBrief}
                  className="h-6 text-[11px] px-2"
                >
                  {generatingBrief
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : handoffBrief ? 'Refresh' : 'Generate'}
                </Button>
              </div>
              {handoffBrief ? (
                <div className="text-xs leading-relaxed max-h-72 overflow-y-auto overflow-x-hidden">
                  <BriefRenderer text={handoffBrief} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic leading-relaxed">
                  Generate a structured brief for your discovery call.
                </p>
              )}
            </div>
          )}

          <CompanyContextCard config={agentConfig} />
        </aside>
      </div>
    </div>
  )
}
