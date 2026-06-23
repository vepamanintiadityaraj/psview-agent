# PSView Agent — Project Context for AI Assistants

Read this file before making changes.

---

## What this app is

**PSView** is a demo app: an **autonomous recruiting agent** that:

1. Researches a company (website + LinkedIn) or accepts manual input via a chat wizard
2. **Self-configures** a recruiter persona (name, gender, bio, outreach) from company context
3. **Simulates** a candidate conversation with streaming replies and live reasoning

**Stack:** Next.js 16 · TypeScript · Tailwind 4 · shadcn/ui · Anthropic Claude API (`@anthropic-ai/sdk`)

**UI:** Clean light theme — white background, black text, minimal borders. No shaders, shimmer, or Tron effects.

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
| 1 Company | `CompanyForm` → `CompanyDetailsForm` | `POST /api/scrape-company` |
| 2 Agent | `AgentProfile` (LinkedIn-style profile UI) | `POST /api/configure-agent` |
| 3 Simulate | `ConversationSimulator` | `POST /api/conversation` (SSE) |

Routing: `src/app/page.tsx` — step state `onboard | agent | simulate`.

---

## Step 1 — Company context

### Entry modes (only two)

- **Website** (`url`): enter company URL + LinkedIn → research via Haiku + web search
- **Manual** (`manual`): chat wizard (4 questions: name, description, size, culture & values) → then review form

Search and Paste Text modes were removed. `EntryMode = 'url' | 'manual'`.

### Manual chat wizard (`ManualChatForm.tsx`)

4 questions only:
1. Company name
2. What they do (description)
3. Company size
4. Culture & values (combined, comma-separated → split into both `culture[]` and `values[]`)

After chat → shows full `CompanyDetailsForm` for review (website, LinkedIn, tone, roles, target role, hiring intent filled there).

### Company details form (`CompanyDetailsForm.tsx`)

- **Culture & Values are merged into one panel** (two sub-sections inside, not two separate panels)
- **Company size**: if researched value exists, shows as a `Badge` with "Change" link — no option buttons shown unless empty
- **AI suggestions** (`/api/suggest-culture-values`): auto-fetches on mount when `needsManualInput` contains culture/values. Returns suggested chips marked with `✦`. Only fires once per mount via `fetchedRef`.
- LinkedIn URL: after research, falls back to the URL we sent if API response omits it

### LinkedIn requirement

For `mode: url`, `linkedinUrl` is required. Auto-suggested from website domain via `suggestLinkedInFromWebsite()`.
Demo companies: PSView, Stripe, Notion — clicking pre-fills URL and LinkedIn, then auto-researches.

---

## Step 2 — Agent profile (`AgentProfile.tsx`)

### Recruiter persona

Claude autonomously chooses: name, **gender** (`male | female`), role title, archetype, bio, communication rules, avoid list, signature trait.

Gender is in `AgentPersonality` type and `AGENT_CONFIG_TOOL` schema. Claude picks it; the UI uses it to select the avatar image.

### Avatar images

- `public/avatars/male.png` — male recruiter (3D cartoon, bearded, blue blazer)
- `public/avatars/female.png` — female recruiter (3D cartoon, dark hair, blue blazer)

Both AgentProfile and ConversationSimulator use `personality.gender` to pick the avatar. Falls back to initials/Bot icon if image errors.

### Quality scoring

`computeQualityScore` in `AgentProfile.tsx` has 5 client-side criteria. Server-side eval (`evalAgentConfig` in configure-agent route) also scores 5 criteria.

Auto-retry fires when `evalResult.score < 5` (any criterion failure triggers one retry with failure feedback). Retry threshold was lowered from `< 3` to `< 5` to always aim for 5/5.

Generate prompt explicitly forbids: `"rockstar"`, `"ninja"`, `"guru"`, `"superstar"`, `"amazing opportunity"`, `"unique opportunity"`, `"dream job"`, `"excited to share"`. Word count per message: 100–200 words.

Client-side word count range: 50–300 words (was 50–250).

### Outreach sequence

5 messages: intro → follow-up → qualify → nudge → close. `OUTREACH_MESSAGE_COUNT = 5`.

### Tabs

- **About**: bio, signature trait, experience card, collapsed "Configuration reasoning"
- **Outreach · 5**: message sequence with tags (FIRST TOUCH / FOLLOW-UP / QUALIFY / VALUE PITCH / CLOSE) + quality score panel
- **Guidelines**: communication rules + avoid list

---

## Step 3 — Conversation simulator (`ConversationSimulator.tsx`)

### Sidebar panels

**Candidate persona panel:**
- No persona: two buttons — "Generate random" (calls `/api/generate-persona`) or "Enter details" (inline form)
- Enter details form: name, current role, current company, background, concerns (comma-separated), tone (select)
- After persona set: shows profile + "Regenerate" + "Edit" links
- Concern badges: `whitespace-normal break-words max-w-full` to prevent overflow

**Candidate Memory panel:**
- Warmth % with color bar (green/amber/red)
- Warmth timeline chart (SVG sparkline, `WarmthChart` component)
- Objections count, key concern, strategy mode

**Handoff Brief panel** (appears after 2 agent messages):
- "Generate" / "Refresh" → calls `/api/handoff-brief`
- Renders via `BriefRenderer` (lightweight markdown → JSX, handles `**bold**`, bullets, quoted lines)

### Live reasoning stream

While agent is thinking (before first reply token arrives), shows a "Thinking..." panel with last 380 chars of the thinking stream. SSE event `thinking` is emitted from the conversation route. Panel hides when first reply delta arrives.

### Chat UX

- Agent avatar: uses `personality.gender`-matched PNG, falls back to Bot icon
- Warmth updates each turn based on sentiment
- "Test unexpected replies" chips + "Quick replies" chips
- "Show reasoning" per message (candidateRead, nextStrategy, riskFlags, full thinking)
- Candidate name shows `persona.name` when persona is set

---

## API routes

| Route | Model | Purpose |
|-------|-------|---------|
| `POST /api/scrape-company` | Haiku | Research company from URL/name/text. Returns `needsManualInput[]` |
| `POST /api/configure-agent` | Sonnet → Haiku fallback | Generate persona + outreach. SSE: `step`, `done`, `error`. Eval + auto-retry |
| `POST /api/conversation` | Sonnet (thinking=6000) | SSE: `thinking`, `delta`, `done`, `error`. Parses `<META>` block |
| `POST /api/generate-persona` | Haiku | Generate fictional candidate profile |
| `POST /api/handoff-brief` | Haiku | Write structured recruiter handoff brief |
| `POST /api/suggest-culture-values` | Haiku | Suggest culture traits + values from company description |

---

## Key files

```
src/
  app/
    page.tsx                              # Step router + header nav
    api/scrape-company/route.ts
    api/configure-agent/route.ts          # Generate → eval → auto-retry pipeline
    api/conversation/route.ts             # Streaming SSE with thinking
    api/generate-persona/route.ts
    api/handoff-brief/route.ts
    api/suggest-culture-values/route.ts   # NEW: AI culture/values suggestions
    globals.css                           # Light theme + .panel utility
  components/
    CompanyForm.tsx                       # Website + Manual modes, demo buttons
    ManualChatForm.tsx                    # NEW: 4-question chat wizard for manual entry
    CompanyDetailsForm.tsx                # Review form: merged culture/values, size badge, AI suggestions
    AgentProfile.tsx                      # LinkedIn-style profile, avatar, quality score
    ConversationSimulator.tsx             # Chat + outreach tabs, persona, memory, brief
    CompanyContextCard.tsx
  lib/
    anthropic.ts                          # Lazy client, thinking configs
    anthropic-models.ts                   # Models, OUTREACH_MESSAGE_COUNT
    prompts.ts                            # System prompts + Anthropic tool schemas
    company.ts                            # EMPTY_CONTEXT, canBuildAgent, DEMO_COMPANIES, suggestLinkedInFromWebsite
    conversation.ts                       # History + META parsing
    fallback-agent.ts                     # Template agent when API fails
    ai-error.ts                           # Rate limit / retry helpers
    fetch-retry.ts                        # Client retry with backoff
    validation.ts                         # normalizeUrl, normalizeLinkedInUrl
  types/index.ts                          # All types
public/
  avatars/
    male.png                              # Male recruiter avatar (3D cartoon)
    female.png                            # Female recruiter avatar (3D cartoon)
```

---

## Types (`src/types/index.ts`)

**CompanyContext:** `name`, `url`, `linkedinUrl?`, `description`, `industry`, `culture[]`, `values[]`, `tone` (0–100), `rolesHired[]`, `mission?`, `companySize?`, `hiringIntent?`, `source`

**AgentPersonality:** `name`, `role`, `bio`, `communicationRules[]`, `avoidList[]`, `signatureTrait`, `reasoningTrace?`, `archetype?`, `gender?: 'male' | 'female'`

**AgentConfig:** `personality`, `messageSequence[]`, `companyContext`, `targetRole?`, `fallback?`, `warning?`, `autoRetried?`, `evalCriteria?`

**CandidatePersona:** `name`, `currentRole`, `currentCompany`, `background`, `likelyConcerns[]`, `tone: 'direct'|'skeptical'|'friendly'|'busy'|'curious'`

**ConversationMessage:** `role`, `content`, `reasoning?`, `sentiment?`, `candidateRead?`, `nextStrategy?`, `riskFlags?`, `responseCategory?`, `timestamp`

---

## Anthropic patterns

- API key: lazy init in `getAnthropic()` — read at request time from `ANTHROPIC_API_KEY`
- Web search tool: `WEB_SEARCH_TOOL` cast in `anthropic.ts`
- Tool schemas: `COMPANY_PROFILE_TOOL`, `AGENT_CONFIG_TOOL` in `prompts.ts` — typed as `Anthropic.Tool`
- **Do not** use `tool_choice: { type: 'tool', name }` with extended thinking enabled
- `gender` field is in `AGENT_CONFIG_TOOL` personality schema and is required

---

## UI conventions

- Use `.panel` class: `rounded-lg border border-border bg-card`
- Use shadcn `Button`, `Input`, `Badge`, `Textarea`, `Slider`
- Agent profile uses LinkedIn blue `#0a66c2` for accents on step 2 only
- Tone slider: "Very Formal" (left) → "Very Casual" (right), badge above shows current label
- Badge overflow: always add `whitespace-normal break-words max-w-full` to badges in flex containers

---

## Intelligence features (all live)

| Feature | Where |
|---------|-------|
| Live reasoning stream | `ConversationSimulator` + `api/conversation` SSE `thinking` event |
| Warmth timeline chart | `WarmthChart` SVG component inside `CandidateMemoryPanel` |
| Candidate persona generator | `/api/generate-persona` + inline manual form |
| Handoff brief | `/api/handoff-brief` + `BriefRenderer` markdown component |
| AI culture/values suggestions | `/api/suggest-culture-values` auto-called on mount |
| Recruiter avatar | `public/avatars/{male,female}.png` selected by `personality.gender` |

---

## Configure pipeline

```
1. buildConfigureSystemInstruction(companyContext)   ← system prompt
2. buildUserPrompt(companyContext, targetRole)        ← includes quality requirements
3. generateConfig() → Claude Sonnet (or Haiku fallback)
4. evalAgentConfig() → Haiku scores 5 criteria
5. if score < 5: retry with buildRetryPrompt(failures)
6. send SSE: step (1→2→3), done, error
```

Configure thinking is **disabled** (`CONFIGURE_THINKING_BUDGET = 0`) for speed.

---

## Known limitations

- No DB — refresh loses conversation state
- In-memory rate limiter (`src/lib/guard.ts`)
- LinkedIn scraping quality depends on Claude web search
- Template fallback agent if Anthropic rate-limited

---

## Git / commits

Only commit when the user explicitly asks. Do not commit `.env.local`.

---

## Common tasks

| Task | Where to change |
|------|-----------------|
| Change outreach count | `OUTREACH_MESSAGE_COUNT`, configure prompt, `fallback-agent.ts` |
| Add/remove entry mode | `EntryMode` type + `ENTRY_MODES` array in `CompanyForm.tsx` |
| Stricter company research | `WEBSITE_RESEARCH_SYSTEM` in `prompts.ts` |
| Faster configure | `CONFIGURE_MODELS` order in `anthropic-models.ts` |
| Conversation behavior | `buildConversationSystemInstruction` in `prompts.ts` |
| UI theme | `globals.css` `:root` variables |
| Add new avatar | Drop PNG in `public/avatars/`, update path in `AgentProfile` + `ConversationSimulator` |
| Change quality criteria | `computeQualityScore` in `AgentProfile.tsx` + `evalAgentConfig` prompt in `configure-agent/route.ts` |

---

## Deleted / unused (do not re-add without reason)

- `shimmer-bg-text.tsx`, `hero-section-dark.tsx`, `glowing-card.tsx`, `web-gl-shader.tsx`
- `FlowWaveBackground.tsx`, `CompanyOnboardingChat.tsx`
- Gemini integration (`@google/genai`) — fully migrated to Anthropic
- Entry modes `name` (Search) and `describe` (Paste text) — removed, only `url` and `manual` remain
