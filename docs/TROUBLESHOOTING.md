# Troubleshooting

| Symptom | Likely area | What to check |
| --- | --- | --- |
| HTTP 400 | Payload / validation | Missing `submission_id`, `name`, `email`, or `message`; invalid email; invalid numeric field. |
| HTTP 401 | Authentication | A connected credential is missing/invalid: DeepSeek, Supabase, HubSpot, or Gmail. |
| HTTP 404 | Webhook path | Confirm the path is `/webhook/lead-qualification` and the workflow is active. |
| HTTP 429 | Rate limit | LLM rate limit. The exported workflow has no automatic retry; inspect n8n execution logs and API quota. |
| HTTP 500 | Workflow error | Inspect the failing n8n node and n8n execution log. `workflow_errors` is a scaffold and is not automatically populated. |
| Invalid LLM JSON | Structured-output validation | Confirm the provider supports `json_schema`; set `LLM_STRUCTURED_OUTPUT_MODE=json_object` if needed. |
| Duplicate records | Repeated events / idempotency | Confirm the client sends the same `submission_id` and the DB `UNIQUE` constraint exists. |
| DB insert failure | Schema / constraint / connectivity | Verify `schema.sql` ran and `SUPABASE_URL` is correct. |
| Empty persist response | Idempotency / Supabase REST | Expected for an ignored duplicate; the final response should be `duplicate`, not success. |
| RLS permission denied | Supabase security | Use `service_role` only in the server-side n8n workflow; do not use the browser anon key. |
| Timeout | Network / LLM latency | Increase the timeout on the native LLM HTTP Request node. |
| HubSpot contact missing | Routing / HubSpot credential | Confirm `qualification == qualified` and reconnect the HubSpot OAuth2 credential. |
| Gmail alert missing | Routing / Gmail credential | Confirm `priority == high` and reconnect the Gmail OAuth2 credential. |
| Demo form fails to send | Webhook URL / CORS | Ensure `demo/config.js` points to the correct n8n URL and the webhook is reachable. |

## Quick checks

```bash
# Validate the n8n workflow JSON locally
node -e "JSON.parse(require('fs').readFileSync('n8n/lead-qualification-workflow.json','utf8')); console.log('workflow JSON ok')"

# Run the offline test suite
npm test
```
