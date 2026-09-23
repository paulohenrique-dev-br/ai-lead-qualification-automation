'use strict';

const {
  CLASSIFICATION_JSON_SCHEMA,
  ClassificationValidationError,
  buildClassificationPrompt,
  normalizeClassification,
  parseLLMContent,
} = require('./classification');

class TransientLLMError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TransientLLMError';
    this.statusCode = options.statusCode;
  }
}

class LLMApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LLMApiError';
    this.statusCode = options.statusCode;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestBody(lead, config) {
  const responseFormat =
    (config.structuredOutputMode || 'json_schema') === 'json_object'
      ? { type: 'json_object' }
      : {
          type: 'json_schema',
          json_schema: {
            name: 'lead_classification',
            strict: true,
            schema: CLASSIFICATION_JSON_SCHEMA,
          },
        };

  return {
    model: config.model,
    temperature: 0,
    messages: buildClassificationPrompt(lead),
    response_format: responseFormat,
  };
}

async function classifyOnce(lead, config, fetchImpl) {
  if (!config.apiKey) {
    throw new Error('LLM_API_KEY is not configured');
  }

  const baseUrl = String(config.baseUrl || 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  );
  const url = `${baseUrl}/chat/completions`;
  const timeoutMs = Number(config.timeoutMs || 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody(lead, config)),
      signal: controller.signal,
    });
  } catch (error) {
    throw new TransientLLMError(`LLM request failed: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const bodyText = await response.text();
    const message = `LLM API HTTP ${response.status}: ${bodyText.slice(0, 300)}`;
    if (response.status === 429 || response.status >= 500) {
      throw new TransientLLMError(message, { statusCode: response.status });
    }
    throw new LLMApiError(message, { statusCode: response.status });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ClassificationValidationError(
      'LLM response was not valid JSON',
      [{ field: 'payload', code: 'INVALID_JSON' }],
    );
  }

  const content =
    payload && payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content
      : undefined;

  const parsed = parseLLMContent(content);
  return normalizeClassification(parsed);
}

async function classifyWithRetry(lead, config, fetchImpl = global.fetch) {
  const maxAttempts = Math.max(1, Number(config.maxRetries || 3));
  const retryDelayMs = Number(config.retryDelayMs || 750);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await classifyOnce(lead, config, fetchImpl);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof TransientLLMError ||
        error instanceof ClassificationValidationError;

      if (!retryable || attempt === maxAttempts) {
        const wrapped = new Error(
          `LLM classification failed after ${attempt} attempt(s): ${error.message}`,
        );
        wrapped.name = error.name || 'LLMClassificationError';
        wrapped.cause = error;
        wrapped.statusCode = error.statusCode;
        throw wrapped;
      }

      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError;
}

module.exports = {
  LLMApiError,
  TransientLLMError,
  buildRequestBody,
  classifyOnce,
  classifyWithRetry,
};
