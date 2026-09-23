'use strict';

function buildLeadResponse(merged) {
  const body = Array.isArray(merged.body) ? merged.body : [];
  const persisted =
    body.length && body[0] && body[0].id
      ? body[0]
      : merged.id
        ? merged
        : null;

  if (!persisted || !persisted.id) {
    return {
      status: 'duplicate',
      submission_id: merged.submission_id,
      lead_id: null,
      duplicate: true,
      processed_at: new Date().toISOString(),
    };
  }

  return {
    status: 'success',
    submission_id: merged.submission_id,
    lead_id: persisted.id,
    qualification: merged.qualification,
    priority: merged.priority,
    lead_score: merged.lead_score,
    human_review: merged.human_review,
    processed_at: new Date().toISOString(),
  };
}

module.exports = {
  buildLeadResponse,
};
