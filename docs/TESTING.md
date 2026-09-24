# Testing

## Unit and integration tests

Run from the repository root:

```bash
npm test
```

The suite is offline and does not call a real LLM, Supabase, HubSpot, or Gmail.
Live E2E validation is recorded separately in
[LIVE_VALIDATION.md](../LIVE_VALIDATION.md).

Covered areas:

- input validation and normalization;
- real n8n webhook envelope extraction (`item.body`);
- structured output schema;
- business rules;
- duplicate handling in the pipeline;
- empty database persistence response treated as idempotent/duplicate;
- mocked LLM classification;
- offline reference module: transient 429 retry;
- offline reference module: timeout treated as transient;
- offline reference module: invalid structured-output retry;
- offline reference module: non-retryable authentication failure;
- n8n workflow JSON parse/flow, no `fetch` in Code nodes, no temporary global
  state, and credential-placeholder checks.

## Fixtures

Fixtures live in `tests/fixtures/`:

| File | Purpose |
| --- | --- |
| `high-value-ai-automation.json` | Happy path: qualified sales lead |
| `small-low-budget.json` | Small, low-budget lead |
| `partnership-request.json` | Partnership intent |
| `support-request.json` | Support intent |
| `invalid-email.json` | Should fail validation |
| `missing-message.json` | Should fail validation |
| `duplicate-submission.json` | Reuses the high-value `submission_id` |

## End-to-end test instructions

### Prerequisites

1. Run `database/schema.sql` against Supabase/PostgreSQL.
2. Configure `.env` with valid placeholders replaced.
3. Import and activate the n8n workflow.
4. Copy `demo/config.example.js` to `demo/config.js` and set the webhook URL.

### Manual scenarios

Use the demo form or a REST client.

1. **Qualified high-value lead**

   Post `tests/fixtures/high-value-ai-automation.json` to the webhook.

   Expected: `200` response with `status: "success"`, `qualification:
   "qualified"`, `priority: "high"`. One row appears in `leads`.

2. **Small low-budget lead**

   Post `small-low-budget.json`.

   Expected: success, but business rules move the lead to `needs_review` and
   force `human_review: true`.

3. **Partnership request**

   Post `partnership-request.json`.

   Expected: success, with `intent: "partnership"`.

4. **Support request**

   Post `support-request.json`.

   Expected: success, with `intent: "support"` and `qualification` not treated
   as a sales lead.

5. **Invalid email**

   Post `invalid-email.json`.

   Expected: request is rejected before LLM. No new row appears in `leads`.

6. **Missing message**

   Post `missing-message.json`.

   Expected: validation rejection. No new row appears in `leads`.

7. **Duplicate submission**

   Post `duplicate-submission.json` after scenario 1.

   Expected: predictable duplicate response. The `leads` table still contains
   exactly one row for that `submission_id`.

8. **Qualified lead**

   Post a lead that the business rules classify as `qualified`.

   Expected: `Create or update a contact` executes in HubSpot.

9. **High-priority lead**

   Post a lead that the business rules classify as `priority: high`.

   Expected: `Send a message` executes in Gmail and the synthetic recipient
   receives the alert.

### Response examples

Success:

```json
{
  "status": "success",
  "submission_id": "550e8400-e29b-41d4-a716-446655440001",
  "lead_id": "<database-uuid>",
  "qualification": "qualified",
  "priority": "high",
  "lead_score": 88,
  "human_review": false,
  "processed_at": "2026-09-23T12:00:00.000Z"
}
```

Duplicate:

```json
{
  "status": "duplicate",
  "submission_id": "550e8400-e29b-41d4-a716-446655440001",
  "lead_id": "<database-uuid>",
  "duplicate": true,
  "processed_at": "2026-09-23T12:01:00.000Z"
}
```
