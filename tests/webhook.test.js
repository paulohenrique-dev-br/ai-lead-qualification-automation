'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WebhookPayloadError,
  extractLeadPayload,
} = require('../src/webhook');

test('extracts a real n8n webhook payload from item.body', () => {
  const lead = {
    submission_id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'John Smith',
    email: 'john@example.com',
    company: 'Acme',
    company_size: 35,
    budget: 5000,
    message: 'We need to automate our sales process.',
    source: 'website',
  };

  assert.deepEqual(
    extractLeadPayload({
      body: lead,
      headers: {},
      query: {},
    }),
    lead,
  );
});

test('rejects a lead placed directly at the webhook item root', () => {
  assert.throws(
    () =>
      extractLeadPayload({
        submission_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Root Lead',
        email: 'root@example.com',
        message: 'This should not be accepted.',
      }),
    (error) => {
      assert.ok(error instanceof WebhookPayloadError);
      assert.equal(error.code, 'INVALID_WEBHOOK_PAYLOAD');
      return true;
    },
  );
});

test('rejects an envelope without body', () => {
  assert.throws(
    () => extractLeadPayload({ headers: {}, query: {} }),
    WebhookPayloadError,
  );
});
