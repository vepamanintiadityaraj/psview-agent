import { ConversationMessage } from '@/types'

export type AnthropicChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const META_RE = /<META>([\s\S]*?)<\/META>/i

export interface ConversationMeta {
  sentiment: string
  stage: string
  signalDetected: string
  candidateRead?: string
  nextStrategy?: string
  riskFlags?: string
  responseCategory?: string
}

export function parseConversationOutput(raw: string): {
  reply: string
} & ConversationMeta {
  const match = raw.match(META_RE)
  const reply = raw.replace(META_RE, '').trim()

  if (!match) {
    return {
      reply,
      sentiment: 'neutral',
      stage: 'engaging',
      signalDetected: '',
    }
  }

  try {
    const meta = JSON.parse(match[1]) as ConversationMeta
    return {
      reply,
      sentiment: meta.sentiment ?? 'neutral',
      stage: meta.stage ?? 'engaging',
      signalDetected: meta.signalDetected ?? '',
      candidateRead: meta.candidateRead ?? '',
      nextStrategy: meta.nextStrategy ?? '',
      riskFlags: meta.riskFlags ?? '',
      responseCategory: meta.responseCategory ?? 'expected',
    }
  } catch (e) {
    console.warn('[parseConversationOutput] Failed to parse META JSON:', match[1]?.slice(0, 200), e)
    return { reply, sentiment: 'neutral', stage: 'engaging', signalDetected: '' }
  }
}

export function buildChatHistory(messages: ConversationMessage[]): AnthropicChatMessage[] {
  const history: AnthropicChatMessage[] = []

  if (messages.length === 0) return history

  let startIdx = 0
  if (messages[0].role === 'agent') {
    history.push({
      role: 'user',
      content: '[Outreach sent]',
    })
    history.push({ role: 'assistant', content: messages[0].content })
    startIdx = 1
  }

  for (let i = startIdx; i < messages.length; i++) {
    const m = messages[i]
    history.push({
      role: m.role === 'agent' ? 'assistant' : 'user',
      content: m.content,
    })
  }

  return history
}

export function splitStreamingMeta(
  accumulated: string,
  metaStarted: boolean,
): { visible: string; metaStarted: boolean } {
  // Full tag found — stop streaming here
  const idx = accumulated.indexOf('<META>')
  if (idx !== -1) return { visible: accumulated.slice(0, idx), metaStarted: true }

  // Guard partial tag at the tail to prevent '<ME', '<MET' etc. leaking to UI
  const lastAngle = accumulated.lastIndexOf('<')
  if (lastAngle !== -1) {
    const tail = accumulated.slice(lastAngle)
    if ('<META>'.startsWith(tail)) {
      return { visible: accumulated.slice(0, lastAngle), metaStarted: false }
    }
  }

  return { visible: accumulated, metaStarted: false }
}
