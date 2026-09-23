'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LLMApiError,
  TransientLLMError,
  classifyOnce,
  classifyWithRetry,
} = require('../src/llm');

const lead = {
  submission_id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'John Smith',
  email: 'john@example.com',
  company: 'Acme',
  company_size: 85,
  budget: 12000,
  message: 'We need automation.',
  source: 'website',
};

const validClassification = {
  intent: 'sales',
  service: 'ai_automation',
  qualification: 'qualified',
  priority: 'high',
  lead_score: 88,
  human_review: false,
  qualification_reason: 'Clear budget and stated need.',
  summary: 'Acme needs automation.',
};

function mockFetch(handler) {
  return async (url, options) => handler(url, options);
}

function okJson(content) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [{ message: { content } }],
      };
    },
  };
}

const config = {
  apiKey: 'test-key',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4o-mini',
  timeoutMs: 1000,
  maxRetries: 3,
  retryDelayMs: 1,
};

test('classifies a valid API response once', async () => {
  let calls = 0;
  const fetchImpl = mockFetch(async () => {
    calls += 1;
    return okJson(JSON.stringify(validClassification));
  });

  const result = await classifyWithRetry(lead, config, fetchImpl);
  assert.equal(result.intent, 'sales');
  assert.equal(calls, 1);
});

test('retries a transient 429 and then succeeds', async () => {
  let calls = 0;
  const fetchImpl = mockFetch(async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 429,
        async text() {
          return 'rate limited';
        },
      };
    }
    return okJson(JSON.stringify(validClassification));
  });

  const result = await classifyWithRetry(lead, config, fetchImpl);
  assert.equal(result.lead_score, 88);
  assert.equal(calls, 2);
});

test('retries invalid structured output and then succeeds', async () => {
  let calls = 0;
  const fetchImpl = mockFetch(async () => {
    calls += 1;
    if (calls < 3) {
      return okJson('{"intent":"sales"}');
    }
    return okJson(JSON.stringify(validClassification));
  });

  const result = await classifyWithRetry(lead, config, fetchImpl);
  assert.equal(result.service, 'ai_automation');
  assert.equal(calls, 3);
});

test('does not retry a 401 authentication failure', async () => {
  let calls = 0;
  const fetchImpl = mockFetch(async () => {
    calls += 1;
    return {
      ok: false,
      status: 401,
      async text() {
        return 'unauthorized';
      },
    };
  });

  await assert.rejects(
    () => classifyWithRetry(lead, config, fetchImpl),
    (error) => {
      assert.ok(error.cause instanceof LLMApiError);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('rejects a missing API key before making a request', async () => {
  await assert.rejects(
    () =>
      classifyOnce(
        lead,
        { ...config, apiKey: '' },
        mockFetch(async () => {
          throw new Error('should not be called');
        }),
      ),
    /LLM_API_KEY is not configured/,
  );
});

test('treats a timeout as a transient LLM error', async () => {
  let calls = 0;
  const fetchImpl = mockFetch(async (_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new Error('Aborted'));
      });
    });
  });

  await assert.rejects(
    () => classifyOnce(lead, { ...config, timeoutMs: 1 }, fetchImpl),
    TransientLLMError,
  );
  assert.equal(calls, 1);
});
