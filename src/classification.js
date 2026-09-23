'use strict';

class ClassificationValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ClassificationValidationError';
    this.code = 'INVALID_CLASSIFICATION';
    this.details = details;
  }
}

const ENUM_VALUES = {
  intent: ['sales', 'support', 'partnership', 'other'],
  service: ['ai_automation', 'api_integration', 'web_development', 'other'],
  qualification: ['qualified', 'needs_review', 'unqualified'],
  priority: ['high', 'medium', 'low'],
};

const REQUIRED_KEYS = [
  'intent',
  'service',
  'qualification',
  'priority',
  'lead_score',
  'human_review',
  'qualification_reason',
  'summary',
];

const ALLOWED_KEYS = new Set(REQUIRED_KEYS);

const CLASSIFICATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: REQUIRED_KEYS,
  properties: {
    intent: {
      type: 'string',
      enum: ENUM_VALUES.intent,
    },
    service: {
      type: 'string',
      enum: ENUM_VALUES.service,
    },
    qualification: {
      type: 'string',
      enum: ENUM_VALUES.qualification,
    },
    priority: {
      type: 'string',
      enum: ENUM_VALUES.priority,
    },
    lead_score: {
      type: 'number',
      minimum: 0,
      maximum: 100,
    },
    human_review: {
      type: 'boolean',
    },
    qualification_reason: {
      type: 'string',
    },
    summary: {
      type: 'string',
    },
  },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getClassificationErrors(value) {
  const errors = [];

  if (!isPlainObject(value)) {
    return [
      { field: 'classification', code: 'INVALID_OBJECT' },
    ];
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push({ field: key, code: 'UNEXPECTED_FIELD' });
    }
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in value)) {
      errors.push({ field: key, code: 'MISSING' });
    }
  }

  for (const key of Object.keys(ENUM_VALUES)) {
    const rawValue =
      typeof value[key] === 'string' ? value[key].trim().toLowerCase() : value[key];
    if (typeof rawValue !== 'string' || !ENUM_VALUES[key].includes(rawValue)) {
      errors.push({ field: key, code: 'INVALID_ENUM' });
    }
  }

  const leadScore = Number(value.lead_score);
  if (!Number.isFinite(leadScore) || leadScore < 0 || leadScore > 100) {
    errors.push({ field: 'lead_score', code: 'OUT_OF_RANGE' });
  }

  if (typeof value.human_review !== 'boolean') {
    errors.push({ field: 'human_review', code: 'INVALID_BOOLEAN' });
  }

  for (const key of ['qualification_reason', 'summary']) {
    if (typeof value[key] !== 'string' || value[key].trim().length === 0) {
      errors.push({ field: key, code: 'EMPTY_STRING' });
    }
  }

  return errors;
}

function isValidClassification(value) {
  return getClassificationErrors(value).length === 0;
}

function normalizeClassification(value) {
  const errors = getClassificationErrors(value);
  if (errors.length > 0) {
    throw new ClassificationValidationError(
      'Invalid LLM structured output',
      errors,
    );
  }

  return {
    intent: value.intent.trim().toLowerCase(),
    service: value.service.trim().toLowerCase(),
    qualification: value.qualification.trim().toLowerCase(),
    priority: value.priority.trim().toLowerCase(),
    lead_score: Number(value.lead_score),
    human_review: Boolean(value.human_review),
    qualification_reason: value.qualification_reason.trim(),
    summary: value.summary.trim(),
  };
}

function parseLLMContent(content) {
  if (isPlainObject(content)) {
    return content;
  }

  if (typeof content !== 'string') {
    throw new ClassificationValidationError(
      'LLM response content must be an object or a JSON string',
      [{ field: 'content', code: 'INVALID_CONTENT' }],
    );
  }

  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new ClassificationValidationError(
      'LLM response content was not valid JSON',
      [{ field: 'content', code: 'INVALID_JSON' }],
    );
  }
}

function buildClassificationPrompt(lead) {
  const system = [
    'You are a lead qualification classifier for an AI automation services company.',
    'Classify the lead using only the provided business context.',
    'Return valid JSON matching the requested schema.',
    'Do not include chain-of-thought, markdown fences, or extra commentary.',
    'qualification_reason must be a concise business justification.',
  ].join(' ');

  const user = [
    'Analyze this lead and return the classification fields:',
    `Name: ${lead.name || ''}`,
    `Company: ${lead.company || ''}`,
    `Company size: ${lead.company_size ?? ''}`,
    `Budget: ${lead.budget ?? ''}`,
    `Message: ${lead.message || ''}`,
    `Source: ${lead.source || 'unknown'}`,
    'Fields: intent, service, qualification, priority, lead_score, human_review, qualification_reason, summary.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

module.exports = {
  CLASSIFICATION_JSON_SCHEMA,
  ClassificationValidationError,
  ENUM_VALUES,
  REQUIRED_KEYS,
  buildClassificationPrompt,
  getClassificationErrors,
  isValidClassification,
  normalizeClassification,
  parseLLMContent,
};
