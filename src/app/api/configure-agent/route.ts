import { NextRequest, NextResponse } from 'next/server'
import {
  anthropic,
  configureThinking,
  extractThinking,
  extractToolInput,
} from '@/lib/anthropic'
import { buildConfigureSystemInstruction, AGENT_CONFIG_TOOL } from '@/lib/prompts'
import { canBuildAgent } from '@/lib/company'
import { rateLimit } from '@/lib/guard'
import { trim, MAX } from '@/lib/validation'
import { CompanyContext } from '@/types'
import { parseApiError, sleepMs, apiErrorResponse } from '@/lib/ai-error'
import { CONFIGURE_MODELS, OUTREACH_MESSAGE_COUNT } from '@/lib/anthropic-models'
import { buildFallbackAgentConfig } from '@/lib/fallback-agent'

function buildUserPrompt(companyContext: CompanyContext, targetRole: string): string {
  const intentNote = companyContext.hiringIntent
    ? `\nHiring intent to reflect in outreach: ${companyContext.hiringIntent}`
    : ''

  return `Configure yourself autonomously to engage candidates for the ${targetRole} role at ${companyContext.name}.${intentNote}

From the company context alone, decide:
1. Who you are — human name, role title, bio rooted in ${companyContext.name}'s culture, 5 communication rules, 3 things you never do, signature trait.
2. A ${OUTREACH_MESSAGE_COUNT}-message outreach sequence for a ${targetRole} candidate (msg_1–msg_${OUTREACH_MESSAGE_COUNT}): subject, body (100–130 words each), intent, tone.
   - msg_1: initial personalized outreach
   - msg_2: follow-up with role detail
   - msg_3: qualification question
   - msg_4: social proof or urgency
   - msg_${OUTREACH_MESSAGE_COUNT}: graceful close / breakup

Messages must reference ${companyContext.name} specifically — not generic recruiter templates.

Submit via the submit_agent_config tool.`
}

interface AgentConfigPayload {
  personality: {
    name: string
    role: string
    bio: string
    communicationRules: string[]
    avoidList: string[]
    signatureTrait: string
  }
  messageSequence: Array<{
    id: string
    subject: string
    body: string
    intent: string
    tone: string
  }>
}

async function generateConfig(model: string, systemInstruction: string, userPrompt: string) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 10_000,
    ...(configureThinking ? { thinking: configureThinking } : {}),
    system: systemInstruction,
    tools: [AGENT_CONFIG_TOOL],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const data = extractToolInput<AgentConfigPayload>(response, AGENT_CONFIG_TOOL.name)
  if (!data?.personality?.name || !data.messageSequence?.length) {
    throw new Error('Incomplete agent configuration')
  }

  const thoughts = extractThinking(response)
  return {
    data: {
      ...data,
      personality: {
        ...data.personality,
        reasoningTrace: thoughts || data.personality.signatureTrait,
      },
    },
    modelUsed: model,
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  if (!body?.companyContext || !body?.targetRole) {
    return NextResponse.json({ error: 'companyContext and targetRole are required' }, { status: 400 })
  }

  const companyContext = body.companyContext as CompanyContext
  const targetRole = trim(body.targetRole, MAX.tag)
  const allowFallback = body.allowFallback !== false

  const check = canBuildAgent(companyContext, targetRole)
  if (!check.ok) {
    return NextResponse.json(
      { error: `Missing required fields: ${check.missing.join(', ')}` },
      { status: 400 },
    )
  }

  const systemInstruction = buildConfigureSystemInstruction(companyContext)
  const userPrompt = buildUserPrompt(companyContext, targetRole)
  let lastError: unknown = null

  for (const model of CONFIGURE_MODELS) {
    try {
      const { data, modelUsed } = await generateConfig(model, systemInstruction, userPrompt)
      return NextResponse.json({ ...data, companyContext, targetRole, modelUsed })
    } catch (e) {
      lastError = e
      const parsed = parseApiError(e)
      console.error(`configure-agent [${model}]:`, parsed.raw.slice(0, 200))
      if (parsed.isQuota) continue
      if (parsed.retryable) {
        await sleepMs(parsed.retryAfterSeconds * 1000)
        try {
          const { data, modelUsed } = await generateConfig(model, systemInstruction, userPrompt)
          return NextResponse.json({ ...data, companyContext, targetRole, modelUsed })
        } catch (retryErr) {
          lastError = retryErr
        }
      }
    }
  }

  if (allowFallback) {
    const fallback = buildFallbackAgentConfig(companyContext, targetRole)
    const parsed = parseApiError(lastError)
    return NextResponse.json({
      ...fallback,
      fallback: true,
      warning:
        'Claude API was unavailable. Loaded a template agent from your company profile — you can still run the full demo.',
      apiError: parsed.message,
    })
  }

  return apiErrorResponse(lastError, 'Failed to configure agent')
}
