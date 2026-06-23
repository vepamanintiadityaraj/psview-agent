import { NextRequest, NextResponse } from 'next/server'
import { getAnthropic } from '@/lib/anthropic'
import { FAST_MODEL } from '@/lib/anthropic-models'
import { rateLimit } from '@/lib/guard'
import { AgentPersonality, CandidatePersona, CompanyContext, ConversationMessage } from '@/types'

export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  if (!body?.conversationHistory || !body?.personality || !body?.companyContext) {
    return NextResponse.json({ error: 'conversationHistory, personality, and companyContext required' }, { status: 400 })
  }

  const {
    conversationHistory,
    personality,
    companyContext,
    targetRole,
    candidatePersona,
  } = body as {
    conversationHistory: ConversationMessage[]
    personality: AgentPersonality
    companyContext: CompanyContext
    targetRole?: string
    candidatePersona?: CandidatePersona
  }

  const candidateName = candidatePersona?.name || 'Candidate'
  const candidateTitle = candidatePersona
    ? `${candidatePersona.currentRole} at ${candidatePersona.currentCompany}`
    : 'Unknown'

  const transcript = conversationHistory
    .map(m => `${m.role === 'agent' ? personality.name : candidateName}: ${m.content}`)
    .join('\n\n')

  try {
    const response = await getAnthropic().messages.create({
      model: FAST_MODEL,
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: `Write a concise recruiter handoff brief based on this conversation.

Context:
- Recruiter: ${personality.name} (${personality.role}) at ${companyContext.name}
- Role: ${targetRole || 'open role'}
- Candidate: ${candidateName}, ${candidateTitle}

Conversation:
${transcript}

Write the brief with these sections:
**Interest level:** ⭐⭐⭐ (1–5 stars) — one sentence of evidence from the conversation
**What we learned:** 3 bullet points about the candidate's situation and priorities
**Objections raised:** objections or hesitations that came up (or "None" if none)
**Suggested opener for discovery call:** one specific opening line that references something from the conversation
**Topics to explore:** 2–3 areas to dig into on the next call

Keep it tight. Reference specifics from the conversation — no generic advice.`,
      }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    return NextResponse.json({ brief: text })
  } catch (e) {
    console.error('handoff-brief:', e)
    return NextResponse.json({ error: 'Failed to generate brief' }, { status: 500 })
  }
}
