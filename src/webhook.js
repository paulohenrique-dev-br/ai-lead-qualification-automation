'use strict';

class WebhookPayloadError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'WebhookPayloadError';
    this.code = 'INVALID_WEBHOOK_PAYLOAD';
    this.statusCode = 400;
    this.details = details;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Extracts the lead payload from a real n8n Webhook node item.
 *
 * n8n Webhook nodes normally expose the request body as item.body. We
 * intentionally do not accept a lead object at the root because that would
 * hide a malformed webhook configuration.
 */
function extractLeadPayload(webhookItem) {
  if (!isPlainObject(webhookItem)) {
    throw new WebhookPayloadError(
      'Webhook output must be an object',
      [{ field: 'webhook', code: 'INVALID_ENVELOPE' }],
    );
  }

  if (!isPlainObject(webhookItem.body)) {
    throw new WebhookPayloadError(
      'Webhook payload must include a JSON body object',
      [{ field: 'body', code: 'MISSING_BODY' }],
    );
  }

  return webhookItem.body;
}

module.exports = {
  WebhookPayloadError,
  extractLeadPayload,
};
