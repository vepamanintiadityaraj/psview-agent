import { CompanyContext } from '@/types'

export type CompanySource = 'url' | 'name' | 'describe' | 'manual'

export const EMPTY_CONTEXT: CompanyContext = {
  name: '',
  url: '',
  linkedinUrl: '',
  description: '',
  culture: [],
  tone: 50,
  urgency: 50,
  rolesHired: [],
  values: [],
  industry: '',
  mission: '',
  companySize: '',
  hiringIntent: '',
  source: 'manual',
}

export const DEMO_COMPANIES = [
  { label: 'PSView', url: 'https://psview.ai', linkedin: 'https://www.linkedin.com/company/psview', hint: 'The company hiring you' },
  { label: 'Stripe', url: 'https://stripe.com', linkedin: 'https://www.linkedin.com/company/stripe', hint: 'Well-known fintech' },
  { label: 'Notion', url: 'https://notion.so', linkedin: 'https://www.linkedin.com/company/notionhq', hint: 'Productivity SaaS' },
] as const

/** Guess LinkedIn company slug from domain (stripe.com → linkedin.com/company/stripe).
 *  Returns '' if the URL has no dot yet (user still typing). */
export function suggestLinkedInFromWebsite(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  // Only suggest once the URL looks like a real domain (has at least one dot)
  if (!trimmed.includes('.')) return ''
  const slug = trimmed.split('/')[0]?.split('.')[0]
  if (!slug || slug.length < 2) return ''
  return `https://www.linkedin.com/company/${slug}`
}

export const CULTURE_SUGGESTIONS = [
  'Fast-paced', 'Collaborative', 'Data-driven', 'Remote-first', 'Mission-driven',
  'Innovation-focused', 'Customer-obsessed', 'Inclusive', 'Autonomous', 'Growth-oriented',
]

export const VALUE_SUGGESTIONS = [
  'Transparency', 'Ownership', 'Craftsmanship', 'Diversity', 'Work-life balance',
  'Security', 'Speed', 'Humility', 'Excellence', 'Empathy',
]

export const ROLE_SUGGESTIONS = [
  'Software Engineer', 'Product Manager', 'Data Scientist', 'Designer',
  'Sales Engineer', 'Marketing Manager', 'DevOps Engineer', 'AI/ML Engineer',
]

export const COMPANY_SIZE_OPTIONS = [
  '1–10', '11–50', '51–200', '201–1000', '1000+',
] as const

export const TONE_LABELS = ['Very Formal', 'Professional', 'Balanced', 'Friendly', 'Very Casual']

export function toneLabel(tone: number): string {
  const idx = Math.min(4, Math.floor(tone / 20))
  return TONE_LABELS[idx]
}

export const URGENCY_LABELS = ['Low', 'Medium', 'High']

export function urgencyLabel(urgency: number): string {
  if (urgency < 34) return 'Low'
  if (urgency < 67) return 'Medium'
  return 'High'
}

export function mergeCompanyData(
  base: CompanyContext,
  incoming: Partial<CompanyContext>,
): CompanyContext {
  return {
    ...base,
    ...incoming,
    culture: incoming.culture?.length ? incoming.culture : base.culture,
    values: incoming.values?.length ? incoming.values : base.values,
    rolesHired: incoming.rolesHired?.length ? incoming.rolesHired : base.rolesHired,
  }
}

export function canBuildAgent(ctx: CompanyContext, targetRole: string): {
  ok: boolean
  missing: string[]
} {
  const missing: string[] = []
  if (!ctx.name.trim()) missing.push('company name')
  if (!ctx.description.trim()) missing.push('description')
  if (!ctx.industry.trim()) missing.push('industry')
  if (ctx.culture.length === 0 && ctx.values.length === 0) missing.push('at least one culture trait or value')
  if (!targetRole.trim()) missing.push('target role')
  return { ok: missing.length === 0, missing }
}
