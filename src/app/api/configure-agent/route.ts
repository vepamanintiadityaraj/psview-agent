import { NextRequest, NextResponse } from 'next/server'
import {
  getAnthropic,
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
import { CONFIGURE_MODELS, FAST_MODEL, OUTREACH_MESSAGE_COUNT } from '@/lib/anthropic-models'
import { buildFallbackAgentConfig } from '@/lib/fallback-agent'

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function buildUserPrompt(companyContext: CompanyContext, targetRole: string): string {
  const intentNote = companyContext.hiringIntent
    ? `\nHiring intent to reflect in outreach: ${companyContext.hiringIntent}`
    : ''

  return `Configure yourself autonomously to engage candidates for the ${targetRole} role at ${companyContext.name}.${intentNote}

From the company context alone, decide:
1. Who you are — human name, role title, archetype label (e.g. "The Technical Collaborator"), bio rooted in ${companyContext.name}'s culture, 5 communication rules, 3 things you never do, signature trait.
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
    archetype?: string
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

interface EvalResult {
  score: number
  criteria: { label: string; pass: boolean }[]
  failures: string[]
}

async function evalAgentConfig(
  config: AgentConfigPayload,
  ctx: CompanyContext,
  role: string,
): Promise<EvalResult> {
  const prompt = `You are an independent quality auditor for recruiter agent configurations. Evaluate against exactly 5 criteria. Respond with JSON only.

Company: ${ctx.name}
Target role: ${role}
Agent name: ${config.personality.name}
Agent bio: ${config.personality.bio}

Messages:
${config.messageSequence.map((m, i) => `MSG ${i + 1}:\nSubject: ${m.subject}\nBody: ${m.body}`).join('\n\n')}

Score each criterion pass/fail:
1. All messages mention "${ctx.name}" by name
2. No generic fluff language ("amazing opportunity", "rockstar", "cutting-edge", "ninja", "guru", "excited to share", "unique opportunity")
3. Messages are specific to the ${role} role, not generic templates
4. All subject lines are unique (no repeats)
5. Persona feels like a real ${ctx.name} employee, not a corporate bot

Return JSON: {"score":<0-5>,"criteria":[{"label":"...","pass":true/false}],"failures":["criterion text if failed"]}`

  try {
    const response = await getAnthropic().messages.create({
      model: FAST_MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON in eval response')
    const json = JSON.parse(text.slice(start, end + 1))
    return {
      score: typeof json.score === 'number' ? json.score : 3,
      criteria: Array.isArray(json.criteria) ? json.criteria : [],
      failures: Array.isArray(json.failures) ? json.failures : [],
    }
  } catch {
    return { score: 5, criteria: [], failures: [] }
  }
}

function buildRetryPrompt(originalPrompt: string, failures: string[]): string {
  return `${originalPrompt}

QUALITY AUDIT FEEDBACK — previous attempt failed these checks:
${failures.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Fix only these issues. Keep everything else.`
}

async function generateConfig(model: string, systemInstruction: string, userPrompt: string) {
  const response = await getAnthropic().messages.create({
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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEncode(event, data)))
      }

      const systemInstruction = buildConfigureSystemInstruction(companyContext)
      const userPrompt = buildUserPrompt(companyContext, targetRole)

      try {
        // ── Step 1: Generate ────────────────────────────────────────────
        send('step', { n: 1, total: 2, label: 'Building agent persona...' })

        let rawConfig: AgentConfigPayload | null = null
        let modelUsed = ''
        let lastError: unknown = null

        for (const model of CONFIGURE_MODELS) {
          try {
            const result = await generateConfig(model, systemInstruction, userPrompt)
            rawConfig = result.data
            modelUsed = result.modelUsed
            break
          } catch (e) {
            lastError = e
            const parsed = parseApiError(e)
            if (parsed.isQuota) continue
            if (parsed.retryable) {
              await sleepMs(parsed.retryAfterSeconds * 1000)
              try {
                const result = await generateConfig(model, systemInstruction, userPrompt)
                rawConfig = result.data
                modelUsed = result.modelUsed
                break
              } catch (retryErr) {
                lastError = retryErr
              }
            }
          }
        }

        if (!rawConfig) throw lastError ?? new Error('Failed to generate agent configuration')

        // ── Step 2: Eval ────────────────────────────────────────────────
        send('step', { n: 2, total: 2, label: 'Auditing quality...' })
        const evalResult = await evalAgentConfig(rawConfig, companyContext, targetRole)

        let finalConfig = rawConfig
        let autoRetried = false

        // ── Step 3: Auto-retry if score < 3 ────────────────────────────
        if (evalResult.score < 3 && evalResult.failures.length > 0) {
          send('step', { n: 3, total: 3, label: `Auto-retrying — score ${evalResult.score}/5...` })
          const retryPrompt = buildRetryPrompt(userPrompt, evalResult.failures)

          for (const model of CONFIGURE_MODELS) {
            try {
              const result = await generateConfig(model, systemInstruction, retryPrompt)
              finalConfig = result.data
              modelUsed = result.modelUsed
              autoRetried = true
              break
            } catch {
              // keep original
            }
          }
        }

        send('done', {
          ...finalConfig,
          companyContext,
          targetRole,
          modelUsed,
          autoRetried,
          evalCriteria: evalResult.criteria,
        })
      } catch (e) {
        console.error('configure-agent:', e)
        if (allowFallback) {
          const fallback = buildFallbackAgentConfig(companyContext, targetRole)
          const parsed = parseApiError(e)
          send('done', {
            ...fallback,
            fallback: true,
            warning: 'Claude API was unavailable. Loaded a template agent from your company profile — you can still run the full demo.',
            apiError: parsed.message,
          })
        } else {
          const parsed = parseApiError(e)
          send('error', { message: parsed.message })
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
