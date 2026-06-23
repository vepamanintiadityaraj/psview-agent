const MAX = {
  name: 120,
  url: 500,
  description: 4000,
  mission: 1000,
  industry: 120,
  tag: 80,
  hiringIntent: 800,
  pastedText: 8000,
} as const

export function trim(s: unknown, max: number): string {
  if (typeof s !== 'string') return ''
  return s.trim().slice(0, max)
}

export function normalizeUrl(raw: string): { url: string; domain: string } | { error: string } {
  const input = trim(raw, MAX.url)
  if (!input) return { error: 'URL is required' }

  let url = input
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('.')) {
      return { error: 'Enter a valid domain (e.g. stripe.com)' }
    }
    const domain = parsed.hostname.replace(/^www\./, '')
    return { url: parsed.href, domain }
  } catch {
    return { error: 'Invalid URL format' }
  }
}

export function normalizeLinkedInUrl(raw: string): { url: string } | { error: string } | null {
  const input = trim(raw, MAX.url)
  if (!input) return null

  let url = input
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) {
      return { error: 'Enter a LinkedIn company URL (e.g. linkedin.com/company/stripe)' }
    }
    if (!parsed.pathname.includes('/company/')) {
      return { error: 'Use a LinkedIn company page URL (linkedin.com/company/...)' }
    }
    return { url: parsed.origin + parsed.pathname.replace(/\/$/, '') }
  } catch {
    return { error: 'Invalid LinkedIn URL format' }
  }
}

export function isNonEmpty(...fields: unknown[]): boolean {
  return fields.every(f => typeof f === 'string' && f.trim().length > 0)
}

export { MAX }
