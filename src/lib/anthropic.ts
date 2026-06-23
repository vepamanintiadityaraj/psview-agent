import Anthropic from '@anthropic-ai/sdk'
import {
  CONFIGURE_THINKING_BUDGET,
  CONVERSATION_THINKING_BUDGET,
  DEFAULT_MODEL,
} from '@/lib/anthropic-models'

let client: Anthropic | null = null

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.')
  }
  return key
}

export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: getApiKey() })
  }
  return client
}

/** @deprecated Use getAnthropic() so the API key is read at request time. */
export const anthropic = {
  get messages() {
    return getAnthropic().messages
  },
}

export { DEFAULT_MODEL }

export const conversationThinking = {
  type: 'enabled' as const,
  budget_tokens: CONVERSATION_THINKING_BUDGET,
}

export const configureThinking =
  CONFIGURE_THINKING_BUDGET > 0
    ? { type: 'enabled' as const, budget_tokens: CONFIGURE_THINKING_BUDGET }
    : undefined

export function extractThinking(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.ThinkingBlock => block.type === 'thinking')
    .map(block => block.thinking)
    .join('\n\n')
    .trim()
}

export function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
}

export function extractToolInput<T>(
  message: Anthropic.Message,
  toolName: string,
): T | null {
  const block = message.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === 'tool_use' && b.name === toolName,
  )
  return block ? (block.input as T) : null
}

export function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonStr = fenced ? fenced[1].trim() : trimmed
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object in response')
  return JSON.parse(jsonStr.slice(start, end + 1))
}

export const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
} as unknown as Anthropic.Messages.Tool
