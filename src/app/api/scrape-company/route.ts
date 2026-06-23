import { NextRequest, NextResponse } from 'next/server'
import { anthropic, extractToolInput, WEB_SEARCH_TOOL } from '@/lib/anthropic'
import { FAST_MODEL } from '@/lib/anthropic-models'
import { COMPANY_PROFILE_TOOL, WEBSITE_RESEARCH_SYSTEM } from '@/lib/prompts'
import { rateLimit } from '@/lib/guard'
import { MAX, normalizeLinkedInUrl, normalizeUrl, trim } from '@/lib/validation'
import type { CompanySource } from '@/lib/company'
import { apiErrorResponse } from '@/lib/ai-error'

type ResearchMode = 'url' | 'name' | 'describe' | 'enrich'

interface CompanyProfilePayload {
  name: string
  description: string
  industry: string
  culture: string[]
  values: string[]
  rolesHired: string[]
  suggestedTone: number
  mission?: string
  companySize?: string
}

function parseOptionalLinkedIn(raw: unknown): { url: string } | { error: string } | null {
  const linkedInRaw = typeof raw === 'string' ? raw.trim() : ''
  if (!linkedInRaw) return null
  const parsed = normalizeLinkedInUrl(linkedInRaw)
  if (!parsed) return null
  if ('error' in parsed) return parsed
  return parsed
}

function buildLinkedInResearchBlock(linkedinUrl: string | null, websiteNote?: string) {
  if (!linkedinUrl) {
    return `${websiteNote ?? ''}
No LinkedIn URL was provided. Research only from the official website.`
  }
  return `${websiteNote ?? ''}
LinkedIn company page (research this URL for size, About, culture):
${linkedinUrl}`
}

function computeNeedsManualInput(data: CompanyProfilePayload, strictSources: boolean): string[] {
  const needs: string[] = []
  if (strictSources) {
    if (!data.culture?.length) needs.push('culture')
    if (!data.values?.length) needs.push('values')
  }
  return needs
}

async function extractProfile(
  userContent: string,
  system: string,
  useWebSearch: boolean,
): Promise<CompanyProfilePayload> {
  const response = await anthropic.messages.create({
    model: FAST_MODEL,
    max_tokens: 4096,
    system,
    tools: useWebSearch ? [WEB_SEARCH_TOOL, COMPANY_PROFILE_TOOL] : [COMPANY_PROFILE_TOOL],
    messages: [{ role: 'user', content: userContent }],
  })

  const data = extractToolInput<CompanyProfilePayload>(response, COMPANY_PROFILE_TOOL.name)
  if (!data?.name) throw new Error('Failed to structure company profile')
  return {
    ...data,
    culture: Array.isArray(data.culture) ? data.culture : [],
    values: Array.isArray(data.values) ? data.values : [],
    rolesHired: Array.isArray(data.rolesHired) ? data.rolesHired : [],
  }
}

function normalizeProfile(
  data: CompanyProfilePayload,
  source: CompanySource,
  extras: { url?: string; linkedinUrl?: string; hiringIntent?: string },
  strictSources = false,
) {
  const tone = typeof data.suggestedTone === 'number'
    ? Math.min(100, Math.max(0, data.suggestedTone))
    : 50

  const profile = {
    name: trim(data.name, MAX.name) || 'Unknown Company',
    description: trim(data.description, MAX.description),
    industry: trim(data.industry, MAX.industry) || 'Unknown',
    culture: Array.isArray(data.culture) ? data.culture.map(c => trim(c, MAX.tag)).filter(Boolean).slice(0, 12) : [],
    values: Array.isArray(data.values) ? data.values.map(v => trim(v, MAX.tag)).filter(Boolean).slice(0, 12) : [],
    rolesHired: Array.isArray(data.rolesHired) ? data.rolesHired.map(r => trim(r, MAX.tag)).filter(Boolean).slice(0, 20) : [],
    mission: trim(data.mission ?? '', MAX.mission),
    companySize: trim(data.companySize ?? '', 40),
    suggestedTone: tone,
    url: extras.url ?? '',
    linkedinUrl: extras.linkedinUrl ?? '',
    hiringIntent: extras.hiringIntent ?? '',
    source,
    needsManualInput: computeNeedsManualInput(data, strictSources),
  }

  return profile
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const mode = (body.mode ?? 'url') as ResearchMode

  try {
    if (mode === 'url') {
      const parsed = normalizeUrl(body.url ?? '')
      if ('error' in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }

      const linkedIn = parseOptionalLinkedIn(body.linkedinUrl)
      if (linkedIn && 'error' in linkedIn) {
        return NextResponse.json({ error: linkedIn.error }, { status: 400 })
      }
      const linkedinUrl = linkedIn && !('error' in linkedIn) ? linkedIn.url : null

      const data = await extractProfile(
        `Research the company at "${parsed.url}" (domain: ${parsed.domain}).
${buildLinkedInResearchBlock(linkedinUrl)}

Steps:
1. Read the company's official website for description, mission, and any explicitly stated culture/values.
${linkedinUrl ? '2. Read the LinkedIn page above for size, About, and supplemental facts.' : '2. No LinkedIn provided — use website only.'}
3. Check careers/jobs page for current open roles only.
4. Submit the structured profile. Leave culture and values as empty arrays if not explicitly written on official sources.`,
        WEBSITE_RESEARCH_SYSTEM,
        true,
      )
      return NextResponse.json(normalizeProfile(data, 'url', { url: parsed.url, linkedinUrl: linkedinUrl ?? '' }, true))
    }

    if (mode === 'name') {
      const companyName = trim(body.companyName, MAX.name)
      if (!companyName) {
        return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
      }

      const linkedIn = parseOptionalLinkedIn(body.linkedinUrl)
      if (linkedIn && 'error' in linkedIn) {
        return NextResponse.json({ error: linkedIn.error }, { status: 400 })
      }
      const linkedinUrl = linkedIn && !('error' in linkedIn) ? linkedIn.url : null

      const industry = trim(body.industry, MAX.industry)
      const location = trim(body.location, 80)
      const hints = [industry && `Industry: ${industry}`, location && `Location: ${location}`]
        .filter(Boolean)
        .join('. ')

      const data = await extractProfile(
        `Research "${companyName}".${hints ? ` ${hints}.` : ''}
${buildLinkedInResearchBlock(linkedinUrl)}

Also find the official website if possible. Culture/values only if explicitly stated on official pages. Submit structured profile.`,
        WEBSITE_RESEARCH_SYSTEM,
        true,
      )
      const url = typeof body.url === 'string' ? trim(body.url, MAX.url) : ''
      return NextResponse.json(normalizeProfile(data, 'name', { url, linkedinUrl: linkedinUrl ?? '' }, true))
    }

    if (mode === 'describe') {
      const text = trim(body.text, MAX.pastedText)
      if (text.length < 40) {
        return NextResponse.json(
          { error: 'Paste at least a few sentences about the company (40+ characters)' },
          { status: 400 }
        )
      }

      const data = await extractProfile(
        `Extract a company profile from this pasted text only. Do not add information not present in the text:\n\n${text}`,
        'Extract only facts explicitly present in the pasted source. Culture and values only if stated in the text. suggestedTone: 0 formal to 100 casual.',
        false,
      )
      return NextResponse.json(normalizeProfile(data, 'describe', {}, false))
    }

    if (mode === 'enrich') {
      const name = trim(body.name, MAX.name)
      const description = trim(body.description, MAX.description)
      if (!name || !description) {
        return NextResponse.json(
          { error: 'Company name and description are required to enrich manual entry' },
          { status: 400 },
        )
      }

      const data = await extractProfile(
        `Company: ${name}\nIndustry: ${trim(body.industry, MAX.industry)}\nDescription: ${description}\nCulture: ${(body.culture ?? []).join(', ')}\nValues: ${(body.values ?? []).join(', ')}\n\nSuggest only missing fields based on provided info. Do not replace existing culture/values unless empty.`,
        'Suggest missing culture, values, roles, tone, mission, size based on provided info only.',
        false,
      )

      return NextResponse.json(
        normalizeProfile(data, 'manual', {
          url: trim(body.url, MAX.url),
          linkedinUrl: trim(body.linkedinUrl ?? '', MAX.url),
          hiringIntent: trim(body.hiringIntent, MAX.hiringIntent),
        }, false),
      )
    }

    return NextResponse.json({ error: 'Invalid mode. Use url, name, describe, or enrich.' }, { status: 400 })
  } catch (e) {
    console.error(e)
    return apiErrorResponse(e, 'Failed to analyze company')
  }
}
