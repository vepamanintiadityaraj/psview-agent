import { NextResponse } from 'next/server'

export interface ParsedApiError {
  retryable: boolean
  isQuota: boolean
  message: string
  retryAfterSeconds: number
  raw: string
}

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function parseApiError(e: unknown): ParsedApiError {
  const status =
    e && typeof e === 'object' && 'status' in e
      ? Number((e as { status: number }).status)
      : 0

  const raw = extractErrorMessage(e)
  const isQuota =
    status === 429 ||
    /rate limit|quota|overloaded|too many requests/i.test(raw)
  const retryable =
    isQuota ||
    status === 503 ||
    status === 529 ||
    /overloaded|unavailable|try again|busy/i.test(raw)

  const retryAfterSeconds = isQuota ? 15 : 5

  let message: string
  if (isQuota) {
    message =
      'Claude API rate limit reached. Retrying — or a template agent will load automatically.'
  } else if (retryable) {
    message = 'The model is busy — more time required.'
  } else {
    message = raw.slice(0, 280) || 'Request failed'
  }

  return { retryable, isQuota, message, retryAfterSeconds, raw }
}

export function isRetryableApiError(e: unknown): boolean {
  return parseApiError(e).retryable
}

export function apiErrorResponse(e: unknown, fallback: string) {
  const parsed = parseApiError(e)
  return NextResponse.json(
    {
      error: parsed.retryable ? parsed.message : fallback,
      retryable: parsed.retryable,
      isQuota: parsed.isQuota,
      retryAfterSeconds: parsed.retryAfterSeconds,
    },
    { status: parsed.retryable ? 503 : 500 },
  )
}

export async function sleepMs(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}
