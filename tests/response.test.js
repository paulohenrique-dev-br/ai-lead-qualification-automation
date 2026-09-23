'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLeadResponse } = require('../src/response');

const record = {
  submission_id: '550e8400-e29b-41d4-a716-446655440001',
  qualification: 'qualified',
  priority: 'high',
  lead_score: 88,
  human_review: false,
};

test('returns success only when persistence returned an id', () => {
  const result = buildLeadResponse({
    ...record,
    body: [{ id: 'ef6a9a92-0b4b-4d5f-9e7e-3f0f9c9c8d2b' }],
  });

  assert.equal(result.status, 'success');
  assert.equal(result.lead_id, 'ef6a9a92-0b4b-4d5f-9e7e-3f0f9c9c8d2b');
});

test('treats an empty persistence response as duplicate/idempotent', () => {
  const result = buildLeadResponse({
    ...record,
    body: [],
  });

  assert.equal(result.status, 'duplicate');
  assert.equal(result.lead_id, null);
  assert.equal(result.duplicate, true);
});

test('does not invent a lead_id when the merged response has no id', () => {
  const result = buildLeadResponse(record);

  assert.equal(result.status, 'duplicate');
  assert.equal(result.lead_id, null);
});
