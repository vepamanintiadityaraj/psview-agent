import { NextRequest, NextResponse } from 'next/server'
import { getAnthropic } from '@/lib/anthropic'
import { FAST_MODEL } from '@/lib/anthropic-models'
import { rateLimit } from '@/lib/guard'
import { CompanyContext } from '@/types'

export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  if (!body?.targetRole || !body?.companyContext) {
    return NextResponse.json({ error: 'targetRole and companyContext required' }, { status: 400 })
  }

  const { targetRole, companyContext } = body as { targetRole: string; companyContext: CompanyContext }

  try {
    const response = await getAnthropic().messages.create({
      model: FAST_MODEL,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Generate a realistic fictional candidate that a recruiter at ${companyContext.name} would cold-outreach for a ${targetRole} role.

Make them credible — currently employed at a recognizable company, passively open but not actively searching.

Return JSON only, no markdown:
{
  "name": "First Last",
  "currentRole": "Title at Company",
  "currentCompany": "Company name",
  "background": "2 sentences of professional background",
  "likelyConcerns": ["brief concern 1", "brief concern 2", "brief concern 3"],
  "tone": "direct|skeptical|friendly|busy|curious"
}`,
      }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON in response')
    const persona = JSON.parse(text.slice(start, end + 1))
    return NextResponse.json(persona)
  } catch (e) {
    console.error('generate-persona:', e)
    return NextResponse.json({ error: 'Failed to generate persona' }, { status: 500 })
  }
}
