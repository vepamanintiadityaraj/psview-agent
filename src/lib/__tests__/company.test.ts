import { describe, it, expect } from 'vitest'
import { canBuildAgent, suggestLinkedInFromWebsite } from '../company'
import type { CompanyContext } from '@/types'

const BASE_CONTEXT: CompanyContext = {
  name: 'Stripe',
  url: 'https://stripe.com',
  linkedinUrl: 'https://linkedin.com/company/stripe',
  description: 'Financial infrastructure for the internet',
  industry: 'Fintech',
  culture: ['High standards'],
  values: ['Honesty'],
  tone: 50,
  urgency: 50,
  rolesHired: ['Software Engineer'],
  mission: 'Increase the GDP of the internet',
  companySize: '5000+',
  hiringIntent: '',
  source: 'url',
}

describe('canBuildAgent', () => {
  it('returns ok when all required fields are present', () => {
    const result = canBuildAgent(BASE_CONTEXT, 'Software Engineer')
    expect(result.ok).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('requires a target role', () => {
    const result = canBuildAgent(BASE_CONTEXT, '')
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('target role')
  })

  it('requires a company name', () => {
    const result = canBuildAgent({ ...BASE_CONTEXT, name: '' }, 'Engineer')
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('company name')
  })

  it('requires at least one culture trait or value', () => {
    const result = canBuildAgent({ ...BASE_CONTEXT, culture: [], values: [] }, 'Engineer')
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('at least one culture trait or value')
  })

  it('passes when only culture is provided (no values)', () => {
    const result = canBuildAgent({ ...BASE_CONTEXT, values: [] }, 'Engineer')
    expect(result.ok).toBe(true)
  })

  it('passes when only values are provided (no culture)', () => {
    const result = canBuildAgent({ ...BASE_CONTEXT, culture: [] }, 'Engineer')
    expect(result.ok).toBe(true)
  })

  it('collects multiple missing fields', () => {
    const result = canBuildAgent({ ...BASE_CONTEXT, name: '', description: '', industry: '' }, 'Engineer')
    expect(result.ok).toBe(false)
    expect(result.missing.length).toBeGreaterThan(1)
  })
})

describe('suggestLinkedInFromWebsite', () => {
  it('returns a LinkedIn URL for a valid domain', () => {
    expect(suggestLinkedInFromWebsite('stripe.com')).toBe('https://www.linkedin.com/company/stripe')
  })

  it('strips https:// and www.', () => {
    expect(suggestLinkedInFromWebsite('https://www.notion.so')).toBe('https://www.linkedin.com/company/notion')
  })

  it('returns empty string when domain has no dot (user still typing)', () => {
    expect(suggestLinkedInFromWebsite('stripe')).toBe('')
  })

  it('returns empty string for empty input', () => {
    expect(suggestLinkedInFromWebsite('')).toBe('')
  })
})
