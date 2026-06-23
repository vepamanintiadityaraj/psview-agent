# PSView — Autonomous Recruiting Agent

A mini web app that configures an AI recruiting agent from company context and simulates candidate conversations — no step-by-step prompting, no templates.

**Stack:** Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · Claude Sonnet 4.6 (Anthropic)

---

## What I built

Three screens, one flow:

### 1. Company Onboarding

Two ways to capture company context:

- **Website URL** — Claude web search + LinkedIn pulls real company data (name, description, culture, values, roles, size, mission). LinkedIn is auto-suggested from the domain as you type.
- **Manual entry** — a 4-question chat wizard (name → description → size → culture & values), then a full review form with AI-suggested culture/values chips marked with ✦.

Captures: who they are, culture, values, communication tone, hiring urgency, company size, mission, hiring intent, and target role.

### 2. Agent Profile

The agent configures itself: picks a name, chooses a gender (which selects the avatar), writes its own bio, defines its communication rules and no-go list, then generates a 5-message outreach sequence (Intro → Follow-up → Qualify → Value Pitch → Close). A client-side + server-side quality evaluator scores 5 criteria; any failure triggers an automatic retry with the failure list fed back to Claude.

### 3. Conversation Simulator

Chat UI where you play the candidate. The agent replies in character with:

- **Streaming text** with live extended thinking panel ("Thinking…" while tokens arrive)
- **Candidate memory** — warmth score (%), sparkline timeline chart, objections count, strategy mode
- **Handoff brief** — auto-generated structured recruiter brief after 2 agent turns
- **Candidate persona** — generate random or fill manually; name, role, company, background, concerns, tone
- Quick reply chips + "Test unexpected replies" prompts

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
URL / Manual input
  └─ /api/scrape-company        → Claude Haiku + web search → company profile JSON
       └─ CompanyForm            → User confirms / edits
            └─ /api/configure-agent    → Sonnet → personality + outreach + eval + auto-retry
                 └─ AgentProfile       → Persona · 5-message sequence · quality score · reasoning
                      └─ /api/conversation    → Sonnet streaming SSE + extended thinking (6k tokens)
                           └─ ConversationSimulator  → Live chat · memory · brief · persona
```

**Three agent subsystems:**

- **PersonalityEngine** — Company context → agent name, gender, bio, rules, avoidance list, archetype, signature trait
- **StrategyEngine** — 5-message outreach campaign with intent labels and quality scoring
- **ConversationEngine** — Stateful dialogue, extended thinking, sentiment/stage inference, warmth tracking

**Supporting APIs:**

| Route | Model | Purpose |
|-------|-------|---------|
| `/api/scrape-company` | Haiku | Research company from URL / LinkedIn |
| `/api/configure-agent` | Sonnet → Haiku fallback | Generate + eval + auto-retry pipeline |
| `/api/conversation` | Sonnet (thinking=6000) | SSE stream: thinking · delta · done · error |
| `/api/generate-persona` | Haiku | Generate fictional candidate profile |
| `/api/handoff-brief` | Haiku | Write structured recruiter handoff brief |
| `/api/suggest-culture-values` | Haiku | AI culture/values chip suggestions |

---

## Key decisions

| Decision | Reason |
|----------|--------|
| Claude Sonnet 4.6 + extended thinking | Visible chain-of-thought on configure + every chat turn |
| Anthropic web search tool | Company research from live web, not domain guessing |
| Streaming Messages API | Token-by-token replies and thinking during simulation |
| Tool-use structured output | Reliable JSON for company scrape and agent config |
| Two-pass web search extraction | First pass lets Claude search freely; second pass forces `submit_company_profile` if it wasn't called after exhausting search budget |
| Template fallback | Demo still works if API is rate-limited |

---

## What makes it intelligent?

> The agent uses Claude extended thinking to reason before every decision — configuration and conversation — and web search to research the company it's representing. It generates its own operational constraints (name, bio, rules, avoidance list), tracks conversation warmth and strategy over time, and adapts its approach based on candidate signals, with all reasoning visible as live thinking tokens plus structured candidate reads and next-move strategy notes.

---

## Edge case handling

| Scenario | Behavior |
|----------|----------|
| No website URL | LinkedIn-only research; discovered website URL is captured from tool output |
| Invalid URL | Validation error shown; form remains available |
| Research fails (both sources) | Retry with website only; if that fails, user fills profile manually |
| `submit_company_profile` not called | Two-pass fallback: second forced extraction call using gathered text |
| API rate limit | Retries with backoff; template agent fallback on configure |
| Missing culture / values | Banner shown in Culture & Values panel only; AI suggestions auto-loaded |
| Partial candidate persona (no `likelyConcerns`) | Optional-chained safely; conversation system prompt builds without crash |
| LinkedIn URL auto-fill mid-edit | Only updates when a valid suggestion exists or field is fully cleared — never wipes on backspace |

---

## Surprises fixed during review

After a Bugbot code review pass, three pre-existing reliability bugs were found and patched:

### 1. LinkedIn URL wiped on mid-edit backspace
**Where:** `CompanyForm.tsx`  
**Problem:** `suggestLinkedInFromWebsite(v)` returns `""` when the user is mid-way through typing (e.g. `"stripe"` with no dot yet). The old code called `setLinkedinUrl(suggested)` unconditionally, so every backspace wiped the auto-filled LinkedIn field.  
**Fix:** Only call `setLinkedinUrl` when `suggested` is non-empty, or when the website field is fully cleared.

### 2. `tool_choice: 'any'` didn't guarantee profile submission
**Where:** `scrape-company/route.ts`  
**Problem:** `{ type: 'any' }` forces Claude to use *some* tool but not specifically `submit_company_profile`. If Claude exhausted its `max_uses: 5` web search budget without ever calling the profile tool, `extractToolInput` found nothing and threw `"Failed to structure company profile"` — making step 1 fail silently.  
**Fix:** Changed to `{ type: 'auto' }` (natural flow) and added a two-pass fallback: if the first pass didn't call `submit_company_profile`, a second call with `{ type: 'tool', name: 'submit_company_profile' }` forces structured extraction from the gathered text — using the same strict system prompt to preserve source rules.

### 3. LinkedIn-only research discarded the discovered website
**Where:** `scrape-company/route.ts`, `prompts.ts`  
**Problem:** When only a LinkedIn URL was provided, `normalizeProfile` always set `url: extras.url ?? ''`, and `websiteUrl` was always `null` in that mode. Any website Claude discovered via LinkedIn was silently thrown away.  
**Fix:** Added `websiteUrl` to `CompanyProfilePayload` and the `submit_company_profile` tool schema. `normalizeProfile` now uses `extras.url || data.websiteUrl || ''` so discovered URLs are surfaced.

---

## Known limitations

- No conversation persistence — refresh resets the chat
- Eval harness not wired to CI

## What I'd do with more time

- Add prompt caching on the system prompt
- Wire a golden-set eval into CI to catch personality drift
- Persist conversations to Supabase with a shareable link
- Fix the build-button footer that suppresses the culture requirement message when it's the only remaining blocker
