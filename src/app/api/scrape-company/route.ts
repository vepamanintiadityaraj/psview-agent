import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
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
  websiteUrl?: string
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
  const tools = useWebSearch ? [WEB_SEARCH_TOOL, COMPANY_PROFILE_TOOL] : [COMPANY_PROFILE_TOOL]
  const response = await anthropic.messages.create({
    model: FAST_MODEL,
    max_tokens: 4096,
    system,
    tools,
    // With web search: use auto so Claude can search first then call submit_company_profile.
    // Without web search: force submit_company_profile immediately.
    tool_choice: useWebSearch
      ? ({ type: 'auto' } as Anthropic.Messages.ToolChoiceAuto)
      : ({ type: 'tool', name: COMPANY_PROFILE_TOOL.name } as Anthropic.Messages.ToolChoiceTool),
    messages: [{ role: 'user', content: userContent }],
  })

  let data = extractToolInput<CompanyProfilePayload>(response, COMPANY_PROFILE_TOOL.name)

  // If web search ran but submit_company_profile was never called (e.g. hit max_uses without
  // submitting), do a second focused pass to force structured extraction from gathered text.
  if (!data && useWebSearch) {
    const gathered = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n\n')
      .trim()

    const followUp = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 2048,
      system,
      tools: [COMPANY_PROFILE_TOOL],
      tool_choice: { type: 'tool', name: COMPANY_PROFILE_TOOL.name } as Anthropic.Messages.ToolChoiceTool,
      messages: [{
        role: 'user',
        content: gathered
          ? `Based on this research:\n\n${gathered}\n\nCall submit_company_profile now with all data found.`
          : `${userContent}\n\nCall submit_company_profile with whatever partial data is available.`,
      }],
    })
    data = extractToolInput<CompanyProfilePayload>(followUp, COMPANY_PROFILE_TOOL.name)
  }

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
    url: extras.url || data.websiteUrl || '',
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
      // At least one of website URL or LinkedIn URL must be provided
      const rawUrl = (body.url as string | undefined)?.trim() ?? ''
      const rawLinkedIn = (body.linkedinUrl as string | undefined)?.trim() ?? ''

      if (!rawUrl && !rawLinkedIn) {
        return NextResponse.json({ error: 'Provide a website URL or LinkedIn page URL' }, { status: 400 })
      }

      // Validate website URL if provided
      let websiteUrl: string | null = null
      let websiteDomain: string | null = null
      if (rawUrl) {
        const parsed = normalizeUrl(rawUrl)
        if ('error' in parsed) {
          return NextResponse.json({ error: parsed.error }, { status: 400 })
        }
        websiteUrl = parsed.url
        websiteDomain = parsed.domain
      }

      // Validate LinkedIn URL if provided
      const linkedIn = rawLinkedIn ? parseOptionalLinkedIn(rawLinkedIn) : null
      if (linkedIn && 'error' in linkedIn) {
        return NextResponse.json({ error: linkedIn.error }, { status: 400 })
      }
      const linkedinUrl = linkedIn && !('error' in linkedIn) ? linkedIn.url : null

      const buildPrompt = (website: string | null, li: string | null) => {
        if (website && li) {
          return `Research the company at "${website}".
${buildLinkedInResearchBlock(li)}

Steps:
1. Visit "${website}" — read the About, Mission, Culture, Values pages.
2. Visit the LinkedIn page above for employee count and About section. If LinkedIn is inaccessible or blocked, skip it.
3. Check the careers/jobs page (try /careers, /jobs) for current open roles.
4. Call submit_company_profile with all data found. Use empty arrays for fields not found on official sources.`
        }
        if (li && !website) {
          return `Research the company from their LinkedIn page: "${li}".
No website URL was provided — use LinkedIn as the primary source.

Steps:
1. Visit the LinkedIn page above for company name, description, industry, size, About, culture, and values.
2. Try to find and visit the official website linked from the LinkedIn page for additional details.
3. Call submit_company_profile with all data found. Use empty arrays for fields not found.`
        }
        // website only
        return `Research the company at "${website}".
No LinkedIn URL was provided. Research only from the official website.

Steps:
1. Visit "${website}" — read the About, Mission, Culture, Values pages.
2. Check the careers/jobs page (try /careers, /jobs) for current open roles.
3. Call submit_company_profile with all data found. Use empty arrays for fields not found on official sources.`
      }

      let data: CompanyProfilePayload
      try {
        data = await extractProfile(buildPrompt(websiteUrl, linkedinUrl), WEBSITE_RESEARCH_SYSTEM, true)
      } catch (firstErr) {
        // If both sources were provided and the attempt failed, retry with website only
        if (websiteUrl && linkedinUrl) {
          console.warn('[scrape-company] Retrying without LinkedIn after error:', (firstErr as Error).message)
          data = await extractProfile(buildPrompt(websiteUrl, null), WEBSITE_RESEARCH_SYSTEM, true)
        }
        // If only LinkedIn was provided and it failed, retry using the company name from the LinkedIn slug
        else if (linkedinUrl && !websiteUrl) {
          const slug = linkedinUrl.split('/company/')[1]?.replace(/\/$/, '') ?? ''
          console.warn('[scrape-company] LinkedIn-only attempt failed, retrying by company name:', slug)
          data = await extractProfile(
            `Research the company named "${slug}" (from LinkedIn: ${linkedinUrl}). Find their website and official information. Call submit_company_profile with whatever data you can find.`,
            WEBSITE_RESEARCH_SYSTEM,
            true,
          )
        } else {
          throw firstErr
        }
      }
      return NextResponse.json(normalizeProfile(
        data, 'url',
        { url: websiteUrl ?? '', linkedinUrl: linkedinUrl ?? '' },
        true,
      ))
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
