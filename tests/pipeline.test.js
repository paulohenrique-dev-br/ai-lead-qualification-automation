'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { processLead } = require('../src/pipeline');
const { ClassificationValidationError } = require('../src/classification');

function fixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'),
  );
}

const validClassification = {
  intent: 'sales',
  service: 'ai_automation',
  qualification: 'qualified',
  priority: 'medium',
  lead_score: 88,
  human_review: false,
  qualification_reason: 'Clear budget and stated automation need.',
  summary: 'Acme needs sales process automation.',
};

test('classifies a valid lead and returns the complete record', async () => {
  let classifierCalls = 0;
  const result = await processLead(
    fixture('high-value-ai-automation.json'),
    {
      isDuplicate: async () => false,
      classify: async () => {
        classifierCalls += 1;
        return validClassification;
      },
    },
  );

  assert.equal(result.status, 'success');
  assert.equal(result.lead.intent, 'sales');
  assert.equal(result.lead.priority, 'high');
  assert.equal(classifierCalls, 1);
});

test('returns a predictable duplicate result without calling the classifier', async () => {
  let classifierCalls = 0;
  const result = await processLead(fixture('duplicate-submission.json'), {
    isDuplicate: async () => true,
    classify: async () => {
      classifierCalls += 1;
      return validClassification;
    },
  });

  assert.equal(result.status, 'duplicate');
  assert.equal(
    result.submission_id,
    '550e8400-e29b-41d4-a716-446655440001',
  );
  assert.equal(classifierCalls, 0);
});

test('does not send an invalid payload to the classifier', async () => {
  let classifierCalls = 0;

  await assert.rejects(
    () =>
      processLead(fixture('invalid-email.json'), {
        isDuplicate: async () => false,
        classify: async () => {
          classifierCalls += 1;
          return validClassification;
        },
      }),
    /Invalid lead payload/,
  );

  assert.equal(classifierCalls, 0);
});

test('rejects a corrupt classification instead of treating it as success', async () => {
  await assert.rejects(
    () =>
      processLead(fixture('high-value-ai-automation.json'), {
        isDuplicate: async () => false,
        classify: async () => ({
          intent: 'sales',
          service: 'ai_automation',
          qualification: 'qualified',
          priority: 'high',
          lead_score: 88,
          human_review: false,
          qualification_reason: 'Missing summary.',
        }),
      }),
    ClassificationValidationError,
  );
});
