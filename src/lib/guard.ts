import { NextRequest, NextResponse } from 'next/server'

// In-memory rate limiter — 30 requests per IP per minute.
// Good enough for a demo deployment; swap for Redis in production.
const limiter = new Map<string, { count: number; resetAt: number }>()

function pruneLimiter() {
  const now = Date.now()
  for (const [k, v] of limiter) if (now > v.resetAt) limiter.delete(k)
}

export function rateLimit(req: NextRequest, limit = 30): NextResponse | null {
  if (limiter.size > 5_000) pruneLimiter()

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const now = Date.now()
  const entry = limiter.get(ip)

  if (!entry || now > entry.resetAt) {
    limiter.set(ip, { count: 1, resetAt: now + 60_000 })
    return null
  }
  if (entry.count >= limit) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  entry.count++
  return null
}

export function missing(...fields: unknown[]): boolean {
  return fields.some(f => f === undefined || f === null || f === '')
}
