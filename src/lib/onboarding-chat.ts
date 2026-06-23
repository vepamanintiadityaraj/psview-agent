import { CompanyContext } from '@/types'
import { canBuildAgent } from './company'

export type EntryMode = 'url' | 'name' | 'describe' | 'manual'

export type OnboardingStep =
  | 'entry_mode'
  | 'url_input'
  | 'name_input'
  | 'name_hints'
  | 'paste_input'
  | 'name'
  | 'industry'
  | 'description'
  | 'company_size'
  | 'mission'
  | 'culture'
  | 'values'
  | 'tone'
  | 'target_role'
  | 'hiring_intent'
  | 'review'

export interface StepConfig {
  step: OnboardingStep
  question: string
  hint?: string
  optional?: boolean
}

export const ENTRY_MODE_OPTIONS = [
  { id: 'url' as const, label: 'Website URL', desc: 'Best for known companies' },
  { id: 'name' as const, label: 'Search by name', desc: 'No website needed' },
  { id: 'describe' as const, label: 'Paste text', desc: 'Job post, LinkedIn, etc.' },
  { id: 'manual' as const, label: 'Tell you myself', desc: 'Answer a few questions' },
]

export const FIELD_STEPS: OnboardingStep[] = [
  'name',
  'industry',
  'description',
  'company_size',
  'mission',
  'culture',
  'values',
  'tone',
  'target_role',
  'hiring_intent',
  'review',
]

function needsStep(
  step: OnboardingStep,
  ctx: CompanyContext,
  targetRole: string,
  confirmed: Set<OnboardingStep>,
): boolean {
  if (confirmed.has(step)) return false
  switch (step) {
    case 'name': return !ctx.name.trim()
    case 'industry': return !ctx.industry.trim()
    case 'description': return !ctx.description.trim()
    case 'company_size': return !ctx.companySize?.trim()
    case 'mission': return true
    case 'culture': return ctx.culture.length === 0
    case 'values': return ctx.values.length === 0
    case 'tone': return true
    case 'target_role': return !targetRole.trim()
    case 'hiring_intent': return true
    case 'review': return true
    default: return false
  }
}

export function nextFieldStep(
  ctx: CompanyContext,
  targetRole: string,
  confirmed: Set<OnboardingStep>,
  after?: OnboardingStep,
): OnboardingStep {
  const startIdx = after ? FIELD_STEPS.indexOf(after) + 1 : 0
  for (let i = startIdx; i < FIELD_STEPS.length; i++) {
    const step = FIELD_STEPS[i]
    if (needsStep(step, ctx, targetRole, confirmed)) return step
  }
  return 'review'
}

export function stepConfig(step: OnboardingStep, ctx: CompanyContext): StepConfig {
  const configs: Record<OnboardingStep, StepConfig> = {
    entry_mode: {
      step: 'entry_mode',
      question: "Hi! I'll help you configure an autonomous recruiting agent. How would you like to tell me about the company?",
    },
    url_input: {
      step: 'url_input',
      question: "What's the company website? I'll research them and fill in the details.",
      hint: 'e.g. stripe.com or https://yourcompany.com',
    },
    name_input: {
      step: 'name_input',
      question: "What's the company called?",
      hint: 'e.g. PSVIEW, Anthropic, Revolut',
    },
    name_hints: {
      step: 'name_hints',
      question: `Any hints to find "${ctx.name || 'them'}"? Industry or location helps disambiguate.`,
      hint: 'Optional — leave blank if unsure',
      optional: true,
    },
    paste_input: {
      step: 'paste_input',
      question: 'Paste anything about the company — job post, LinkedIn About, pitch deck excerpt...',
      hint: 'At least a few sentences',
    },
    name: {
      step: 'name',
      question: "What's the company name?",
    },
    industry: {
      step: 'industry',
      question: `What industry is ${ctx.name || 'the company'} in?`,
      hint: 'e.g. HR Tech, Fintech, Healthcare',
    },
    description: {
      step: 'description',
      question: `What does ${ctx.name || 'the company'} do?`,
      hint: 'Products, customers, what makes them unique',
    },
    company_size: {
      step: 'company_size',
      question: 'How big is the team?',
    },
    mission: {
      step: 'mission',
      question: `What's ${ctx.name || 'their'} mission? Why do they exist?`,
      hint: 'Optional — skip if unknown',
      optional: true,
    },
    culture: {
      step: 'culture',
      question: 'How would you describe the culture? Pick all that fit.',
      hint: 'Tap to select, then press Continue',
    },
    values: {
      step: 'values',
      question: 'What values matter there? Pick all that apply.',
      hint: 'Tap to select, then press Continue',
    },
    tone: {
      step: 'tone',
      question: ctx.tone !== 50
        ? `I'd suggest a ${ctx.tone < 40 ? 'formal' : ctx.tone > 60 ? 'casual' : 'balanced'} tone — does that work?`
        : 'How should the agent communicate with candidates?',
    },
    target_role: {
      step: 'target_role',
      question: 'Which role is the agent hiring for?',
    },
    hiring_intent: {
      step: 'hiring_intent',
      question: 'What makes an ideal candidate for this role?',
      hint: 'Optional — helps personalize outreach',
      optional: true,
    },
    review: {
      step: 'review',
      question: "Here's what I've got. Ready to build your agent?",
    },
  }
  return configs[step]
}

export function buildReviewSummary(ctx: CompanyContext, targetRole: string): string {
  return [
    `${ctx.name} · ${ctx.industry}`,
    ctx.companySize ? `Team size: ${ctx.companySize}` : null,
    ctx.description,
    ctx.mission ? `Mission: ${ctx.mission}` : null,
    `Culture: ${ctx.culture.join(', ')}`,
    `Values: ${ctx.values.join(', ')}`,
    `Tone: ${ctx.tone}/100`,
    `Hiring for: ${targetRole}`,
    ctx.hiringIntent ? `Ideal candidate: ${ctx.hiringIntent}` : null,
  ].filter(Boolean).join('\n')
}

export function canProceedToBuild(ctx: CompanyContext, targetRole: string): boolean {
  return canBuildAgent(ctx, targetRole).ok
}
