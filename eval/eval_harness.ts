/**
 * PSView Agent — Eval Harness
 *
 * Tests our quality judge (Haiku) against a golden set of known-good and
 * known-bad agent configurations. Proves the eval gate catches bad output
 * and passes good output — not just that the system runs.
 *
 * Run: npx tsx eval/eval_harness.ts
 * Requires: ANTHROPIC_API_KEY in environment
 */

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

// ---------------------------------------------------------------------------
// Golden set: 2 known-good configs + 1 deliberately bad config.
// Good cases should score 5/5. Bad case should score ≤ 2/5.
// This validates that the quality gate actually catches what it claims to.
// ---------------------------------------------------------------------------

interface GoldenCase {
  label: string
  expectPass: boolean
  company: string
  role: string
  agentName: string
  agentBio: string
  messages: { subject: string; body: string }[]
}

const GOLDEN_CASES: GoldenCase[] = [
  {
    label: 'Stripe — Senior Software Engineer (expected: PASS)',
    expectPass: true,
    company: 'Stripe',
    role: 'Senior Software Engineer',
    agentName: 'Jordan Patel',
    agentBio:
      'Jordan Patel is a Senior Technical Recruiter at Stripe who has spent five years helping build the teams behind the infrastructure that processes hundreds of billions of dollars annually. Jordan brings a builder\'s perspective to recruiting and focuses on engineers who want to own real infrastructure problems.',
    messages: [
      {
        subject: 'Stripe infrastructure work — open to a conversation?',
        body: 'Hi [Name], I came across your distributed systems work and wanted to reach out. I\'m Jordan, a Technical Recruiter at Stripe. We\'re building the infrastructure that processes hundreds of billions of dollars in payments annually, and we\'re looking for Senior Software Engineers who want to work on problems at that scale. Your experience caught my attention — the challenges here, from real-time fraud detection to payment routing, are genuinely hard. Would you be open to a 20-minute call? No pressure either way.',
      },
      {
        subject: 'Following up on the Stripe SE role',
        body: 'Hi [Name], following up on my note from last week about the Senior Software Engineer role at Stripe. This role sits on our Payments Infrastructure team, which owns the core transaction processing pipeline. You\'d work alongside engineers who previously built systems at Google and Cloudflare. The technical bar is high, but so is the impact — changes you ship affect millions of businesses within hours. Happy to share more about the team structure first if that helps.',
      },
      {
        subject: 'Quick question before I loop in the Stripe team',
        body: 'Hi [Name], before I introduce you to the hiring manager, I want to make sure this is a strong fit. At Stripe, SE roles require deep distributed systems fundamentals — designing systems that need five-nines availability with sub-100ms p99 latency. A few questions: Are you comfortable in a polyglot environment (Go, Ruby, Scala)? What\'s the largest-scale system you\'ve owned? What draws you to infrastructure work versus product engineering? This helps me give the team the right context.',
      },
      {
        subject: 'Why engineers choose Stripe over FAANG',
        body: 'Hi [Name], one thing engineers tell me after joining Stripe: the ownership is different here. A Senior SE owns a domain end-to-end — design, code, on-call, quarterly review. No handoff to a separate reliability team. Compensation is FAANG-comparable, equity is meaningful at our stage, and the technical problems are genuinely unsolved. We\'re building financial primitives that didn\'t exist before. Given your background, I think the scope here would be compelling. Can we find 20 minutes this week?',
      },
      {
        subject: 'Last note from Stripe',
        body: 'Hi [Name], this is my last note about the Senior Software Engineer role at Stripe. If the timing isn\'t right or it\'s not the right move, no hard feelings — I understand. If things change in the next few months, I\'d love to reconnect; Stripe is in a strong growth phase and we\'ll have similar openings. I hope the work you\'re doing is going well. Take care.',
      },
    ],
  },
  {
    label: 'Notion — Product Manager (expected: PASS)',
    expectPass: true,
    company: 'Notion',
    role: 'Product Manager',
    agentName: 'Aisha Okonkwo',
    agentBio:
      'Aisha Okonkwo is a Talent Partner at Notion who joined after seeing firsthand how the product changed how her previous team worked. She focuses on product and design recruiting and brings a user-centric lens to every candidate conversation.',
    messages: [
      {
        subject: 'PM role at Notion — are you open to a conversation?',
        body: 'Hi [Name], I\'m Aisha, a Talent Partner at Notion. I came across your product work and wanted to reach out about a PM opportunity on our core editor team. At Notion, PMs own the full product surface — writing specs, sitting in user research sessions, and shipping alongside a small senior engineering team. The role is responsible for the block-based editor millions of teams use daily. Given your background, I thought this might resonate. Would you be open to a 20-minute call?',
      },
      {
        subject: 'More detail on what the Notion PM role involves',
        body: 'Hi [Name], following up on my note about the PM role at Notion. The core editor team is focused on making Notion faster and more collaborative for larger organizations — real-time multiplayer editing, better permissions, enterprise-grade reliability. The team is small (6 engineers, 1 designer, 1 PM), which means the role has real leverage. Compensation is competitive with top SaaS companies and we\'re flexible on remote. Happy to share more specifics.',
      },
      {
        subject: 'A question before I make the Notion introduction',
        body: 'Hi [Name], before I loop in the hiring manager at Notion, I want to make sure the fit is right. The PM role on our editor team requires comfort with complex technical constraints, experience with both B2B and B2C users, and a track record of shipping in a small fast team. Can you tell me about a product decision you made that had a significant technical tradeoff? And what draws you to collaboration product work? This context helps me make the right introduction.',
      },
      {
        subject: 'Why PMs choose Notion over later-stage companies',
        body: 'Hi [Name], one thing that comes up in every Notion PM conversation: the product surface is uniquely your own. PMs here don\'t manage feature queues — they shape strategy for their domain. The editor team PM helped define how databases work in Notion, how AI features integrate, and how permissions scale to enterprises. These were their decisions, not inherited from a VP roadmap. Notion is at an interesting inflection point growing enterprise while maintaining simplicity individual users love. I think you\'d find it compelling.',
      },
      {
        subject: 'Last note — Notion PM opportunity',
        body: 'Hi [Name], this is my last note about the PM role at Notion. If the timing isn\'t right or it\'s simply not the direction you\'re heading, I completely understand. The role will likely close within the next few weeks as we\'re in active conversations. If you\'d like to reconnect later, I\'d welcome it — Notion is building a strong product team and we\'ll have more openings as we grow. Wishing you well.',
      },
    ],
  },
  {
    label: 'TechCorp — Software Engineer (expected: FAIL — banned words + generic copy)',
    expectPass: false,
    company: 'TechCorp',
    role: 'Software Engineer',
    agentName: 'Alex Smith',
    agentBio: 'Alex Smith is a recruiter who is excited to share amazing opportunities with rockstar engineers.',
    messages: [
      {
        subject: 'Amazing opportunity for a rockstar engineer!',
        body: 'Hi there! I have an amazing opportunity that I\'m excited to share with you. We\'re looking for a rockstar engineer to join our ninja team. This is a unique opportunity that you won\'t find anywhere else. We offer competitive salary and great benefits. This could be your dream job! Please reply if you\'re interested in this exciting role.',
      },
      {
        subject: 'Amazing opportunity for a rockstar engineer!',
        body: 'Just following up on my previous message about this amazing opportunity. We really need a guru like you to join our superstar team. Don\'t miss out on this unique opportunity to join a cutting-edge company. I\'m excited to share more details with you. Please let me know if you\'re interested.',
      },
      {
        subject: 'Amazing opportunity for a rockstar engineer!',
        body: 'Hi again! I wanted to reach out one more time about this amazing job opportunity. We\'re looking for someone special, a real rockstar who can make an immediate impact. This is truly a unique opportunity at a cutting-edge company. The team is full of ninjas and gurus who are passionate about their work. Excited to share more!',
      },
      {
        subject: 'Amazing opportunity for a rockstar engineer!',
        body: 'I know you\'re busy but I just had to reach out again about this dream job opportunity. We need a superstar like you on our team. This is an amazing chance to work with industry ninjas and gurus on exciting cutting-edge projects. I\'m so excited to share this unique opportunity with you. Hope to hear from you soon!',
      },
      {
        subject: 'Amazing opportunity for a rockstar engineer!',
        body: 'Last chance to hear about this amazing opportunity! We\'re still looking for that rockstar engineer who wants a dream job. Our team of ninjas and gurus is waiting for a superstar to join them. This unique opportunity won\'t last long! I\'m excited to share the details whenever you\'re ready.',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Judge prompt — same 5 criteria our internal evalAgentConfig uses
// ---------------------------------------------------------------------------

function buildJudgePrompt(c: GoldenCase): string {
  return `You are an independent quality auditor for AI recruiting agent configurations. Evaluate against exactly 5 criteria.

Company: ${c.company}
Target role: ${c.role}
Agent name: ${c.agentName}
Agent bio: ${c.agentBio}

Messages:
${c.messages.map((m, i) => `MSG ${i + 1}:\nSubject: ${m.subject}\nBody: ${m.body}`).join('\n\n')}

Score each criterion pass/fail:
1. All messages mention "${c.company}" by name
2. No generic fluff language ("amazing opportunity", "rockstar", "cutting-edge", "ninja", "guru", "excited to share", "unique opportunity", "dream job", "superstar")
3. Messages are specific to the ${c.role} role, not generic templates
4. All subject lines are unique (no repeats)
5. Persona bio feels like a real ${c.company} employee, not a corporate bot

Return ONLY JSON: {"score":<0-5>,"criteria":[{"label":"...","pass":true/false}],"failures":["criterion text if failed"]}`
}

async function judgeCase(c: GoldenCase): Promise<{ score: number; criteria: { label: string; pass: boolean }[]; failures: string[] }> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: buildJudgePrompt(c) }],
  })
  const text = msg.content.find(b => b.type === 'text')?.text ?? ''
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return JSON.parse(text.slice(start, end + 1))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('PSView Agent — Eval Harness')
  console.log('===========================\n')
  console.log(`Golden set: ${GOLDEN_CASES.length} cases (2 known-good, 1 known-bad)\n`)

  let judgeCorrect = 0
  let totalScore = 0

  for (const c of GOLDEN_CASES) {
    console.log(`Case: ${c.label}`)
    const result = await judgeCase(c)

    for (const crit of result.criteria) {
      console.log(`  ${crit.pass ? 'PASS' : 'FAIL'} ${crit.label}`)
    }
    if (result.failures.length > 0) {
      console.log(`  Failures: ${result.failures.join(' | ')}`)
    }

    const judgeExpectedPass = c.expectPass ? result.score >= 4 : result.score <= 2
    const judgeCorrectLabel = judgeExpectedPass ? 'Judge correct' : 'Judge wrong'
    console.log(`  Score: ${result.score}/5 — ${judgeCorrectLabel}\n`)

    if (judgeExpectedPass) judgeCorrect++
    totalScore += result.score
  }

  const judgeAccuracy = Math.round((judgeCorrect / GOLDEN_CASES.length) * 100)
  const avgScore = (totalScore / GOLDEN_CASES.length).toFixed(1)

  console.log('Results')
  console.log('-------')
  console.log(`Judge accuracy: ${judgeCorrect}/${GOLDEN_CASES.length} = ${judgeAccuracy}%`)
  console.log(`Average score across cases: ${avgScore}/5`)
  console.log('\nNote: Judge accuracy tests whether the evaluator correctly identifies')
  console.log('good vs bad output. Known-good cases should score ≥ 4/5; known-bad ≤ 2/5.')
}

main().catch(console.error)
