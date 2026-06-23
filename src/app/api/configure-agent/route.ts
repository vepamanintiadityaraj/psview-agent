import { NextRequest, NextResponse } from 'next/server'
import { getAnthropic } from '@/lib/anthropic'
import { buildConfigureSystemInstruction } from '@/lib/prompts'
import { canBuildAgent } from '@/lib/company'
import { rateLimit } from '@/lib/guard'
import { trim, MAX } from '@/lib/validation'
import { CompanyContext } from '@/types'
import { parseApiError, sleepMs } from '@/lib/ai-error'
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
1. Who you are — human name, gender (male or female), role title, archetype label (e.g. "The Technical Collaborator"), bio rooted in ${companyContext.name}'s culture, 5 communication rules, 3 things you never do, signature trait.
2. A ${OUTREACH_MESSAGE_COUNT}-message outreach sequence for a ${targetRole} candidate (msg_1–msg_${OUTREACH_MESSAGE_COUNT}): subject, body (100–200 words each), intent, tone.
   - msg_1: initial personalized outreach
   - msg_2: follow-up with role detail
   - msg_3: qualification question
   - msg_4: social proof or urgency
   - msg_${OUTREACH_MESSAGE_COUNT}: graceful close / breakup

Messages must reference ${companyContext.name} specifically — not generic recruiter templates.

QUALITY REQUIREMENTS (non-negotiable — every message must pass these):
- Mention "${companyContext.name}" by name in every message body.
- Forbidden words/phrases: "rockstar", "ninja", "guru", "superstar", "amazing opportunity", "unique opportunity", "dream job", "excited to share".
- Each message body: 100–200 words (strictly enforced — not shorter, not longer).
- All 5 subject lines must be unique — no repetition.
- Every message must be tailored to the ${targetRole} role with specific, relevant detail.

Output in this exact format — no preamble, no explanation outside the tags:

<bio>
Write the recruiter bio here as natural prose. 3-4 sentences. Start with the recruiter's name. Ground it in ${companyContext.name}'s mission and culture.
</bio>
<json>
{
  "personality": {
    "name": "First Last",
    "gender": "male or female",
    "role": "Job Title",
    "archetype": "The [Archetype Name]",
    "bio": "Same bio as above",
    "signatureTrait": "One sentence describing their signature recruiting approach.",
    "communicationRules": ["Rule 1", "Rule 2", "Rule 3", "Rule 4", "Rule 5"],
    "avoidList": ["Thing 1", "Thing 2", "Thing 3"]
  },
  "messageSequence": [
    {"id": "msg_1", "subject": "...", "body": "...", "intent": "...", "tone": "..."},
    {"id": "msg_2", "subject": "...", "body": "...", "intent": "...", "tone": "..."},
    {"id": "msg_3", "subject": "...", "body": "...", "intent": "...", "tone": "..."},
    {"id": "msg_4", "subject": "...", "body": "...", "intent": "...", "tone": "..."},
    {"id": "msg_5", "subject": "...", "body": "...", "intent": "...", "tone": "..."}
  ]
}
</json>`
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
    gender?: 'male' | 'female'
    reasoningTrace?: string
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

function parseConfigFromStream(text: string): AgentConfigPayload | null {
  // Try <json>...</json> block first
  const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/)
  const jsonStr = jsonMatch?.[1]?.trim()
  if (jsonStr) {
    try { return JSON.parse(jsonStr) } catch {}
  }
  // Fallback: find the outermost { ... }
  const i = text.indexOf('{')
  const j = text.lastIndexOf('}')
  if (i !== -1 && j !== -1 && j > i) {
    try { return JSON.parse(text.slice(i, j + 1)) } catch {}
  }
  return null
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

async function generateConfig(
  model: string,
  systemInstruction: string,
  userPrompt: string,
  onBioDelta?: (text: string) => void,
): Promise<{ data: AgentConfigPayload; modelUsed: string }> {
  let streamText = ''
  let bioStart = -1
  let lastSentIdx = 0

  const stream = await getAnthropic().messages.create({
    model,
    max_tokens: 10_000,
    system: systemInstruction,
    messages: [{ role: 'user', content: userPrompt }],
    stream: true,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      streamText += event.delta.text

      if (onBioDelta) {
        if (bioStart === -1) {
          const idx = streamText.indexOf('<bio>')
          if (idx !== -1) { bioStart = idx + 5; lastSentIdx = bioStart }
        }
        if (bioStart !== -1) {
          const closeIdx = streamText.indexOf('</bio>')
          const sendTo = closeIdx !== -1 ? closeIdx : streamText.length
          if (sendTo > lastSentIdx) {
            onBioDelta(streamText.slice(lastSentIdx, sendTo))
            lastSentIdx = sendTo
          }
        }
      }
    }
  }

  const data = parseConfigFromStream(streamText)
  if (!data?.personality?.name || !data.messageSequence?.length) {
    throw new Error('Incomplete agent configuration')
  }

  return {
    data: {
      ...data,
      personality: {
        ...data.personality,
        reasoningTrace: data.personality.signatureTrait,
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

  const responseStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEncode(event, data)))
      }

      const systemInstruction = buildConfigureSystemInstruction(companyContext)
      const userPrompt = buildUserPrompt(companyContext, targetRole)

      try {
        // ── Step 1: Generate (streaming bio to client) ──────────────────
        send('step', { n: 1, total: 2, label: 'Building agent persona...' })

        let rawConfig: AgentConfigPayload | null = null
        let modelUsed = ''
        let lastError: unknown = null

        for (const model of CONFIGURE_MODELS) {
          try {
            const result = await generateConfig(
              model,
              systemInstruction,
              userPrompt,
              (text) => send('bio_delta', { text }),
            )
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
                const result = await generateConfig(
                  model,
                  systemInstruction,
                  userPrompt,
                  (text) => send('bio_delta', { text }),
                )
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

        // ── Step 3: Auto-retry if any criterion failed ──────────────────
        if (evalResult.score < 5 && evalResult.failures.length > 0) {
          send('step', { n: 3, total: 3, label: `Auto-retrying — score ${evalResult.score}/5...` })
          const retryPrompt = buildRetryPrompt(userPrompt, evalResult.failures)

          for (const model of CONFIGURE_MODELS) {
            try {
              // No bio streaming on retry — user already saw it
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

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
