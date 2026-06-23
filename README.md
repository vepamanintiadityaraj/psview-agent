# PSView — Autonomous Recruiting Agent

A mini web app that configures an AI recruiting agent from company context and simulates candidate conversations — no step-by-step prompting, no templates.

**Stack:** Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · Claude Sonnet 4.6 (Anthropic)

---

## What I built

Three screens, one flow:

1. **Company Onboarding** — Four ways to capture context:
   - **Website URL** — Claude web search pulls real company data
   - **Search by name** — for companies without a public site (optional industry/location hints)
   - **Paste text** — job posts, LinkedIn About, pitch deck excerpts
   - **Manual entry** — fill everything yourself, with optional AI field suggestions

   Captures: who they are, culture, values, tone, company size, mission, hiring intent, and target role.

2. **Agent Profile** — The agent configures itself: picks a name, writes its own bio, defines its communication rules and no-go list, then generates a 4-message outreach sequence. Configuration reasoning comes from Claude extended thinking.

3. **Conversation Simulator** — Chat UI where you play the candidate. The agent replies in character with streaming text, live extended thinking, candidate reads, strategy notes, sentiment, and stage tracking.

---

## How to run

```bash
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local

npm install
npm run dev
# Open http://localhost:3000
```

---

## Architecture

```
URL input
  └─ /api/scrape-company       → Claude + web search → company profile JSON
       └─ CompanyForm           → User confirms/edits
            └─ /api/configure-agent   → Personality + outreach (extended thinking)
                 └─ AgentProfile      → Persona + message sequence + reasoning trace
                      └─ /api/conversation   → Claude streaming SSE + extended thinking
                           └─ ConversationSimulator  → Live chat + reasoning panel
```

**Three agent subsystems:**

- **PersonalityEngine** — Company context → agent name, bio, rules, avoidance list, signature trait
- **StrategyEngine** — 4-message outreach campaign with intent labels
- **ConversationEngine** — Stateful dialogue, extended thinking, sentiment/stage inference

---

## Key decisions

| Decision | Reason |
|----------|--------|
| Claude Sonnet 4.6 + extended thinking | Visible chain-of-thought on configure + every chat turn |
| Anthropic web search tool | Company research from live web, not domain guessing |
| Streaming Messages API | Token-by-token replies and thinking during simulation |
| Tool-use structured output | Reliable JSON for company scrape and agent config |
| Template fallback | Demo still works if API is rate-limited |

---

## What makes it intelligent and not just an LLM call?

> The agent uses Claude extended thinking to reason before every decision — configuration and conversation — and web search to research the company it's representing. It generates its own operational constraints, tracks conversation state, and adapts strategy based on candidate signals, with reasoning visible as live thinking tokens plus structured candidate reads and next-move strategy.

---

## Known limitations

- No conversation persistence — refresh resets the chat
- Eval harness not wired to CI (time constraint)

## Edge case handling

| Scenario | Behavior |
|----------|----------|
| No URL | Use name search, paste text, or manual entry |
| Invalid URL | Validation error; form still available |
| Research fails | Error shown; user can fill profile manually |
| API rate limit | Retries with backoff; template agent fallback on configure |
| Missing values/culture | Build blocked with specific missing-field list |

Run smoke tests: `node scripts/test-edge-cases.mjs` (requires dev server)

## What I'd do with more time

- Add prompt caching on the system prompt
- Wire a golden-set eval into CI to catch personality drift
- Persist conversations to Supabase with a shareable link
