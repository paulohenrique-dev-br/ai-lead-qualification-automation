'use strict';

function clampScore(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return 0;
  }
  return Math.max(0, Math.min(100, numericScore));
}

/**
 * Applies deterministic post-LLM rules and returns a complete lead record.
 *
 * The LLM is allowed to make the semantic call. These rules add conservative
 * guardrails for cases where the business outcome should be obvious.
 */
function applyBusinessRules(lead, classification) {
  const record = {
    ...lead,
    ...classification,
  };

  record.lead_score = clampScore(classification.lead_score);

  if (
    record.qualification === 'unqualified' ||
    record.qualification === 'needs_review'
  ) {
    record.human_review = true;
  }

  if (
    lead.company_size !== null &&
    lead.company_size !== undefined &&
    lead.company_size < 10 &&
    record.qualification === 'qualified'
  ) {
    record.qualification = 'needs_review';
    record.human_review = true;
    record.qualification_reason =
      'Small company size; manual review recommended before committing sales effort.';
  }

  if (
    lead.budget !== null &&
    lead.budget !== undefined &&
    lead.budget < 1000 &&
    record.qualification === 'qualified'
  ) {
    record.qualification = 'needs_review';
    record.human_review = true;
    record.qualification_reason =
      'Budget below automation viability threshold; manual review recommended.';
  }

  if (
    record.lead_score >= 80 &&
    record.qualification === 'qualified' &&
    record.intent === 'sales'
  ) {
    record.priority = 'high';
  }

  if (
    record.lead_score < 40 &&
    record.qualification === 'qualified'
  ) {
    record.priority = 'low';
  }

  return record;
}

module.exports = {
  applyBusinessRules,
  clampScore,
};
