// API response schema helpers — structured tool outputs enforce exact JSON shape on every call.
// Using these eliminates all JSON.parse failures and regex cleanup.

export const COMPANY_SCHEMA = {
  type: 'object',
  properties: {
    name:          { type: 'string' },
    description:   { type: 'string' },
    industry:      { type: 'string' },
    culture:       { type: 'array', items: { type: 'string' } },
    values:        { type: 'array', items: { type: 'string' } },
    rolesHired:    { type: 'array', items: { type: 'string' } },
    suggestedTone: { type: 'number' },
    mission:       { type: 'string' },
    companySize:   { type: 'string' },
  },
  required: ['name', 'description', 'industry', 'suggestedTone'],
}

export const AGENT_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    personality: {
      type: 'object',
      properties: {
        name:               { type: 'string' },
        role:               { type: 'string' },
        bio:                { type: 'string' },
        communicationRules: { type: 'array', items: { type: 'string' } },
        avoidList:          { type: 'array', items: { type: 'string' } },
        signatureTrait:     { type: 'string' },
      },
      required: ['name', 'role', 'bio', 'communicationRules', 'avoidList', 'signatureTrait'],
    },
    messageSequence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:             { type: 'string' },
          subject:        { type: 'string' },
          body:           { type: 'string' },
          intent:         { type: 'string' },
          tone:           { type: 'string' },
        },
        required: ['id', 'subject', 'body', 'intent', 'tone'],
      },
    },
  },
  required: ['personality', 'messageSequence'],
}

export const CONVERSATION_SCHEMA = {
  type: 'object',
  properties: {
    reply:           { type: 'string' },
    sentiment:       { type: 'string', enum: ['warm', 'neutral', 'cold', 'interested', 'disengaged'] },
    stage:           { type: 'string', enum: ['opening', 'engaging', 'qualifying', 'closing'] },
    signalDetected:  { type: 'string' },
  },
  required: ['reply', 'sentiment', 'stage', 'signalDetected'],
}
