export interface CompanyContext {
  name: string
  url: string
  linkedinUrl?: string
  description: string
  culture: string[]
  tone: number // 0 = formal, 100 = casual
  rolesHired: string[]
  values: string[]
  industry: string
  mission?: string
  companySize?: string
  hiringIntent?: string
  urgency?: number // 0 = low urgency, 100 = high urgency
  source?: 'url' | 'name' | 'describe' | 'manual'
}

export interface AgentPersonality {
  name: string
  role: string
  bio: string
  communicationRules: string[]
  avoidList: string[]
  signatureTrait: string
  reasoningTrace?: string
  archetype?: string
  gender?: 'male' | 'female'
}

export interface OutreachMessage {
  id: string
  subject: string
  body: string
  intent: string
  tone: string
}

export interface AgentConfig {
  personality: AgentPersonality
  messageSequence: OutreachMessage[]
  companyContext: CompanyContext
  targetRole?: string
  fallback?: boolean
  warning?: string
  autoRetried?: boolean
  evalCriteria?: { label: string; pass: boolean }[]
}

export interface CandidatePersona {
  name: string
  currentRole: string
  currentCompany: string
  background: string
  likelyConcerns: string[]
  tone: 'direct' | 'skeptical' | 'friendly' | 'busy' | 'curious'
}

export interface ConversationMessage {
  role: 'agent' | 'candidate'
  content: string
  reasoning?: string
  sentiment?: 'warm' | 'neutral' | 'cold' | 'interested' | 'disengaged'
  candidateRead?: string
  nextStrategy?: string
  riskFlags?: string
  responseCategory?: 'expected' | 'unexpected' | 'hostile' | 'off-topic' | 'confused'
  timestamp: number
}

