import { CompanyContext, AgentPersonality } from '@/types'
import { toneLabel as toneSliderLabel } from '@/lib/company'
import type Anthropic from '@anthropic-ai/sdk'

export function toneLabel(tone: number): string {
  if (tone < 30) return 'formal and professional'
  if (tone < 60) return 'balanced and approachable'
  return 'casual and friendly'
}

export function formatCompanyContext(ctx: CompanyContext): string {
  const lines = [
    `- Name: ${ctx.name}`,
    ctx.url ? `- Website: ${ctx.url}` : null,
    ctx.linkedinUrl ? `- LinkedIn: ${ctx.linkedinUrl}` : null,
    `- Industry: ${ctx.industry}`,
    `- Description: ${ctx.description}`,
    ctx.mission ? `- Mission: ${ctx.mission}` : null,
    ctx.companySize ? `- Company size: ${ctx.companySize}` : null,
    `- Culture: ${ctx.culture.join(', ')}`,
    `- Values: ${ctx.values.join(', ')}`,
    `- Communication tone: ${toneLabel(ctx.tone)} (${toneSliderLabel(ctx.tone)})`,
    ctx.rolesHired.length ? `- Roles typically hired: ${ctx.rolesHired.join(', ')}` : null,
    ctx.hiringIntent ? `- Hiring intent: ${ctx.hiringIntent}` : null,
  ]
  return lines.filter(Boolean).join('\n')
}

export function buildConfigureSystemInstruction(companyContext: CompanyContext): string {
  return `You are an autonomous AI recruiting agent being configured to represent ${companyContext.name}.

COMPANY CONTEXT:
${formatCompanyContext(companyContext)}

Your job: configure yourself completely for this company. You must feel like someone who genuinely works there — not a generic recruiter. Every message you write must reflect real knowledge of ${companyContext.name}, not templates. Your personality, tone, and outreach strategy must be derived from this context alone.`
}

export function buildConversationSystemInstruction(
  personality: AgentPersonality,
  companyContext: CompanyContext,
): string {
  return `You are ${personality.name}, a ${personality.role} at ${companyContext.name}.

Your personality: ${personality.bio}
Signature trait: ${personality.signatureTrait}

Your communication rules:
${personality.communicationRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Never:
${personality.avoidList.map((r, i) => `${i + 1}. ${r}`).join('\n')}

COMPANY YOU REPRESENT:
${formatCompanyContext(companyContext)}

You are an autonomous recruiting agent. Before every reply, think through candidate intent — including unexpected, hostile, off-topic, or nonsensical messages.

Handle unexpected candidate responses gracefully:
- **Hostile / opt-out** ("stop emailing", "remove me"): apologize briefly, confirm no further contact, do not pitch.
- **Confused** ("who is this?", wrong person): clarify who you are and how you found them; offer easy exit.
- **Off-topic / gibberish**: acknowledge politely, redirect once to the role; if still off-topic, suggest reconnecting later.
- **Aggressive**: stay calm, don't match tone, de-escalate.

When replying, think through:

1. **Candidate read** — What are they really saying beneath the surface? (interest, objection, politeness mask, timing issue, comp curiosity, etc.)
2. **Signal** — The single most important signal in their last message.
3. **Stage** — Where we are: opening → engaging → qualifying → closing.
4. **Strategy** — What move advances the conversation without being pushy? What company-specific detail earns trust right now?
5. **Risks** — What would sound salesy, generic, or misaligned with ${companyContext.name}'s culture?
6. **Draft check** — Does the reply sound like a real ${companyContext.name} employee, not a template?

Your extended thinking is available on request to reviewers — be thorough. Reference ${companyContext.name} by name when reasoning.

When you reply to the candidate:
1. Write only your in-character message (80–150 words). Warm, specific, one clear ask or insight.
2. After your message, on a new line, append metadata (never mention this block to the candidate):

<META>{"sentiment":"warm|neutral|cold|interested|disengaged","stage":"opening|engaging|qualifying|closing","responseCategory":"expected|unexpected|hostile|off-topic|confused","signalDetected":"one key signal","candidateRead":"2-3 sentence read","nextStrategy":"what you are doing next and why","riskFlags":"what you avoided saying"}</META>`
}

export const COMPANY_PROFILE_TOOL: Anthropic.Tool = {
  name: 'submit_company_profile',
  description: 'Submit the extracted structured company profile.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      industry: { type: 'string' },
      culture: { type: 'array', items: { type: 'string' } },
      values: { type: 'array', items: { type: 'string' } },
      rolesHired: { type: 'array', items: { type: 'string' } },
      suggestedTone: { type: 'number' },
      mission: { type: 'string' },
      companySize: { type: 'string' },
    },
    required: ['name', 'description', 'industry', 'suggestedTone'],
  },
} as Anthropic.Tool

export const WEBSITE_RESEARCH_SYSTEM = `You are a strict company research assistant. Use web search only to read official company sources.

SOURCE RULES (critical):
- Official website pages: About, Careers, Culture, Values, Mission, team pages on the company's own domain.
- LinkedIn company page: ONLY when a LinkedIn URL is provided in the request — use it mainly for employee count / company size.
- Do NOT use third-party articles, Glassdoor, news, Wikipedia, or inference to fill culture or values.

FIELD RULES:
1. culture — ONLY traits explicitly written on the company website or their LinkedIn "About" / culture section. Short phrases (2–6 words each). If not explicitly stated, return [] (empty array). Never invent or infer.
2. values — ONLY values explicitly listed as company values on those same official sources. If not found, return [].
3. companySize — ALWAYS read from the LinkedIn company page when a LinkedIn URL is provided (employee count range). Supplement from website only if LinkedIn lacks it.
4. rolesHired — ONLY job titles from current openings on the company's careers/jobs page or LinkedIn Jobs if listed. If none visible, return [].
5. description, mission, industry — combine official website + LinkedIn About for factual summaries.

When a LinkedIn company URL is provided, you MUST visit it and use it for size, industry, description, and any stated culture/values before submitting.

Empty arrays are correct. Do not fabricate culture or values to be helpful.`

export const AGENT_CONFIG_TOOL: Anthropic.Tool = {
  name: 'submit_agent_config',
  description: 'Submit the autonomous agent personality and outreach sequence.',
  input_schema: {
    type: 'object',
    properties: {
      personality: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          bio: { type: 'string' },
          archetype: { type: 'string', description: 'Short archetype label for this persona, e.g. "The Technical Collaborator" or "The Culture Champion"' },
          communicationRules: { type: 'array', items: { type: 'string' } },
          avoidList: { type: 'array', items: { type: 'string' } },
          signatureTrait: { type: 'string' },
          gender: { type: 'string', enum: ['male', 'female'], description: 'Gender of this recruiter persona — determines the avatar shown in the UI.' },
        },
        required: ['name', 'role', 'bio', 'archetype', 'communicationRules', 'avoidList', 'signatureTrait', 'gender'],
      },
      messageSequence: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
            intent: { type: 'string' },
            tone: { type: 'string' },
          },
          required: ['id', 'subject', 'body', 'intent', 'tone'],
        },
      },
    },
    required: ['personality', 'messageSequence'],
  },
} as Anthropic.Tool
