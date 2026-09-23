'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { applyBusinessRules } = require('../src/business-rules');

const baseLead = {
  submission_id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'John Smith',
  email: 'john.smith@example.com',
  company: 'Acme',
  company_size: 85,
  budget: 12000,
  message: 'We need automation.',
  source: 'website',
};

const qualified = {
  intent: 'sales',
  service: 'ai_automation',
  qualification: 'qualified',
  priority: 'medium',
  lead_score: 88,
  human_review: false,
  qualification_reason: 'Strong fit.',
  summary: 'Strong lead.',
};

test('forces human review for unqualified or needs_review leads', () => {
  const unqualified = applyBusinessRules(baseLead, {
    ...qualified,
    qualification: 'unqualified',
    human_review: false,
  });
  assert.equal(unqualified.human_review, true);

  const needsReview = applyBusinessRules(baseLead, {
    ...qualified,
    qualification: 'needs_review',
    human_review: false,
  });
  assert.equal(needsReview.human_review, true);
});

test('elevates priority for high-scoring qualified sales leads', () => {
  const result = applyBusinessRules(baseLead, qualified);
  assert.equal(result.priority, 'high');
});

test('downgrades a small qualified company to needs_review', () => {
  const result = applyBusinessRules(
    { ...baseLead, company_size: 4 },
    qualified,
  );
  assert.equal(result.qualification, 'needs_review');
  assert.equal(result.human_review, true);
});

test('downgrades a low-budget qualified lead to needs_review', () => {
  const result = applyBusinessRules(
    { ...baseLead, budget: 500 },
    qualified,
  );
  assert.equal(result.qualification, 'needs_review');
  assert.equal(result.human_review, true);
});

test('clamps lead score into the 0-100 range', () => {
  const result = applyBusinessRules(baseLead, {
    ...qualified,
    lead_score: 140,
  });
  assert.equal(result.lead_score, 100);
});
