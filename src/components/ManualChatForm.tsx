'use client'

import { useState, useRef, useEffect } from 'react'
import { CompanyContext } from '@/types'
import { EMPTY_CONTEXT, suggestLinkedInFromWebsite } from '@/lib/company'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Bot, Send, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessage {
  role: 'bot' | 'user'
  text: string
}

type CtxWithRole = CompanyContext & { targetRole: string }

interface Step {
  id: string
  question: (ctx: CtxWithRole) => string
  placeholder: string
  optional?: boolean
  multiline?: boolean
  apply: (answer: string, ctx: CtxWithRole) => CtxWithRole
}

const STEPS: Step[] = [
  {
    id: 'name',
    question: () => "Let's set up your recruiter agent. What's the company name?",
    placeholder: 'e.g. Acme Corp',
    apply: (a, ctx) => ({ ...ctx, name: a.trim() }),
  },
  {
    id: 'description',
    question: ctx => `What does ${ctx.name} do? 2–3 sentences — products, customers, market position.`,
    placeholder: 'We build payment infrastructure that helps developers accept money…',
    multiline: true,
    apply: (a, ctx) => ({ ...ctx, description: a.trim() }),
  },
  {
    id: 'industry',
    question: ctx => `What industry is ${ctx.name} in?`,
    placeholder: 'e.g. Fintech, HR Tech, Developer Tools, SaaS',
    apply: (a, ctx) => ({ ...ctx, industry: a.trim() }),
  },
  {
    id: 'url',
    question: () => "What's the company website? (optional)",
    placeholder: 'https://company.com',
    optional: true,
    apply: (a, ctx) => {
      const url = a.trim()
      const linkedin = !ctx.linkedinUrl && url ? suggestLinkedInFromWebsite(url) : ctx.linkedinUrl
      return { ...ctx, url, linkedinUrl: linkedin || ctx.linkedinUrl }
    },
  },
  {
    id: 'linkedinUrl',
    question: () => "What's their LinkedIn company page? (optional)",
    placeholder: 'linkedin.com/company/...',
    optional: true,
    apply: (a, ctx) => ({ ...ctx, linkedinUrl: a.trim() }),
  },
  {
    id: 'culture',
    question: ctx => `How would you describe the culture at ${ctx.name}? List a few traits, comma-separated.`,
    placeholder: 'Fast-paced, collaborative, data-driven, remote-first…',
    multiline: true,
    apply: (a, ctx) => ({
      ...ctx,
      culture: a.split(/[,\n]/).map(s => s.trim()).filter(Boolean),
    }),
  },
  {
    id: 'values',
    question: ctx => `What does ${ctx.name} stand for? What are their core values?`,
    placeholder: 'Transparency, ownership, speed, customer obsession…',
    multiline: true,
    apply: (a, ctx) => ({
      ...ctx,
      values: a.split(/[,\n]/).map(s => s.trim()).filter(Boolean),
    }),
  },
  {
    id: 'rolesHired',
    question: ctx => `What roles does ${ctx.name} typically hire for? Comma-separated. (optional)`,
    placeholder: 'Software Engineer, Product Manager, Data Scientist…',
    optional: true,
    apply: (a, ctx) => ({
      ...ctx,
      rolesHired: a.split(/[,\n]/).map(s => s.trim()).filter(Boolean),
    }),
  },
  {
    id: 'targetRole',
    question: () => 'Which specific role are you recruiting for in this session?',
    placeholder: 'e.g. Senior Software Engineer',
    apply: (a, ctx) => ({ ...ctx, targetRole: a.trim() }),
  },
  {
    id: 'hiringIntent',
    question: ctx => `Any hiring intent for the ${ctx.targetRole} role? What makes the ideal candidate? (optional)`,
    placeholder: 'Looking for someone with 5+ years in distributed systems…',
    multiline: true,
    optional: true,
    apply: (a, ctx) => ({ ...ctx, hiringIntent: a.trim() }),
  },
]

interface Props {
  onDone: (context: CompanyContext, targetRole: string) => void
}

export default function ManualChatForm({ onDone }: Props) {
  const initial: CtxWithRole = { ...EMPTY_CONTEXT, source: 'manual', targetRole: '' }
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'bot', text: STEPS[0].question(initial) },
  ])
  const [stepIdx, setStepIdx] = useState(0)
  const [ctx, setCtx] = useState<CtxWithRole>(initial)
  const [input, setInput] = useState('')
  const [done, setDone] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (!done) inputRef.current?.focus()
  }, [messages, done])

  function advance(answer: string, skip = false) {
    const step = STEPS[stepIdx]
    const trimmed = answer.trim()
    if (!trimmed && !skip) return

    const newCtx = skip ? ctx : step.apply(trimmed, ctx)
    setCtx(newCtx)
    setInput('')

    const userText = skip ? '(skipped)' : trimmed
    const nextIdx = stepIdx + 1

    if (nextIdx >= STEPS.length) {
      setMessages(prev => [
        ...prev,
        { role: 'user', text: userText },
        {
          role: 'bot',
          text: `Perfect — I have everything I need to build the agent for ${newCtx.name}. Click "Review & Build" to continue.`,
        },
      ])
      setStepIdx(nextIdx)
      setDone(true)
    } else {
      setMessages(prev => [
        ...prev,
        { role: 'user', text: userText },
        { role: 'bot', text: STEPS[nextIdx].question(newCtx) },
      ])
      setStepIdx(nextIdx)
    }
  }

  const currentStep = STEPS[stepIdx]

  return (
    <div className="panel flex flex-col" style={{ minHeight: 420, maxHeight: 520 }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-2 items-end', msg.role === 'user' && 'flex-row-reverse')}>
            {msg.role === 'bot' && (
              <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-background" />
              </div>
            )}
            <div className={cn(
              'max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
              msg.role === 'bot'
                ? 'bg-muted text-foreground rounded-bl-sm'
                : 'bg-foreground text-background rounded-br-sm',
            )}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-3 space-y-2 shrink-0">
        {done ? (
          <Button className="w-full" onClick={() => onDone({ ...ctx }, ctx.targetRole)}>
            Review &amp; Build →
          </Button>
        ) : (
          <>
            <Textarea
              ref={inputRef}
              placeholder={currentStep?.placeholder}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  advance(input)
                }
              }}
              rows={currentStep?.multiline ? 2 : 1}
              className="resize-none"
            />
            <div className="flex gap-2">
              {currentStep?.optional && (
                <Button variant="outline" size="sm" onClick={() => advance('', true)} className="text-xs">
                  <SkipForward className="w-3 h-3 mr-1" />
                  Skip
                </Button>
              )}
              <Button size="sm" onClick={() => advance(input)} disabled={!input.trim()} className="ml-auto">
                <Send className="w-3 h-3 mr-1.5" />
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
