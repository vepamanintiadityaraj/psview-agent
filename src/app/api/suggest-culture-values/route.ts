import { NextRequest, NextResponse } from 'next/server'
import { getAnthropic } from '@/lib/anthropic'
import { FAST_MODEL } from '@/lib/anthropic-models'
import { rateLimit } from '@/lib/guard'
import { CompanyContext } from '@/types'

export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  if (!body?.companyContext) {
    return NextResponse.json({ error: 'companyContext required' }, { status: 400 })
  }

  const ctx = body.companyContext as CompanyContext

  try {
    const response = await getAnthropic().messages.create({
      model: FAST_MODEL,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Suggest realistic culture traits and company values for this company.

Company: ${ctx.name}
Industry: ${ctx.industry}
Description: ${ctx.description}
${ctx.mission ? `Mission: ${ctx.mission}` : ''}

Return ONLY a JSON object — no extra text:
{"culture":["trait1","trait2","trait3","trait4","trait5"],"values":["val1","val2","val3","val4","val5"]}

Culture traits: short descriptive phrases (2–5 words) about how it feels to work there.
Values: 1–3 word principles the company stands for.
Be specific to this company's industry and description, not generic.`,
      }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON in response')
    const parsed = JSON.parse(text.slice(start, end + 1))
    return NextResponse.json({
      culture: Array.isArray(parsed.culture) ? parsed.culture : [],
      values: Array.isArray(parsed.values) ? parsed.values : [],
    })
  } catch (e) {
    console.error('suggest-culture-values:', e)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}
