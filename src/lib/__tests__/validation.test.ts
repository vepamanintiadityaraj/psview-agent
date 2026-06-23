import { describe, it, expect } from 'vitest'
import { normalizeUrl, normalizeLinkedInUrl, isNonEmpty } from '../validation'

describe('normalizeUrl', () => {
  it('accepts a bare domain and adds https', () => {
    const result = normalizeUrl('stripe.com')
    expect('url' in result).toBe(true)
    if ('url' in result) expect(result.url).toBe('https://stripe.com/')
  })

  it('accepts a full https URL', () => {
    const result = normalizeUrl('https://notion.so')
    expect('url' in result).toBe(true)
    if ('url' in result) expect(result.domain).toBe('notion.so')
  })

  it('strips www from domain', () => {
    const result = normalizeUrl('https://www.stripe.com')
    expect('url' in result).toBe(true)
    if ('url' in result) expect(result.domain).toBe('stripe.com')
  })

  it('returns error for empty input', () => {
    const result = normalizeUrl('')
    expect('error' in result).toBe(true)
  })

  it('returns error for a string with no dot', () => {
    const result = normalizeUrl('notadomain')
    expect('error' in result).toBe(true)
  })
})

describe('normalizeLinkedInUrl', () => {
  it('returns null for empty input', () => {
    expect(normalizeLinkedInUrl('')).toBeNull()
  })

  it('accepts a valid LinkedIn company URL', () => {
    const result = normalizeLinkedInUrl('https://linkedin.com/company/stripe')
    expect(result).not.toBeNull()
    expect('url' in result!).toBe(true)
  })

  it('strips trailing slash', () => {
    const result = normalizeLinkedInUrl('https://www.linkedin.com/company/stripe/')
    expect('url' in result!).toBe(true)
    if (result && 'url' in result) expect(result.url.endsWith('/')).toBe(false)
  })

  it('returns error for a non-LinkedIn URL', () => {
    const result = normalizeLinkedInUrl('https://twitter.com/stripe')
    expect(result).not.toBeNull()
    expect('error' in result!).toBe(true)
  })

  it('returns error for a LinkedIn profile URL (not /company/)', () => {
    const result = normalizeLinkedInUrl('https://linkedin.com/in/someone')
    expect(result).not.toBeNull()
    expect('error' in result!).toBe(true)
  })
})

describe('isNonEmpty', () => {
  it('returns true when all strings are non-empty', () => {
    expect(isNonEmpty('a', 'b', 'c')).toBe(true)
  })

  it('returns false when any string is empty', () => {
    expect(isNonEmpty('a', '', 'c')).toBe(false)
  })

  it('returns false for whitespace-only strings', () => {
    expect(isNonEmpty('  ')).toBe(false)
  })

  it('returns false for non-string values', () => {
    expect(isNonEmpty(null as unknown as string)).toBe(false)
  })
})
