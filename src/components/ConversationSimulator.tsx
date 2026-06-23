'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { AgentConfig, ConversationMessage } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import CompanyContextCard from '@/components/CompanyContextCard'
import {
  MAX_ATTEMPTS, waitBeforeRetry, isRetryableResponse, RetryableError, isRetryableError,
} from '@/lib/fetch-retry'
import {
  ArrowLeft, Brain, Send, User, Bot, ChevronDown, ChevronUp,
  Loader2, RotateCcw, MessageSquare, Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

const QUICK_REPLIES = [
  "I'm interested, tell me more",
  "I'm not looking right now",
  "What's the salary range?",
  "Can we schedule a call?",
  "This doesn't sound like a fit",
  "What does the team look like?",
]

const UNEXPECTED_REPLIES = [
  'Who is this? How did you get my email?',
  'Please remove me from your list',
  "Wrong person — I don't work there anymore",
  'asdfghjkl random keyboard mash',
  "Stop messaging me, I'm on vacation",
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
  const [messages, setMessages] = useState<ConversationMessage[]>(() => initialMessages(agentConfig))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingIdx, setStreamingIdx] = useState<number | null>(null)
  const [sentiment, setSentiment] = useState<ConversationMessage['sentiment']>('neutral')
  const [stage, setStage] = useState('opening')
  const [expandedReasoning, setExpandedReasoning] = useState<number | null>(null)
  const [lastSignal, setLastSignal] = useState('')
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const resetConversation = useCallback(() => {
    setMessages(initialMessages(agentConfig))
    setSentiment('neutral')
    setStage('opening')
    setLastSignal('')
    setExpandedReasoning(null)
    setInput('')
  }, [agentConfig])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingIdx])

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

    const agentPlaceholder: ConversationMessage = {
      role: 'agent',
      content: '',
      reasoning: '',
      timestamp: Date.now(),
    }
    const agentIdx = updatedHistory.length
    setMessages([...updatedHistory, agentPlaceholder])
    setStreamingIdx(agentIdx)

    const payload = { personality, companyContext, conversationHistory: updatedHistory }

    try {
      let data: Awaited<ReturnType<typeof consumeConversationStream>> | null = null

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          if (attempt > 1) {
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

          data = await consumeConversationStream(res, (delta) => {
            setMessages(prev => {
              const next = [...prev]
              const msg = next[agentIdx]
              if (msg?.role === 'agent') {
                next[agentIdx] = { ...msg, content: msg.content + delta }
              }
              return next
            })
          })
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
          content: data.reply || next[agentIdx]?.content || '',
          reasoning: data.reasoning,
          sentiment: data.sentiment as ConversationMessage['sentiment'],
          candidateRead: data.candidateRead,
          nextStrategy: data.nextStrategy,
          riskFlags: data.riskFlags,
          responseCategory: data.responseCategory as ConversationMessage['responseCategory'],
          timestamp: Date.now(),
        }
        return next
      })
      setSentiment(data.sentiment as ConversationMessage['sentiment'])
      setStage(data.stage)
      setLastSignal(data.signalDetected || '')
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
    }
  }

  const isStreaming = streamingIdx !== null

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
                {messages.map((msg, i) => (
                  <div key={i} className={cn('flex gap-3', msg.role === 'candidate' && 'flex-row-reverse')}>
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                      msg.role === 'agent' ? 'bg-muted' : 'bg-foreground text-background',
                    )}>
                      {msg.role === 'agent'
                        ? <Bot className="w-4 h-4 text-muted-foreground" />
                        : <User className="w-4 h-4" />}
                    </div>

                    <div className={cn('max-w-[75%] space-y-1', msg.role === 'candidate' && 'items-end flex flex-col')}>
                      <p className="text-xs text-muted-foreground">
                        {msg.role === 'agent' ? personality.name : 'You'}
                      </p>
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
                      <div className={cn(
                        'rounded-lg px-4 py-3 text-sm leading-relaxed',
                        msg.role === 'agent' ? 'bg-muted' : 'bg-foreground text-background',
                      )}>
                        <p className="whitespace-pre-wrap">
                          {msg.content}
                          {isStreaming && streamingIdx === i && (
                            <span className="inline-block w-0.5 h-4 ml-0.5 bg-current animate-pulse align-middle" />
                          )}
                        </p>
                      </div>
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
                  <p className="text-xs font-medium text-muted-foreground mb-2">Test unexpected replies</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {UNEXPECTED_REPLIES.map(reply => (
                      <Button
                        key={reply}
                        variant="outline"
                        size="sm"
                        onClick={() => sendReply(reply)}
                        disabled={loading}
                        className="text-xs h-auto py-1.5 border-amber-200 text-amber-900 hover:bg-amber-50"
                      >
                        {reply}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quick replies</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_REPLIES.map(reply => (
                      <Button
                        key={reply}
                        variant="outline"
                        size="sm"
                        onClick={() => sendReply(reply)}
                        disabled={loading}
                        className="text-xs h-auto py-1.5"
                      >
                        {reply}
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

        <aside className="lg:w-72 shrink-0 space-y-4 hidden lg:block">
          <CompanyContextCard config={agentConfig} />
        </aside>
      </div>
    </div>
  )
}
