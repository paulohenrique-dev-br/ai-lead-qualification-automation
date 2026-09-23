'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ClassificationValidationError,
  buildClassificationPrompt,
  getClassificationErrors,
  isValidClassification,
  normalizeClassification,
  parseLLMContent,
} = require('../src/classification');

const validClassification = {
  intent: 'sales',
  service: 'ai_automation',
  qualification: 'qualified',
  priority: 'high',
  lead_score: 88,
  human_review: false,
  qualification_reason: 'Clear budget and stated automation need.',
  summary: 'Acme needs sales process automation across regional teams.',
};

test('accepts a valid classification', () => {
  assert.equal(isValidClassification(validClassification), true);
  assert.deepEqual(normalizeClassification(validClassification), {
    ...validClassification,
    qualification_reason: validClassification.qualification_reason,
    summary: validClassification.summary,
  });
});

test('rejects an invalid enum value', () => {
  const value = { ...validClassification, intent: 'magic' };
  assert.equal(isValidClassification(value), false);
  assert.ok(getClassificationErrors(value).some((d) => d.field === 'intent'));
  assert.throws(
    () => normalizeClassification(value),
    ClassificationValidationError,
  );
});

test('rejects a lead score outside 0-100', () => {
  assert.equal(
    isValidClassification({ ...validClassification, lead_score: 101 }),
    false,
  );
  assert.equal(
    isValidClassification({ ...validClassification, lead_score: -1 }),
    false,
  );
});

test('rejects a non-boolean human_review', () => {
  assert.equal(
    isValidClassification({ ...validClassification, human_review: 'yes' }),
    false,
  );
});

test('rejects unexpected fields to keep the contract predictable', () => {
  assert.equal(
    isValidClassification({ ...validClassification, chain_of_thought: 'nope' }),
    false,
  );
});

test('parses JSON objects and JSON strings, including code fences', () => {
  assert.deepEqual(parseLLMContent(validClassification), validClassification);
  assert.deepEqual(
    parseLLMContent(`\`\`\`json\n${JSON.stringify(validClassification)}\n\`\`\``),
    validClassification,
  );
});

test('rejects non-JSON content', () => {
  assert.throws(
    () => parseLLMContent('not json at all'),
    ClassificationValidationError,
  );
});

test('builds a prompt without asking for chain-of-thought', () => {
  const prompt = buildClassificationPrompt({
    name: 'John Smith',
    company: 'Acme',
    company_size: 85,
    budget: 12000,
    message: 'We need automation.',
    source: 'website',
  });

  assert.match(prompt[0].content, /Do not include chain-of-thought/i);
  assert.match(prompt[1].content, /John Smith/);
});
