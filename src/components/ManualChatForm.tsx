'use client'

import { useState, useRef, useEffect } from 'react'
import { CompanyContext } from '@/types'
import { EMPTY_CONTEXT } from '@/lib/company'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Bot, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessage {
  role: 'bot' | 'user'
  text: string
}

type Ctx = CompanyContext

interface Step {
  id: string
  question: (ctx: Ctx) => string
  placeholder: string
  multiline?: boolean
  apply: (answer: string, ctx: Ctx) => Ctx
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
    placeholder: 'We build payment infrastructure that helps developers accept money globally…',
    multiline: true,
    apply: (a, ctx) => ({ ...ctx, description: a.trim() }),
  },
  {
    id: 'companySize',
    question: ctx => `How many people work at ${ctx.name}?`,
    placeholder: 'e.g. ~500, 10,000+, early-stage (~30)',
    apply: (a, ctx) => ({ ...ctx, companySize: a.trim() }),
  },
]

interface Props {
  onDone: (context: CompanyContext) => void
}

export default function ManualChatForm({ onDone }: Props) {
  const initial: Ctx = { ...EMPTY_CONTEXT, source: 'manual' }
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'bot', text: STEPS[0].question(initial) },
  ])
  const [stepIdx, setStepIdx] = useState(0)
  const [ctx, setCtx] = useState<Ctx>(initial)
  const [input, setInput] = useState('')
  const [done, setDone] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (!done) inputRef.current?.focus()
  }, [messages, done])

  function advance(answer: string) {
    const trimmed = answer.trim()
    if (!trimmed) return

    const step = STEPS[stepIdx]
    const newCtx = step.apply(trimmed, ctx)
    setCtx(newCtx)
    setInput('')

    const nextIdx = stepIdx + 1

    if (nextIdx >= STEPS.length) {
      setMessages(prev => [
        ...prev,
        { role: 'user', text: trimmed },
        {
          role: 'bot',
          text: `Got it — that's enough to get started with ${newCtx.name}. On the next page I'll suggest culture traits and values for you to pick from, plus you can set the tone, hiring urgency, and target role.`,
        },
      ])
      setStepIdx(nextIdx)
      setDone(true)
      setCtx(newCtx)
    } else {
      setMessages(prev => [
        ...prev,
        { role: 'user', text: trimmed },
        { role: 'bot', text: STEPS[nextIdx].question(newCtx) },
      ])
      setStepIdx(nextIdx)
    }
  }

  const currentStep = STEPS[stepIdx]

  return (
    <div className="panel flex flex-col" style={{ minHeight: 380, maxHeight: 480 }}>
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
          <Button className="w-full" onClick={() => onDone(ctx)}>
            Continue to Review →
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
            <div className="flex justify-end">
              <Button size="sm" onClick={() => advance(input)} disabled={!input.trim()}>
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
