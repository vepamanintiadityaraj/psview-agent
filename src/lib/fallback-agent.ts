import { AgentConfig, CompanyContext } from '@/types'
import { toneLabel } from '@/lib/prompts'

const FIRST_NAMES = ['Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Quinn', 'Drew']
const LAST_NAMES = ['Chen', 'Patel', 'Rivera', 'Smith', 'Kim', 'Okafor', 'Nguyen', 'Ellis']

function deriveAgentName(companyName: string): string {
  // Deterministic pick based on company name so the same company always gets the same name
  const seed = companyName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const first = FIRST_NAMES[seed % FIRST_NAMES.length]
  const last = LAST_NAMES[Math.floor(seed / FIRST_NAMES.length) % LAST_NAMES.length]
  return `${first} ${last}`
}

export function buildFallbackAgentConfig(
  companyContext: CompanyContext,
  targetRole: string,
): AgentConfig {
  const tone = toneLabel(companyContext.tone)
  const culture = companyContext.culture.slice(0, 4).join(', ') || 'collaborative'
  const values = companyContext.values.slice(0, 3).join(', ') || 'excellence'
  const company = companyContext.name
  const agentName = deriveAgentName(company)

  return {
    companyContext,
    targetRole,
    personality: {
      name: agentName,
      role: `Talent Partner · ${company}`,
      bio: `Jordan recruits for ${company} in ${companyContext.industry}. They know the product story, speak in a ${tone} voice, and screen for people who fit a ${culture} culture while living values like ${values}.`,
      communicationRules: [
        `Reference ${company}'s product and mission — never generic recruiter language`,
        `Match the company's ${tone} tone in every message`,
        `Lead with why the ${targetRole} role matters to ${company}'s roadmap`,
        `Ask one thoughtful question per message to gauge fit`,
        `Respect the candidate's time — concise, specific, no fluff`,
      ],
      avoidList: [
        'Mass-blast templates or obvious automation',
        'Overselling compensation before mutual interest',
        'Ignoring what the candidate has already said',
      ],
      signatureTrait: `Connects ${company}'s mission to the candidate's career in one concrete sentence`,
      reasoningTrace:
        `Template configuration generated locally because the Claude API was unavailable. ` +
        `Derived from ${company}'s profile: ${culture} culture, ${values} values, hiring for ${targetRole}.`,
    },
    messageSequence: [
      {
        id: 'msg_1',
        subject: `${targetRole} at ${company} — thought you'd find this interesting`,
        body: `Hi — I'm ${agentName.split(' ')[0]} on the recruiting team at ${company}.

We're hiring a ${targetRole}, and your background stood out. ${companyContext.description.slice(0, 200)}${companyContext.description.length > 200 ? '…' : ''}

${companyContext.mission ? `What we're building: ${companyContext.mission}\n\n` : ''}Would you be open to a short conversation about the role and how it fits where you want to go next?`,
        intent: 'opening: personalized intro',
        tone,
      },
      {
        id: 'msg_2',
        subject: `What the ${targetRole} role looks like at ${company}`,
        body: `Following up — happy to share more context on the ${targetRole} position.

The team operates in a ${culture} environment. We care deeply about ${values}, which shows up in how we hire and how we work day to day.

${companyContext.hiringIntent ? `We're especially looking for: ${companyContext.hiringIntent}\n\n` : ''}If any of that resonates, I'd love to hear what you're optimizing for in your next move.`,
        intent: 'follow-up: role detail',
        tone,
      },
      {
        id: 'msg_3',
        subject: `Quick question about your experience`,
        body: `One thing I'm curious about — what's a project you're proud of that maps to the kind of work we'd do at ${company}?

We're at the stage where ${companyContext.companySize ? `a ${companyContext.companySize} company` : 'the team'} in ${companyContext.industry} needs people who can own outcomes, not just tasks.

No pressure for a long reply — even a few sentences helps me understand fit.`,
        intent: 'qualification: experience probe',
        tone,
      },
      {
        id: 'msg_4',
        subject: `Next step — 20 min with the team?`,
        body: `Based on what you've shared, I think there could be a strong match for the ${targetRole} role at ${company}.

I'd like to set up a 20-minute intro with someone on the team — no prep needed, just a conversation about the work and your goals.

Does sometime this week or next work? Happy to work around your schedule.`,
        intent: 'closing: schedule intro',
        tone,
      },
      {
        id: 'msg_5',
        subject: `Closing the loop on ${company}`,
        body: `I'll assume the timing isn't right for a ${targetRole} move — totally understand.

If things change, I'm always happy to reconnect. Wishing you well in whatever you're building next.`,
        intent: 'breakup: graceful close',
        tone,
      },
    ],
  }
}
