'use strict';

class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.statusCode = 400;
    this.details = details;
  }
}

const VALID_SOURCES = new Set([
  'website',
  'linkedin',
  'referral',
  'partner',
  'event',
  'other',
  'unknown',
]);

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidEmail(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) {
    return false;
  }

  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) {
    return false;
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (!local || !domain || local.length > 64 || domain.length > 253) {
    return false;
  }

  const localPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
  const domainPattern = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

  return localPattern.test(local) && domainPattern.test(domain);
}

function normalizeSource(value) {
  if (typeof value !== 'string') {
    return 'unknown';
  }

  const source = value.trim().toLowerCase();
  return VALID_SOURCES.has(source) ? source : 'unknown';
}

/**
 * Validates and normalizes an incoming webhook payload.
 * Invalid payloads are rejected before they can reach the LLM.
 */
function validateLeadInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Request body must be a JSON object.', [
      { field: 'body', code: 'INVALID_BODY' },
    ]);
  }

  const errors = [];

  const submission_id =
    typeof input.submission_id === 'string' ? input.submission_id.trim() : '';
  if (!submission_id) {
    errors.push({ field: 'submission_id', code: 'REQUIRED' });
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    errors.push({ field: 'name', code: 'REQUIRED' });
  }

  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (!email) {
    errors.push({ field: 'email', code: 'REQUIRED' });
  } else if (!isValidEmail(email)) {
    errors.push({ field: 'email', code: 'INVALID_EMAIL' });
  }

  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (!message) {
    errors.push({ field: 'message', code: 'REQUIRED' });
  }

  const hasCompanySize =
    input.company_size !== null &&
    input.company_size !== undefined &&
    input.company_size !== '';
  const company_size = toOptionalNumber(input.company_size);
  if (hasCompanySize && (company_size === null || company_size < 1)) {
    errors.push({ field: 'company_size', code: 'INVALID_NUMBER' });
  }

  const hasBudget =
    input.budget !== null && input.budget !== undefined && input.budget !== '';
  const budget = toOptionalNumber(input.budget);
  if (hasBudget && (budget === null || budget < 0)) {
    errors.push({ field: 'budget', code: 'INVALID_NUMBER' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Invalid lead payload', errors);
  }

  return {
    submission_id,
    name,
    email: email.toLowerCase(),
    company: typeof input.company === 'string' ? input.company.trim() : '',
    company_size,
    budget,
    message,
    source: normalizeSource(input.source),
  };
}

module.exports = {
  ValidationError,
  isValidEmail,
  normalizeSource,
  toOptionalNumber,
  validateLeadInput,
};
