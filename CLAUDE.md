# PSView Agent — Project Context for AI Assistants

Read this file before making changes. Also follow `AGENTS.md` (Next.js 16 breaking changes — check `node_modules/next/dist/docs/`).

---

## What this app is

**PSView** is a take-home / demo app: an **autonomous recruiting agent** that:

1. Researches a company (website + **required** LinkedIn)
2. **Self-configures** a recruiter persona + 5-message outreach sequence
3. **Simulates** a candidate conversation with streaming replies

**Stack:** Next.js 16 · TypeScript · Tailwind 4 · shadcn/ui · Anthropic Claude API (`@anthropic-ai/sdk`)

**UI:** Clean light theme — white background, black text, minimal borders. No shaders, shimmer, or Tron effects (removed).

---

## Environment

```bash
cp .env.example .env.local
# Required:
ANTHROPIC_API_KEY=sk-ant-...

npm install
npm run dev   # http://localhost:3000
```

Never commit `.env.local`.

---

## Three-step flow

| Step | Component | API |
|------|-----------|-----|
| 1 Company | `CompanyForm` + `CompanyDetailsForm` | `POST /api/scrape-company` |
| 2 Agent | `AgentProfile` (LinkedIn-style profile UI) | `POST /api/configure-agent` |
| 3 Simulate | `ConversationSimulator` | `POST /api/conversation` (SSE) |

Routing: `src/app/page.tsx` — step state `onboard | agent | simulate`.

---

## Product decisions (important)

### Who decides the recruiter character?

**Hybrid model (intentional):**

| Company provides | System generates |
|------------------|------------------|
| Culture, values, tone slider | Recruiter name |
| Hiring intent, target role | Bio, role title |
| Company context from research | Communication rules, avoid list |
| | 5-message outreach sequence |

The company **does not** pick the recruiter persona directly — they shape it via tone/culture/values/intent. The agent **autonomously** invents a believable employee at that company. This is core to the demo narrative.

If adding a “pick your recruiter” feature later, keep tone/culture as constraints and only expose optional overrides (name, seniority).

### LinkedIn is required for web research

For `mode: url` and `mode: name`, **`linkedinUrl` is required** (API returns 400 if missing).

- Website → description, mission, careers, culture/values (if explicitly stated)
- LinkedIn → **always** researched for size, About, industry, supplemental culture/values
- Culture/values: **only** from official website or LinkedIn — never inferred from news/reviews
- If not found → empty arrays + `needsManualInput: ['culture'|'values']` + UI prompts manual entry

`describe` and `manual` modes do not require LinkedIn at research time (profile form still has LinkedIn field).

Auto-suggest: entering `stripe.com` pre-fills `linkedin.com/company/stripe` via `suggestLinkedInFromWebsite()`.

### Outreach sequence: 5 messages

`OUTREACH_MESSAGE_COUNT = 5` in `src/lib/anthropic-models.ts`.

Industry standard cold sequence: intro → follow-up → qualify → nudge → **breakup/close**. Four is minimum; five includes graceful close.

### Roles

- **`rolesHired`** — optional multi-select; roles seen on careers page (context)
- **`targetRole`** — required **single** role; one agent session = one hire

### Reasoning visibility

- **Configure agent:** extended thinking **disabled** for speed (~20–45s vs ~90s)
- **Conversation:** thinking runs server-side but **not shown live**; user clicks **“Show reasoning”** per message
- **Agent profile:** “Configuration reasoning” collapsed by default

### Unexpected candidate replies

Conversation prompt handles hostile, opt-out, confused, off-topic, gibberish.

`META` includes `responseCategory`: `expected|unexpected|hostile|off-topic|confused`.

UI: “Test unexpected replies” quick chips in simulator.

---

## API routes

### `POST /api/scrape-company`

Modes: `url` | `name` | `describe` | `enrich`

- Uses Claude Haiku + web search tool + `submit_company_profile` tool
- Strict system prompt: `WEBSITE_RESEARCH_SYSTEM` in `src/lib/prompts.ts`
- Returns `needsManualInput` array when culture/values missing from sources

### `POST /api/configure-agent`

- Claude Sonnet (fallback: Haiku)
- **No extended thinking** (`CONFIGURE_THINKING_BUDGET = 0`)
- Tool: `submit_agent_config` — no forced `tool_choice` (incompatible with thinking)
- `allowFallback: true` → `buildFallbackAgentConfig()` from `src/lib/fallback-agent.ts`
- Body: `{ companyContext, targetRole, allowFallback? }`

### `POST /api/conversation`

- SSE events: `delta`, `done`, `error` (thinking collected server-side, not streamed to UI)
- Extended thinking enabled (`CONVERSATION_THINKING_BUDGET = 6000`)
- Parses `<META>{...}</META>` block from reply via `src/lib/conversation.ts`

---

## Key files

```
src/
  app/
    page.tsx                    # Step router + header nav
    api/scrape-company/route.ts
    api/configure-agent/route.ts
    api/conversation/route.ts
    globals.css                 # Light theme + .panel utility
  components/
    CompanyForm.tsx             # Entry modes + build agent
    CompanyDetailsForm.tsx      # Profile fields, culture, values, roles
    AgentProfile.tsx            # LinkedIn-style step 2
    ConversationSimulator.tsx   # Chat + outreach tabs
    CompanyContextCard.tsx
  lib/
    anthropic.ts                # Lazy client, thinking configs
    anthropic-models.ts         # Models, OUTREACH_MESSAGE_COUNT
    prompts.ts                  # System prompts + Anthropic tool schemas
    company.ts                  # EMPTY_CONTEXT, canBuildAgent, DEMO_COMPANIES
    conversation.ts             # History + META parsing
    fallback-agent.ts           # Template agent when API fails
    ai-error.ts                 # Rate limit / retry helpers
    fetch-retry.ts              # Client retry with backoff
    validation.ts               # normalizeUrl, normalizeLinkedInUrl
  types/index.ts                # CompanyContext, AgentConfig, ConversationMessage
```

---

## Types (`src/types/index.ts`)

**CompanyContext:** `name`, `url`, `linkedinUrl`, `description`, `industry`, `culture[]`, `values[]`, `tone` (0–100), `rolesHired[]`, `mission?`, `companySize?`, `hiringIntent?`, `source`

**AgentConfig:** `personality`, `messageSequence[]`, `companyContext`, `targetRole?`, `fallback?`, `warning?`

**ConversationMessage:** `role`, `content`, `reasoning?`, `sentiment?`, `candidateRead?`, `nextStrategy?`, `riskFlags?`, `responseCategory?`

---

## Anthropic patterns

- API key: lazy init in `getAnthropic()` — read at request time from `ANTHROPIC_API_KEY`
- Web search tool: `WEB_SEARCH_TOOL` cast in `anthropic.ts`
- Tool schemas: `COMPANY_PROFILE_TOOL`, `AGENT_CONFIG_TOOL` in `prompts.ts` — typed as `Anthropic.Tool`
- **Do not** use `tool_choice: { type: 'tool', name }` with extended thinking enabled

---

## UI conventions

- Use `.panel` class: `rounded-lg border border-border bg-card`
- Use shadcn `Button`, `Input`, `Badge` — no `ShimmerButton` (deleted)
- `AppShell` is plain `bg-background` — no WebGL/Tron background
- Agent profile uses LinkedIn blue `#0a66c2` for accents on step 2 only

---

## Build / configure performance

Slow configure was caused by 10k thinking tokens + 4 long messages. Fixed by:

- Disabling thinking on configure
- Shorter message bodies (100–130 words)
- `max_tokens: 10000`
- UI shows elapsed seconds on build button

---

## Testing

```bash
npm run build
npm run dev
node scripts/test-edge-cases.mjs   # smoke tests, needs dev server
```

---

## Known limitations

- No DB — refresh loses conversation
- In-memory rate limiter (`src/lib/guard.ts`)
- LinkedIn scraping depends on Claude web search quality
- Template fallback agent if Anthropic rate-limited

---

## Git / commits

Only commit when the user explicitly asks. Do not commit `.env.local`.

---

## Common tasks

| Task | Where to change |
|------|-----------------|
| Change outreach count | `OUTREACH_MESSAGE_COUNT`, configure prompt, `fallback-agent.ts` |
| Stricter company research | `WEBSITE_RESEARCH_SYSTEM`, `scrape-company/route.ts` |
| Faster configure | `CONFIGURE_THINKING_BUDGET`, model order in `CONFIGURE_MODELS` |
| Conversation behavior | `buildConversationSystemInstruction` in `prompts.ts` |
| UI theme | `globals.css` `:root` variables |

---

## Deleted / unused (do not re-add without reason)

- `shimmer-bg-text.tsx`, `hero-section-dark.tsx`, `glowing-card.tsx`, `web-gl-shader.tsx`
- `FlowWaveBackground.tsx`, `CompanyOnboardingChat.tsx`
- Gemini integration (`@google/genai`) — fully migrated to Anthropic
