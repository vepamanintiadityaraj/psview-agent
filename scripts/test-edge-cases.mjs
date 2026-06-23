#!/usr/bin/env node
/**
 * Smoke tests for company research API edge cases.
 * Run: node scripts/test-edge-cases.mjs (dev server on :3000)
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000'

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

const tests = [
  {
    name: 'reject empty body',
    run: () => post('/api/scrape-company', {}),
    expect: (r) => r.status === 400,
  },
  {
    name: 'reject invalid URL',
    run: () => post('/api/scrape-company', { mode: 'url', url: 'not-a-url' }),
    expect: (r) => r.status === 400 && r.data.error,
  },
  {
    name: 'reject URL without TLD',
    run: () => post('/api/scrape-company', { mode: 'url', url: 'localhost' }),
    expect: (r) => r.status === 400,
  },
  {
    name: 'reject name search without name',
    run: () => post('/api/scrape-company', { mode: 'name' }),
    expect: (r) => r.status === 400,
  },
  {
    name: 'reject describe with short text',
    run: () => post('/api/scrape-company', { mode: 'describe', text: 'short' }),
    expect: (r) => r.status === 400,
  },
  {
    name: 'reject enrich without description',
    run: () => post('/api/scrape-company', { mode: 'enrich', name: 'Acme' }),
    expect: (r) => r.status === 400,
  },
  {
    name: 'reject configure-agent without context',
    run: () => post('/api/configure-agent', { targetRole: 'Engineer' }),
    expect: (r) => r.status === 400,
  },
  {
    name: 'reject configure-agent missing values',
    run: () =>
      post('/api/configure-agent', {
        targetRole: 'Engineer',
        companyContext: {
          name: 'Test Co',
          description: 'A test company',
          industry: 'Tech',
          culture: ['Fast-paced'],
          values: [],
          tone: 50,
          rolesHired: [],
          url: '',
        },
      }),
    expect: (r) => r.status === 400 && r.data.error?.includes('value'),
  },
  {
    name: 'reject conversation without candidate reply',
    run: () =>
      post('/api/conversation', {
        personality: { name: 'Alex', role: 'Recruiter', bio: 'bio', communicationRules: ['r'], avoidList: ['a'], signatureTrait: 't' },
        companyContext: { name: 'Co', description: 'd', industry: 'Tech', culture: ['c'], values: ['v'], tone: 50, rolesHired: [], url: '' },
        conversationHistory: [{ role: 'agent', content: 'Hi', timestamp: 1 }],
      }),
    expect: (r) => r.status === 400,
  },
  {
    name: 'describe mode extracts from pasted text',
    run: () =>
      post('/api/scrape-company', {
        mode: 'describe',
        text: `Stripe is a financial infrastructure platform for businesses. We help companies accept payments, send payouts, and manage revenue online. Our culture values rigor, curiosity, and user focus. We hire software engineers, product managers, and designers globally.`,
      }),
    expect: (r) => r.status === 200 && r.data.name && r.data.description,
    slow: true,
  },
]

let passed = 0
let failed = 0

console.log(`Testing against ${BASE}\n`)

for (const t of tests) {
  if (t.slow && process.env.SKIP_SLOW) {
    console.log(`⏭  ${t.name} (skipped)`)
    continue
  }
  try {
    const result = await t.run()
    const ok = t.expect(result)
    if (ok) {
      console.log(`✓  ${t.name}`)
      passed++
    } else {
      console.log(`✗  ${t.name}`, result.status, result.data)
      failed++
    }
  } catch (e) {
    console.log(`✗  ${t.name} — ${e.message}`)
    failed++
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
