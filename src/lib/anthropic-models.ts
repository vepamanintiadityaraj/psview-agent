export const CONFIGURE_MODELS = [
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
] as const

export const DEFAULT_MODEL = 'claude-sonnet-4-6'
export const FAST_MODEL = 'claude-haiku-4-5-20251001'

/** Cold-outreach sequences typically use 4–6 touches over 2–3 weeks; we generate 5. */
export const OUTREACH_MESSAGE_COUNT = 5

export const CONVERSATION_THINKING_BUDGET = 6_000
export const CONFIGURE_THINKING_BUDGET = 0
