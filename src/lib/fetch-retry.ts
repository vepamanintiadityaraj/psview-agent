export const RETRY_SECONDS = 5
export const MAX_ATTEMPTS = 4

export function isRetryableResponse(
  status: number,
  body?: { retryable?: boolean; error?: string },
): boolean {
  if (body?.retryable) return true
  if (status === 503 || status === 429) return true
  const err = body?.error ?? ''
  return /high demand|unavailable|try again|rate limit|busy|more time required/i.test(err)
}

export function isRetryableMessage(message: string): boolean {
  return /high demand|unavailable|try again|rate limit|busy|more time required/i.test(message)
}

export class RetryableError extends Error {
  readonly retryable = true
  constructor(message: string) {
    super(message)
    this.name = 'RetryableError'
  }
}

export function isRetryableError(e: unknown): boolean {
  if (e instanceof RetryableError) return true
  if (e instanceof Error) return isRetryableMessage(e.message)
  return false
}

export async function waitBeforeRetry(
  onTick: (secondsLeft: number) => void,
  totalSeconds: number = RETRY_SECONDS,
): Promise<void> {
  for (let s = totalSeconds; s > 0; s--) {
    onTick(s)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

export async function postJsonWithRetry<T>(
  url: string,
  body: unknown,
  onWaiting: (secondsLeft: number) => void,
): Promise<T> {
  let lastError = 'Request failed'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json().catch(() => ({})) as T & {
      error?: string
      retryable?: boolean
      retryAfterSeconds?: number
      fallback?: boolean
    }

    // Success — includes API fallback agent (200 with fallback: true)
    if (res.ok) return data

    lastError = data.error || 'Request failed'

    if (isRetryableResponse(res.status, data) && attempt < MAX_ATTEMPTS) {
      const delay = data.retryAfterSeconds ?? RETRY_SECONDS
      await waitBeforeRetry(onWaiting, delay)
      continue
    }

    throw new Error(lastError)
  }

  throw new Error(lastError)
}
