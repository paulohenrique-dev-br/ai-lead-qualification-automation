# LIVE VALIDATION

## Result

PASS

## Services

- n8n Cloud
- DeepSeek
- Supabase/PostgreSQL
- HubSpot
- Gmail

Synthetic data only. No real personal data, API keys, tokens, private project
URLs, or credential values are included here.

## Scenario 1 — New Lead

Confirmed:

- webhook received the request;
- input validation passed;
- DeepSeek classification executed;
- business rules ran;
- Supabase persisted the lead;
- successful response returned.

## Scenario 2 — Duplicate

Confirmed:

- duplicate `submission_id` was detected;
- DeepSeek was skipped;
- no second database row was created;
- duplicate response returned.

## Scenario 3 — Qualified Lead

Confirmed:

- lead qualified;
- lead persisted in Supabase;
- HubSpot `Create or update a contact` executed.

## Scenario 4 — High Priority

Confirmed:

- lead priority was high;
- Gmail `Send a message` executed;
- synthetic message received.

## Final E2E Path

Webhook
→ Validate Input
→ Duplicate Check
→ DeepSeek
→ Structured Output Validation
→ Business Rules
→ Supabase
→ HubSpot
→ Gmail
→ Response
