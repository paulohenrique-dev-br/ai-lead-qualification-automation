# POST-AUDIT FIX REPORT

## 1. SUMMARY

Applied targeted corrections to the existing proof of concept without
rewriting the architecture. The main changes are:

- explicit extraction of the n8n webhook `item.body`;
- native n8n HTTP Request node for the LLM call instead of `fetch()` in a Code
  node;
- removal of `getWorkflowStaticData('global')` as execution state transport;
- response handling that does not report `success` when persistence returned
  no `id`;
- explicit Supabase RLS deny-by-default for `anon`/`authenticated`;
- `workflow_errors` documented as a scaffold, not as operational logging.

## 2. FILES CHANGED

- `scripts/generate-n8n-workflow.js`
- `n8n/lead-qualification-workflow.json` (regenerated)
- `database/schema.sql`
- `src/webhook.js` (new)
- `src/response.js` (new)
- `src/index.js`
- `tests/webhook.test.js` (new)
- `tests/response.test.js` (new)
- `tests/n8n-workflow.test.js`
- `package.json`
- `.env.example`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `docs/TROUBLESHOOTING.md`

## 3. AUDIT FINDINGS ADDRESSED

### Finding 1: Webhook input treated the Code-node item as the lead

- Root cause: `Validate Input` read `$input.item.json` directly and assumed
  the lead fields were at the root, while n8n normally wraps them in `.body`.
- Fix: `Validate Input` now extracts `envelope.body` and rejects malformed
  envelopes. A matching offline helper was added in `src/webhook.js`.
- Verification: `tests/webhook.test.js` passes a real `.body` shape, rejects a
  root lead, and rejects a missing body. `tests/n8n-workflow.test.js` asserts
  the generated Code node uses `envelope.body`.
- Remaining limitation: the generated n8n node has not been executed in a real
  n8n instance.

### Finding 2: LLM called with `fetch()` inside a Code node

- Root cause: the old `LLM Classification` Code node built and executed the
  HTTP request itself.
- Fix: the flow now uses `Prepare LLM Request` (Code, request body only) and
  `LLM HTTP Request` (native `n8n-nodes-base.httpRequest`). The native node
  carries a timeout only. The final correction removed generic `retryOnFail`
  to avoid contradicting the documented error-handling model.
- Verification: `tests/n8n-workflow.test.js` confirms no `fetch(` exists in the
  exported JSON and that `LLM HTTP Request` is a native HTTP Request node with
  `POST`.
- Remaining limitation: invalid structured output is rejected rather than
  retried. The exported workflow does not configure HTTP retry; the offline
  `src/llm.js` reference module still demonstrates a bounded retry strategy.

### Finding 3: `getWorkflowStaticData('global')` used for execution transport

- Root cause: Code nodes stored `validatedLead`/`qualifiedLead` in global
  static data.
- Fix: data now travels through normal n8n item/JSON flow and explicit Merge
  nodes (`Merge Check + Input`, `Merge LLM + Lead`, `Merge Persist + Record`).
- Verification: workflow test asserts no `getWorkflowStaticData` remains.
- Remaining limitation: Merge node schemas are structurally plausible but not
  imported into a real n8n instance in this session.

### Finding 4: Final response could report success without persistence confirmation

- Root cause: `Respond` used a static cached record and could return
  `lead_id: null` with `status: success`.
- Fix: `Respond` now requires a persisted `id`. An empty persistence body is
  returned as `status: duplicate`.
- Verification: `tests/response.test.js` covers success with an id, empty
  body, and missing id. The generated `Respond` Code node mirrors the helper.
- Remaining limitation: exact behavior depends on Supabase REST response
  parsing in n8n.

### Finding 5: Idempotency race condition

- Root cause: check-before-insert alone was not authoritative under
  concurrency.
- Fix: retained the workflow check, retained the database `UNIQUE`
  constraint, and persisted with `on_conflict=submission_id` plus
  `resolution=ignore-duplicates`. A race therefore cannot create two rows, and
  an ignored duplicate is returned as `duplicate`.
- Verification: offline response tests cover empty/ignored persistence;
  `database/schema.sql` still enforces `submission_id unique`.
- Remaining limitation: true concurrent Supabase behavior needs a real
  environment test.

### Finding 6: Supabase security

- Root cause: tables had no explicit RLS policy.
- Fix: enabled RLS on `leads` and `workflow_errors`, revoked table access from
  `anon`/`authenticated`, and granted table access to `service_role`.
- Verification: schema reviewed; no keys are committed.
- Remaining limitation: RLS is deny-by-default. Future authenticated access
  would require explicit policies.

### Finding 7: `workflow_errors` was described as if logging were operational

- Root cause: documentation over-stated persistent error logging.
- Fix: chose option B. The table remains as a scaffold/future extension.
  Documentation now states that automatic persistent error insertion is not
  wired.
- Verification: documentation updated.
- Remaining limitation: operational error persistence is not implemented.

### Finding 8: Documentation implied more validation than was actually done

- Root cause: README/docs mixed offline-validated behavior with real
  environment claims.
- Fix: README and docs now distinguish offline validation from
  `REQUIRES REAL ENVIRONMENT TESTING`, and the final report records n8n status.
- Verification: documentation reviewed after implementation.
- Remaining limitation: external validation is still pending.

## 4. TEST RESULTS

Command:

```bash
npm test
```

Actual result:

```text
tests 40
pass 40
fail 0
```

The suite covers the required regression areas: real webhook body, invalid
input not reaching the LLM, duplicate handling, empty database response,
invalid structured output, HTTP 401/429, timeout-related retry behavior at the
offline unit level, no state leakage in the generated workflow, and valid
workflow JSON.

## 5. N8N STATUS

- Offline validated: **YES** (JSON parse, node flow, no `fetch`, no temporary
  global state, no secrets, native LLM HTTP Request node present).
- Real import tested: **NO / NOT TESTED** (no n8n instance available).
- Real execution tested: **NO / NOT TESTED**.

Classification: **structurally validated / pending real n8n import and
execution**.

## 6. DATABASE SECURITY

`database/schema.sql` now:

- enables row-level security on `leads` and `workflow_errors`;
- revokes table privileges from `anon` and `authenticated`;
- grants `select, insert, update, delete` to `service_role`.

The demo browser only posts to the n8n webhook and never receives a Supabase
key. `service_role` is a backend-only secret for n8n.

## 7. IDEMPOTENCY

Normal flow:

1. The workflow checks `leads` for the `submission_id`.
2. If found, it returns `status: duplicate`.
3. If not found, it calls the LLM and persists the lead.

Race condition:

- Two equal requests may both pass step 1.
- The database `UNIQUE` constraint and `on_conflict=submission_id` are the
  final authority.
- An ignored/empty insert response is returned as `duplicate`, not as a new
  `success` with `lead_id: null`.

## 8. ERROR HANDLING

- Invalid payloads fail before the LLM.
- Invalid email/missing fields fail validation.
- HTTP 401 is a non-transient failure and is not persisted as success.
- HTTP 429, HTTP 5xx, network failures, and timeouts stop the exported n8n
  workflow; no generic retry is configured. The offline reference module
  demonstrates bounded retry behavior.
- Invalid structured output fails validation and is not persisted.
- `workflow_errors` is a scaffold; persistent error insertion is not wired.

## 9. SECURITY SCAN

Ran a repository scan for real-looking API keys, JWTs, passwords, service-role
values, private keys, and connection strings.

Result:

```text
no obvious real secrets found
```

No `.env` file and no `demo/config.js` are present. Only placeholders exist.

## 10. DOCUMENTATION CHANGES

- README: updated n8n flow, env variables, reliability, security, and
  repository structure.
- `docs/ARCHITECTURE.md`: updated responsibilities, n8n flow, idempotency, and
  error-handling wording.
- `docs/TESTING.md`: added webhook extraction, empty persistence response, and
  workflow safety checks.
- `docs/TROUBLESHOOTING.md`: added RLS and empty-persist-response entries.

## 11. REMAINING LIMITATIONS

- No real n8n import or execution was performed.
- No real Supabase/LLM integration was executed.
- Invalid structured output is rejected, not retried, because the LLM call is
  now a native HTTP Request node.
- `workflow_errors` is a schema scaffold, not operational logging.
- Merge node configuration may require manual remapping on import depending on
  the n8n version.
- No business results or production metrics are claimed.

## 12. PUBLICATION READINESS

- SAFE FOR PUBLIC GITHUB? **YES**
- TECHNICALLY DEFENSIBLE? **YES / WITH CAVEATS**
- READY FOR UPWORK PORTFOLIO? **YES / WITH CAVEATS**

The caveats are the pending real-environment validation items listed below.

## 13. MANUAL VALIDATION STILL REQUIRED

- Import `n8n/lead-qualification-workflow.json` into a real n8n instance.
- Map/confirm HTTP Request, IF, and Merge node versions.
- Run `database/schema.sql` against Supabase.
- Configure `.env` and confirm `service_role` backend access.
- Execute the seven E2E scenarios in `docs/TESTING.md`.
- Confirm duplicate and race-condition behavior under concurrent requests.
- Confirm the LLM provider supports the selected structured-output mode.
