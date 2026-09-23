'use strict';

const { validateLeadInput } = require('./validation');
const { normalizeClassification } = require('./classification');
const { applyBusinessRules } = require('./business-rules');

/**
 * Pure orchestration used by tests and mirrored by the n8n workflow.
 *
 * deps:
 *   isDuplicate(lead) -> Promise<boolean>
 *   classify(lead) -> Promise<object> (raw structured output from LLM)
 */
async function processLead(input, deps = {}) {
  const lead = validateLeadInput(input);
  const isDuplicate = deps.isDuplicate || (async () => false);
  const classify = deps.classify || (async () => {
    throw new Error('A classifier must be provided');
  });

  if (await isDuplicate(lead)) {
    return {
      status: 'duplicate',
      submission_id: lead.submission_id,
      lead,
    };
  }

  const rawClassification = await classify(lead);
  const classification = normalizeClassification(rawClassification);
  const leadRecord = applyBusinessRules(lead, classification);

  return {
    status: 'success',
    submission_id: lead.submission_id,
    lead: leadRecord,
  };
}

module.exports = {
  processLead,
};
