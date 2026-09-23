'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ValidationError,
  validateLeadInput,
} = require('../src/validation');

function fixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'),
  );
}

test('accepts and normalizes a high-value valid lead', () => {
  const lead = validateLeadInput(fixture('high-value-ai-automation.json'));

  assert.equal(lead.email, 'john.smith@example.com');
  assert.equal(lead.company_size, 85);
  assert.equal(lead.budget, 12000);
  assert.equal(lead.source, 'website');
});

test('normalizes email, source, and surrounding whitespace', () => {
  const lead = validateLeadInput({
    submission_id: '  550e8400-e29b-41d4-a716-446655440001  ',
    name: '  Jane Doe  ',
    email: '  JANE.DOE@Example.COM ',
    company: '  Example  ',
    company_size: '12',
    budget: '2500',
    message: '  Please contact me.  ',
    source: '  LinkedIn  ',
  });

  assert.equal(lead.submission_id, '550e8400-e29b-41d4-a716-446655440001');
  assert.equal(lead.name, 'Jane Doe');
  assert.equal(lead.email, 'jane.doe@example.com');
  assert.equal(lead.company_size, 12);
  assert.equal(lead.budget, 2500);
  assert.equal(lead.message, 'Please contact me.');
  assert.equal(lead.source, 'linkedin');
});

test('rejects an invalid email before the LLM is called', () => {
  assert.throws(
    () => validateLeadInput(fixture('invalid-email.json')),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.statusCode, 400);
      assert.ok(
        error.details.some(
          (detail) =>
            detail.field === 'email' && detail.code === 'INVALID_EMAIL',
        ),
      );
      return true;
    },
  );
});

test('rejects a missing message', () => {
  assert.throws(
    () => validateLeadInput(fixture('missing-message.json')),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(
        error.details.some(
          (detail) => detail.field === 'message' && detail.code === 'REQUIRED',
        ),
      );
      return true;
    },
  );
});

test('rejects a negative budget', () => {
  assert.throws(
    () =>
      validateLeadInput({
        submission_id: '550e8400-e29b-41d4-a716-446655440009',
        name: 'Negative Budget',
        email: 'negative@example.com',
        company_size: 20,
        budget: -1,
        message: 'Invalid budget',
      }),
    (error) => error.details.some((d) => d.field === 'budget'),
  );
});

test('rejects an invalid company size string', () => {
  assert.throws(
    () =>
      validateLeadInput({
        submission_id: '550e8400-e29b-41d4-a716-446655440010',
        name: 'Bad Size',
        email: 'bad-size@example.com',
        company_size: 'not-a-number',
        message: 'Invalid size',
      }),
    (error) => error.details.some((d) => d.field === 'company_size'),
  );
});

test('defaults unknown source to "unknown"', () => {
  const lead = validateLeadInput({
    submission_id: '550e8400-e29b-41d4-a716-446655440011',
    name: 'Unknown Source',
    email: 'unknown@example.com',
    message: 'Hello',
    source: 'somewhere-new',
  });

  assert.equal(lead.source, 'unknown');
});
