# PSView — Autonomous Recruiting Agent

A full-stack AI demo where Claude researches a company, autonomously configures a recruiter persona, and simulates a realistic candidate conversation — no templates, no step-by-step prompting.

> Built entirely with [Claude Code](https://claude.ai/code) (Anthropic's CLI) + [Cursor](https://cursor.sh). All AI features run against the [Anthropic API](https://www.anthropic.com/).

---

## What it does

Three screens. One autonomous pipeline.

### Step 1 — Company context

You give it a company. It figures out the rest.

- **Website + LinkedIn research** — Claude uses web search to pull the company's description, culture, values, mission, size, and open roles from both sources simultaneously. LinkedIn is auto-suggested as you type the domain.
- **Manual chat wizard** — if there's no public website, a 4-question conversational wizard (name → description → size → culture & values) walks you through it, then opens a full review form.
- **AI culture & values suggestions** — when research can't find culture or values, a second Haiku call auto-generates context-aware chip suggestions on mount, marked with ✦ to distinguish them from researched data.
- **Demo companies** — Stripe, Notion, and PSView load with one click and auto-research immediately.
- **Hiring urgency slider** — controls how urgently the recruiter frames outreach (Low → High, affects the generated sequence tone).

### Step 2 — Agent self-configuration

Claude builds a recruiter from scratch — no templates, no defaults.

- **Fully autonomous persona** — Claude picks the name, gender, archetype, bio, role title, communication rules, avoid list, and signature trait from the company context alone.
- **Gender-matched 3D avatar** — a photo-realistic cartoon recruiter is selected by the gender Claude chose. Shown in the profile header, each outreach message, and every chat bubble in Step 3.
- **Streaming bio** — the recruiter bio appears word-by-word within ~2 seconds of clicking Build, so there's something to read rather than a blank spinner for 40s.
- **5-message outreach sequence** — Intro → Follow-up → Qualify → Value Pitch → Close. Every message is tailored to the specific company and target role.
- **Dual quality audit** — a second Claude (Haiku) call evaluates 5 criteria independently. Any failure injects the specific failures back into the prompt and auto-retries once. The 5/5 score is shown on the Outreach tab.
- **Model fallback chain** — tries Sonnet first, falls through to Haiku on quota errors so the build rarely fails outright.

### Step 3 — Conversation simulation

You play the candidate. The agent plays itself.

- **Streaming replies with live reasoning** — Claude's extended thinking (6,000 tokens) streams into a "Thinking…" panel before each reply, then disappears when the response starts. Full thinking is expandable per message via "Show reasoning."
- **Warmth tracker** — a 0–100% warmth score updates after every turn based on sentiment, with a live SVG sparkline chart showing trajectory. Color shifts green → amber → red.
- **Strategy mode** — the agent shifts between Standard, Discovery, Objection-Handling, and Closing modes based on how the conversation is evolving.
- **Candidate persona** — generate a random fictional candidate (Haiku), or fill in name, current role, company, background, concerns, and tone manually.
- **Handoff brief** — after 2 agent messages, a "Generate" button produces a structured recruiter handoff brief with key context, objections raised, and recommended next steps.
- **Quick reply chips** — one-click common responses and "test unexpected replies" to probe how the agent handles curveballs.

---

## Robustness & rate limiting

These aren't after-thoughts — they're baked into the core flow.

| Feature | How it works |
|---------|-------------|
| **IP rate limiter** | 30 requests per IP per minute, in-memory with automatic pruning. Returns 429 before hitting Anthropic. |
| **Client retry with countdown** | On 429 or 503, the client automatically retries up to 4 times with a visible "Retrying in 5s…" countdown. No user action needed. |
| **Server-side error classification** | Distinguishes quota limits, transient overloads, and hard failures — different retry delays for each. |
| **Template fallback agent** | If the Anthropic API is unavailable during configure, a deterministic template agent is built locally from the company profile (culture, values, tone, size). The demo continues uninterrupted with a warning banner. |
| **Agent config auto-retry** | If the quality eval scores < 5/5, failures are fed back into the prompt and Claude regenerates once targeting only the failing criteria. |
| **Two-pass company extraction** | If the first research call doesn't produce a structured profile, a second forced extraction call runs on the gathered text. Research almost never silently fails. |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Models | `claude-sonnet-4-6` · `claude-haiku-4-5-20251001` |
| Streaming | Server-Sent Events (SSE) — configure + conversation routes |
| IDE | Cursor |
| AI pair programmer | Claude Code (Anthropic CLI) |

### Models by route

| Route | Model | Purpose |
|-------|-------|---------|
| `POST /api/scrape-company` | Haiku + web search | Research from URL + LinkedIn |
| `POST /api/configure-agent` | Sonnet → Haiku fallback | Stream persona + outreach; eval + auto-retry |
| `POST /api/conversation` | Sonnet (thinking = 6k tokens) | Streaming chat with extended reasoning |
| `POST /api/generate-persona` | Haiku | Random fictional candidate profile |
| `POST /api/handoff-brief` | Haiku | Structured recruiter handoff document |
| `POST /api/suggest-culture-values` | Haiku | Context-aware culture/values chip suggestions |

---

## Setup

```bash
git clone https://github.com/your-username/psview-agent
cd psview-agent
npm install

cp .env.example .env.local
# Paste your key:
# ANTHROPIC_API_KEY=sk-ant-...

npm run dev
# → http://localhost:3000
```

Only one environment variable is required. Get an API key at [console.anthropic.com](https://console.anthropic.com).

---

## Project structure

```
src/
  app/
    page.tsx                      # Step router: onboard → agent → simulate
    api/
      scrape-company/             # Company research via Claude + web search
      configure-agent/            # Streaming persona generation, eval, auto-retry
      conversation/               # Streaming SSE chat with extended thinking
      generate-persona/           # Random candidate generator
      handoff-brief/              # Recruiter handoff document
      suggest-culture-values/     # AI chip suggestions for missing culture/values
  components/
    CompanyForm.tsx               # Mode selector, URL inputs, demo buttons, streaming bio panel
    ManualChatForm.tsx            # 4-question conversational wizard
    CompanyDetailsForm.tsx        # Review form: merged culture/values, size badge, AI chips
    AgentProfile.tsx              # LinkedIn-style profile, avatar, outreach tabs, quality score
    ConversationSimulator.tsx     # Chat, memory panel, persona panel, handoff brief
  lib/
    anthropic.ts                  # Lazy Anthropic client + thinking configs
    anthropic-models.ts           # Model IDs, OUTREACH_MESSAGE_COUNT
    prompts.ts                    # System prompts, tool schemas
    company.ts                    # EMPTY_CONTEXT, DEMO_COMPANIES, canBuildAgent
    conversation.ts               # History management, META block parsing
    fallback-agent.ts             # Deterministic template agent for API outages
    ai-error.ts                   # Rate limit detection, retry delay logic
    fetch-retry.ts                # Client retry with countdown UI
    guard.ts                      # In-memory IP rate limiter
    validation.ts                 # URL normalisation
public/
  avatars/
    male.png                      # Male recruiter (3D cartoon, blue blazer)
    female.png                    # Female recruiter (3D cartoon, blue blazer)
```

---

## Drawbacks & known limitations

**Session persistence.** Company context, agent config, and current step are saved to `localStorage` on every state change and restored on mount. Refreshing the page returns you exactly where you left off — same agent, same company, same step. Note: sessions are browser-local and not shareable across devices.

**In-memory rate limiter.** The 30 req/min limiter lives in a `Map` on the server process. It resets on server restart and doesn't work across multiple instances. A real production deployment would use Redis or an edge KV store.

**LinkedIn research is inconsistent.** Claude's web search tool returns inconsistent results for LinkedIn company pages depending on the company's public profile completeness. Culture and values are frequently missing — the AI suggestions feature exists specifically because of this.

**Latency is real.** Company research takes 15–25s. Agent config takes 30–50s (the streaming bio makes this feel faster by showing content within ~2s). Conversation replies take 10–20s with extended thinking. These are upstream API round-trip times. Demo company pre-caching would address the research wait.

**No authentication.** Anyone with the URL can use the app. The rate limiter is the only protection against abuse.

**No multi-session or multi-candidate.** One agent, one candidate conversation per browser session. No branching, no A/B persona comparison.

**Template fallback is generic.** When Anthropic is rate-limited during configure, the fallback agent is built from deterministic templates rather than Claude. It works and the demo continues, but the persona depth is lower. A warning banner makes this transparent.

**LinkedIn-only research drops discovered websites.** If you provide only a LinkedIn URL, any website Claude discovers during research is currently not surfaced back to the form. This is a known limitation; fix involves adding `websiteUrl` to the extraction schema.

**Limited end-to-end testing.** API credits were constrained during development, so the full flow could not be stress-tested across a wide range of company configurations and edge cases. The core path works reliably; some less-travelled combinations may surface rough edges.

---

## Surprises we added

Features that weren't in the brief but felt necessary once the core was working.

**Streaming bio.**
Waiting 40 seconds staring at a spinner kills the demo. The agent bio now streams word-by-word within ~2 seconds of clicking Build, so you're reading a real recruiter take shape while the rest of the config generates in the background.

**Gender-matched 3D avatar.**
Claude autonomously picks the recruiter's gender as part of persona configuration. A matching 3D cartoon avatar (male or female, blue blazer) is selected and shown consistently across the profile header, every outreach message, and every chat bubble in the simulator. Small detail, big personality lift.

**Live reasoning stream.**
Extended thinking (6,000 tokens) streams into a "Thinking..." panel before each recruiter reply. You see the agent working through candidate read, detected signal, strategy, and risk flags in real time. Full thinking is also expandable per message after the fact.

**Dual quality audit with auto-retry.**
After generating the persona and outreach, a second Claude instance evaluates the output against 5 criteria independently. Any failure injects the specific failing criteria back into the prompt and regenerates once. The score is displayed on the Outreach tab so the quality gate is visible, not hidden.

**Warmth tracker with sparkline chart.**
A 0-100% warmth score updates after every conversation turn based on sentiment, with a live SVG sparkline showing the trajectory over time. Color shifts from green to amber to red. Gives an at-a-glance read on how the conversation is going without reading every message.

**Handoff brief.**
After a few exchanges, a one-click "Generate" button produces a structured recruiter handoff document: key context, objections raised, warmth level, and recommended next steps. Haiku writes it from the full conversation history.

**AI culture and values suggestions.**
When web research can't find explicit culture or values (common with smaller companies), a second Haiku call auto-generates context-aware chip suggestions on mount, marked with a ✦ to distinguish them from researched data. Keeps the form useful even when sources are thin.

**Rate limiting with client retry and template fallback.**
A 30 req/min in-memory rate limiter runs server-side. On 429 or 503, the client retries automatically up to 4 times with a visible countdown. If the Anthropic API is unavailable entirely during configure, a deterministic template agent is built locally from the company profile so the demo never hard-fails.

---

## What was built with Claude

Every file in this repository was written using **Claude Code** (Anthropic's CLI) and **Cursor**. No boilerplate generators, no external scaffolding. Claude was used for architecture decisions, feature implementation, debugging, UI polish, and this README. The Anthropic API is the only AI provider — there is no OpenAI, Gemini, or any other model in the stack.

---

## What I'd improve with more time

- **Pre-cache demo companies** — store Stripe/Notion/PSView research results statically. Demo clicks would be instant instead of 20s.
- **Prompt caching** — cache the system prompt across conversation turns to reduce cost and latency on long chats.
- **Eval CI** — wire the quality scoring into a golden-set test suite so persona drift gets caught automatically.
- **More avatar styles** — the gender-matched avatar system is designed for extension; additional styles (industry-specific, seniority-matched) could drop in as additional PNGs.
