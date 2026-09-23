'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outputDir = path.join(root, 'n8n');
const outputFile = path.join(outputDir, 'lead-qualification-workflow.json');

function nodeId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function makeNode(index, name, type, typeVersion, position, parameters, extra = {}) {
  return {
    parameters,
    id: nodeId(index),
    name,
    type,
    typeVersion,
    position,
    ...extra,
  };
}

const validateInputCode = String.raw`
function fail(message, details) {
  const error = new Error(message);
  error.name = 'ValidationError';
  error.statusCode = 400;
  error.details = details || [];
  throw error;
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return false;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || local.length > 64 || domain.length > 253) return false;
  const localPattern = /^[A-Z0-9.!#$%&'*+/=?^_{|}~-]+$/i;
  const domainPattern = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
  return localPattern.test(local) && domainPattern.test(domain);
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const envelope = $input.item.json;
if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
  fail('Webhook output must contain a JSON body object', [{ field: 'webhook', code: 'INVALID_ENVELOPE' }]);
}
if (!envelope.body || typeof envelope.body !== 'object' || Array.isArray(envelope.body)) {
  fail('Webhook payload must include a JSON body object', [{ field: 'body', code: 'MISSING_BODY' }]);
}

const input = envelope.body;
const errors = [];

const submission_id = typeof input.submission_id === 'string' ? input.submission_id.trim() : '';
if (!submission_id) errors.push({ field: 'submission_id', code: 'REQUIRED' });

const name = typeof input.name === 'string' ? input.name.trim() : '';
if (!name) errors.push({ field: 'name', code: 'REQUIRED' });

const email = typeof input.email === 'string' ? input.email.trim() : '';
if (!email) errors.push({ field: 'email', code: 'REQUIRED' });
else if (!validEmail(email)) errors.push({ field: 'email', code: 'INVALID_EMAIL' });

const message = typeof input.message === 'string' ? input.message.trim() : '';
if (!message) errors.push({ field: 'message', code: 'REQUIRED' });

const company_size = toOptionalNumber(input.company_size);
if (input.company_size !== undefined && input.company_size !== null && input.company_size !== '') {
  if (company_size === null || company_size < 1) errors.push({ field: 'company_size', code: 'INVALID_NUMBER' });
}

const budget = toOptionalNumber(input.budget);
if (input.budget !== undefined && input.budget !== null && input.budget !== '') {
  if (budget === null || budget < 0) errors.push({ field: 'budget', code: 'INVALID_NUMBER' });
}

if (errors.length) fail('Invalid lead payload', errors);

const validSources = ['website', 'linkedin', 'referral', 'partner', 'event', 'other', 'unknown'];
const rawSource = typeof input.source === 'string' ? input.source.trim().toLowerCase() : 'unknown';
const source = validSources.includes(rawSource) ? rawSource : 'unknown';

const item = {
  submission_id,
  name,
  email: email.toLowerCase(),
  company: typeof input.company === 'string' ? input.company.trim() : '',
  company_size,
  budget,
  message,
  source,
};

return [{ json: item }];
`;

const evaluateDuplicateCode = String.raw`
const merged = $input.item.json;
const rows = Array.isArray(merged.body) ? merged.body : [];
const existing = rows.length && rows[0] && rows[0].id ? rows[0].id : null;
const lead = {
  submission_id: merged.submission_id,
  name: merged.name,
  email: merged.email,
  company: merged.company,
  company_size: merged.company_size,
  budget: merged.budget,
  message: merged.message,
  source: merged.source,
};

if (existing) {
  return [{
    json: {
      duplicate: true,
      lead_id: existing,
      ...lead,
    },
  }];
}

return [{ json: { duplicate: false, ...lead } }];
`;

const respondDuplicateCode = String.raw`
const item = $input.item.json;
return [{
  json: {
    status: 'duplicate',
    submission_id: item.submission_id,
    lead_id: item.lead_id || null,
    duplicate: true,
    processed_at: new Date().toISOString(),
  },
}];
`;

const prepareLLMRequestCode = String.raw`
function getEnv(name) {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }
  if (typeof $env !== 'undefined' && $env[name]) {
    return $env[name];
  }
  return undefined;
}

const ENUMS = {
  intent: ['sales', 'support', 'partnership', 'other'],
  service: ['ai_automation', 'api_integration', 'web_development', 'other'],
  qualification: ['qualified', 'needs_review', 'unqualified'],
  priority: ['high', 'medium', 'low'],
};

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'service', 'qualification', 'priority', 'lead_score', 'human_review', 'qualification_reason', 'summary'],
  properties: {
    intent: { type: 'string', enum: ENUMS.intent },
    service: { type: 'string', enum: ENUMS.service },
    qualification: { type: 'string', enum: ENUMS.qualification },
    priority: { type: 'string', enum: ENUMS.priority },
    lead_score: { type: 'number', minimum: 0, maximum: 100 },
    human_review: { type: 'boolean' },
    qualification_reason: { type: 'string' },
    summary: { type: 'string' },
  },
};

function buildPrompt(lead) {
  const system = [
    'You are a lead qualification classifier for an AI automation services company.',
    'Classify the lead using only the provided business context.',
    'Return valid JSON matching the requested schema.',
    'Do not include chain-of-thought, markdown fences, or extra commentary.',
    'qualification_reason must be a concise business justification.',
  ].join(' ');

  const user = [
    'Analyze this lead and return the classification fields:',
    'Name: ' + (lead.name || ''),
    'Company: ' + (lead.company || ''),
    'Company size: ' + (lead.company_size === null || lead.company_size === undefined ? '' : lead.company_size),
    'Budget: ' + (lead.budget === null || lead.budget === undefined ? '' : lead.budget),
    'Message: ' + (lead.message || ''),
    'Source: ' + (lead.source || 'unknown'),
    'Fields: intent, service, qualification, priority, lead_score, human_review, qualification_reason, summary.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

const lead = $input.item.json;
const responseFormat = (getEnv('LLM_STRUCTURED_OUTPUT_MODE') || 'json_schema') === 'json_object'
  ? { type: 'json_object' }
  : { type: 'json_schema', json_schema: { name: 'lead_classification', strict: true, schema } };

const requestBody = {
  model: getEnv('LLM_MODEL') || 'gpt-4o-mini',
  temperature: 0,
  messages: buildPrompt(lead),
  response_format: responseFormat,
};

return [{ json: { lead, requestBody } }];
`;

const validateOutputCode = String.raw`
function assertValid(value) {
  const enums = {
    intent: ['sales', 'support', 'partnership', 'other'],
    service: ['ai_automation', 'api_integration', 'web_development', 'other'],
    qualification: ['qualified', 'needs_review', 'unqualified'],
    priority: ['high', 'medium', 'low'],
  };

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid LLM structured output');
  }

  for (const key of Object.keys(value)) {
    if (!Object.keys(enums).concat(['lead_score', 'human_review', 'qualification_reason', 'summary']).includes(key)) {
      throw new Error('Unexpected field: ' + key);
    }
  }

  const output = {};
  for (const key of Object.keys(enums)) {
    const raw = value[key];
    if (typeof raw !== 'string' || !enums[key].includes(raw.trim().toLowerCase())) {
      throw new Error('Invalid enum value for ' + key);
    }
    output[key] = raw.trim().toLowerCase();
  }

  const score = Number(value.lead_score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error('lead_score must be a number between 0 and 100');
  }
  output.lead_score = score;

  if (typeof value.human_review !== 'boolean') {
    throw new Error('human_review must be a boolean');
  }
  output.human_review = value.human_review;

  for (const field of ['qualification_reason', 'summary']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) {
      throw new Error(field + ' must be a non-empty string');
    }
    output[field] = value[field].trim();
  }

  return output;
}

const merged = $input.item.json;
const lead = merged.lead || {};
const content = merged.choices && merged.choices[0] && merged.choices[0].message
  ? merged.choices[0].message.content
  : undefined;

let parsed;
try {
  parsed = typeof content === 'string' ? JSON.parse(content.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '').trim()) : content;
} catch (cause) {
  const error = new Error('LLM response content was not valid JSON');
  error.name = 'InvalidClassificationError';
  error.cause = cause;
  throw error;
}

const normalized = assertValid(parsed);
return [{ json: { classification: normalized, lead } }];
`;

const applyBusinessRulesCode = String.raw`
function clampScore(score) {
  const number = Number(score);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

const incoming = $input.item.json;
const original = incoming.lead || {};
const classification = incoming.classification || {};

const record = Object.assign({}, original, classification);
record.lead_score = clampScore(classification.lead_score);

if (record.qualification === 'unqualified' || record.qualification === 'needs_review') {
  record.human_review = true;
}

if (
  original.company_size !== null &&
  original.company_size !== undefined &&
  original.company_size < 10 &&
  record.qualification === 'qualified'
) {
  record.qualification = 'needs_review';
  record.human_review = true;
  record.qualification_reason = 'Small company size; manual review recommended before committing sales effort.';
}

if (
  original.budget !== null &&
  original.budget !== undefined &&
  original.budget < 1000 &&
  record.qualification === 'qualified'
) {
  record.qualification = 'needs_review';
  record.human_review = true;
  record.qualification_reason = 'Budget below automation viability threshold; manual review recommended.';
}

if (
  record.lead_score >= 80 &&
  record.qualification === 'qualified' &&
  record.intent === 'sales'
) {
  record.priority = 'high';
}

if (record.lead_score < 40 && record.qualification === 'qualified') {
  record.priority = 'low';
}

return [{ json: record }];
`;

const respondCode = String.raw`
const merged = $input.item.json;
const body = Array.isArray(merged.body) ? merged.body : [];
const persisted = body.length && body[0] && body[0].id
  ? body[0]
  : (merged.id ? merged : null);

if (!persisted || !persisted.id) {
  return [{
    json: {
      status: 'duplicate',
      submission_id: merged.submission_id,
      lead_id: null,
      duplicate: true,
      processed_at: new Date().toISOString(),
    },
  }];
}

return [{
  json: {
    status: 'success',
    submission_id: merged.submission_id,
    lead_id: persisted.id,
    qualification: merged.qualification,
    priority: merged.priority,
    lead_score: merged.lead_score,
    human_review: merged.human_review,
    processed_at: new Date().toISOString(),
  },
}];
`;

const nodes = [
  makeNode(1, 'Webhook', 'n8n-nodes-base.webhook', 2, [0, 0], {
    httpMethod: 'POST',
    path: 'lead-qualification',
    responseMode: 'lastNode',
    options: {},
  }),
  makeNode(2, 'Validate Input', 'n8n-nodes-base.code', 2, [240, 0], {
    jsCode: validateInputCode,
  }),
  makeNode(3, 'Check Duplicate', 'n8n-nodes-base.httpRequest', 4.2, [480, 0], {
    method: 'GET',
    url: '={{ $env.SUPABASE_URL }}/rest/v1/leads?submission_id=eq.{{ $json.submission_id }}&select=id,submission_id&limit=1',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
        { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
        { name: 'Accept', value: 'application/json' },
      ],
    },
    options: {
      timeout: 30000,
      response: {
        response: {
          fullResponse: true,
        },
      },
    },
  }),
  makeNode(4, 'Merge Check + Input', 'n8n-nodes-base.merge', 3, [720, 0], {
    mode: 'combine',
    combineBy: 'combineByPosition',
    options: {},
  }),
  makeNode(5, 'Evaluate Duplicate', 'n8n-nodes-base.code', 2, [960, 0], {
    jsCode: evaluateDuplicateCode,
  }),
  makeNode(6, 'Is Duplicate?', 'n8n-nodes-base.if', 2.2, [1200, 0], {
    conditions: {
      options: {
        caseSensitive: true,
        leftValue: '',
        typeValidation: 'loose',
      },
      conditions: [
        {
          id: nodeId(61),
          leftValue: '={{ $json.duplicate }}',
          rightValue: 'true',
          operator: {
            type: 'boolean',
            operation: 'true',
          },
        },
      ],
      combinator: 'and',
    },
    options: {},
  }),
  makeNode(7, 'Respond Duplicate', 'n8n-nodes-base.code', 2, [1200, 320], {
    jsCode: respondDuplicateCode,
  }),
  makeNode(8, 'Prepare LLM Request', 'n8n-nodes-base.code', 2, [1440, 0], {
    jsCode: prepareLLMRequestCode,
  }),
  makeNode(
    9,
    'LLM HTTP Request',
    'n8n-nodes-base.httpRequest',
    4.2,
    [1680, 0],
    {
      method: 'POST',
      url: '={{ $env.LLM_API_BASE_URL }}/chat/completions',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: '=Bearer {{ $env.LLM_API_KEY }}' },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.requestBody) }}',
      options: {
        timeout: 30000,
      },
    },
    {},
  ),
  makeNode(10, 'Merge LLM + Lead', 'n8n-nodes-base.merge', 3, [1920, 0], {
    mode: 'combine',
    combineBy: 'combineByPosition',
    options: {},
  }),
  makeNode(11, 'Validate Structured Output', 'n8n-nodes-base.code', 2, [2160, 0], {
    jsCode: validateOutputCode,
  }),
  makeNode(12, 'Apply Business Rules', 'n8n-nodes-base.code', 2, [2400, 0], {
    jsCode: applyBusinessRulesCode,
  }),
  makeNode(13, 'Persist Lead', 'n8n-nodes-base.httpRequest', 4.2, [2640, 0], {
    method: 'POST',
    url: '={{ $env.SUPABASE_URL }}/rest/v1/leads?on_conflict=submission_id',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
        { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Prefer', value: 'return=representation,resolution=ignore-duplicates' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody:
      '={{ JSON.stringify({ submission_id: $json.submission_id, name: $json.name, email: $json.email, company: $json.company, company_size: $json.company_size, budget: $json.budget, message: $json.message, source: $json.source, intent: $json.intent, service: $json.service, qualification: $json.qualification, priority: $json.priority, lead_score: $json.lead_score, human_review: $json.human_review, qualification_reason: $json.qualification_reason, summary: $json.summary }) }}',
    options: {
      timeout: 30000,
      response: {
        response: {
          fullResponse: true,
        },
      },
    },
  }),
  makeNode(14, 'Merge Persist + Record', 'n8n-nodes-base.merge', 3, [2880, 0], {
    mode: 'combine',
    combineBy: 'combineByPosition',
    options: {},
  }),
  makeNode(15, 'Respond', 'n8n-nodes-base.code', 2, [3120, 0], {
    jsCode: respondCode,
  }),
];

const workflow = {
  name: 'AI Lead Qualification Automation',
  nodes,
  connections: {
    Webhook: {
      main: [[{ node: 'Validate Input', type: 'main', index: 0 }]],
    },
    'Validate Input': {
      main: [[
        { node: 'Check Duplicate', type: 'main', index: 0 },
        { node: 'Merge Check + Input', type: 'main', index: 1 },
      ]],
    },
    'Check Duplicate': {
      main: [[{ node: 'Merge Check + Input', type: 'main', index: 0 }]],
    },
    'Merge Check + Input': {
      main: [[{ node: 'Evaluate Duplicate', type: 'main', index: 0 }]],
    },
    'Evaluate Duplicate': {
      main: [[{ node: 'Is Duplicate?', type: 'main', index: 0 }]],
    },
    'Is Duplicate?': {
      main: [
        [{ node: 'Respond Duplicate', type: 'main', index: 0 }],
        [{ node: 'Prepare LLM Request', type: 'main', index: 0 }],
      ],
    },
    'Prepare LLM Request': {
      main: [[
        { node: 'LLM HTTP Request', type: 'main', index: 0 },
        { node: 'Merge LLM + Lead', type: 'main', index: 1 },
      ]],
    },
    'LLM HTTP Request': {
      main: [[{ node: 'Merge LLM + Lead', type: 'main', index: 0 }]],
    },
    'Merge LLM + Lead': {
      main: [[{ node: 'Validate Structured Output', type: 'main', index: 0 }]],
    },
    'Validate Structured Output': {
      main: [[{ node: 'Apply Business Rules', type: 'main', index: 0 }]],
    },
    'Apply Business Rules': {
      main: [[
        { node: 'Persist Lead', type: 'main', index: 0 },
        { node: 'Merge Persist + Record', type: 'main', index: 1 },
      ]],
    },
    'Persist Lead': {
      main: [[{ node: 'Merge Persist + Record', type: 'main', index: 0 }]],
    },
    'Merge Persist + Record': {
      main: [[{ node: 'Respond', type: 'main', index: 0 }]],
    },
  },
  active: false,
  settings: {
    executionOrder: 'v1',
  },
  pinData: {},
  versionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  meta: {
    templateCredsSetupCompleted: false,
  },
  tags: [],
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2) + '\n');
console.log(`Generated ${path.relative(root, outputFile)}`);
