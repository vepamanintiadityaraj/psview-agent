import { NextRequest } from 'next/server'
import {
  getAnthropic,
  conversationThinking,
  DEFAULT_MODEL,
} from '@/lib/anthropic'
import { buildConversationSystemInstruction } from '@/lib/prompts'
import {
  buildChatHistory,
  parseConversationOutput,
  splitStreamingMeta,
} from '@/lib/conversation'
import { rateLimit, missing } from '@/lib/guard'
import { parseApiError } from '@/lib/ai-error'
import { AgentPersonality, CompanyContext, ConversationMessage } from '@/types'

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const p = body?.personality
  if (
    !body ||
    missing(p?.name) ||
    missing(p?.role) ||
    missing(p?.bio) ||
    !Array.isArray(p?.communicationRules) ||
    !Array.isArray(p?.avoidList) ||
    missing(body.companyContext?.name) ||
    !Array.isArray(body.conversationHistory)
  ) {
    return new Response(JSON.stringify({ error: 'personality (name, role, bio, communicationRules, avoidList), companyContext, and conversationHistory are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const {
    personality,
    companyContext,
    conversationHistory,
  }: {
    personality: AgentPersonality
    companyContext: CompanyContext
    conversationHistory: ConversationMessage[]
  } = body

  const lastMessage = conversationHistory[conversationHistory.length - 1]
  if (!lastMessage || lastMessage.role !== 'candidate') {
    return new Response(JSON.stringify({ error: 'Last message must be a candidate reply' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const priorHistory = conversationHistory.slice(0, -1)
  const systemInstruction = buildConversationSystemInstruction(personality, companyContext)
  const messages = [
    ...buildChatHistory(priorHistory),
    { role: 'user' as const, content: lastMessage.content },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEncode(event, data)))
      }

      try {
        const response = getAnthropic().messages.stream({
          model: DEFAULT_MODEL,
          max_tokens: 16_000,
          thinking: conversationThinking,
          system: systemInstruction,
          messages,
        })

        let fullText = ''
        let thoughts = ''
        let visibleReply = ''
        let metaStarted = false

        for await (const event of response) {
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'thinking_delta') {
              thoughts += event.delta.thinking
            }
            if (event.delta.type === 'text_delta') {
              fullText += event.delta.text
              const split = splitStreamingMeta(fullText, metaStarted)
              metaStarted = split.metaStarted
              const replyDelta = split.visible.slice(visibleReply.length)
              visibleReply = split.visible
              if (replyDelta) send('delta', { delta: replyDelta })
            }
          }
        }

        const parsed = parseConversationOutput(fullText)
        send('done', {
          reply: parsed.reply,
          reasoning: thoughts.trim(),
          sentiment: parsed.sentiment,
          stage: parsed.stage,
          signalDetected: parsed.signalDetected,
          candidateRead: parsed.candidateRead,
          nextStrategy: parsed.nextStrategy,
          riskFlags: parsed.riskFlags,
          responseCategory: parsed.responseCategory,
        })
      } catch (e) {
        console.error(e)
        const parsed = parseApiError(e)
        send('error', {
          message: parsed.retryable ? parsed.message : 'Failed to generate reply',
          retryable: parsed.retryable,
          retryAfterSeconds: parsed.retryAfterSeconds,
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
