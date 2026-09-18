/**
 * Per-lead compliance review state.
 *
 * This records which CONFIGURED checks passed, which country profile applied,
 * and what a human reviewer decided. It is an operational safeguard record and
 * an audit trail — it is explicitly not a legal determination, and nothing in
 * this file or in the UI it feeds claims otherwise. See
 * docs/lead-engine/compliance.md.
 */

import { bounded, newId, nowIso, operationError, parseJsonField } from './helpers.js'

export const COMPLIANCE_STATES = Object.freeze([
  'pending', 'passed', 'blocked', 'needs_human_review', 'waived',
])

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    leadId: row.lead_id,
    countryCode: row.country_code,
    profileKey: row.profile_key,
    state: row.state,
    checks: parseJsonField(row.checks_json, []),
    legalBasis: row.legal_basis,
    legalBasisReference: row.legal_basis_reference,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getComplianceReview(db, leadId) {
  const row = await db.prepare('SELECT * FROM lead_compliance_reviews WHERE lead_id = ?').bind(leadId).first()
  return mapRow(row)
}

/**
 * Writes the machine-evaluated result of the country profile's checks.
 *
 * Deliberately does NOT overwrite a human decision: once a reviewer has set
 * `waived` or recorded a legal basis, a later automated re-evaluation records
 * its checks but leaves the state alone. Otherwise a routine re-run would
 * quietly undo a considered human judgement.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} leadId
 * @param {{ countryCode, profileKey, state, checks }} evaluation
 */
export async function recordComplianceEvaluation(db, leadId, evaluation) {
  const existing = await getComplianceReview(db, leadId)
  const now = nowIso()

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO lead_compliance_reviews
           (id, lead_id, country_code, profile_key, state, checks_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId(), leadId, evaluation.countryCode, evaluation.profileKey, evaluation.state,
        JSON.stringify(evaluation.checks ?? []), now, now,
      )
      .run()
    return getComplianceReview(db, leadId)
  }

  const humanDecided = Boolean(existing.reviewedAt)
  await db
    .prepare(
      `UPDATE lead_compliance_reviews
       SET country_code = ?, profile_key = ?, state = ?, checks_json = ?, updated_at = ?
       WHERE lead_id = ?`,
    )
    .bind(
      evaluation.countryCode,
      evaluation.profileKey,
      humanDecided ? existing.state : evaluation.state,
      JSON.stringify(evaluation.checks ?? []),
      now,
      leadId,
    )
    .run()

  return getComplianceReview(db, leadId)
}

/**
 * Records a human review decision.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function recordComplianceDecision(db, leadId, decision) {
  if (!COMPLIANCE_STATES.includes(decision.state)) {
    throw operationError(`Unknown compliance state: ${decision.state}`, 422)
  }

  const existing = await getComplianceReview(db, leadId)
  if (!existing) throw operationError('No compliance review exists for this lead yet.', 404)

  // Waiving a blocked lead is the highest-consequence action in this module, so
  // it is the one that requires the reviewer to write down why.
  if (decision.state === 'waived' && (!decision.notes || String(decision.notes).trim().length < 10)) {
    throw operationError('Waiving a compliance block requires a note explaining the basis.', 422)
  }

  const now = nowIso()
  await db
    .prepare(
      `UPDATE lead_compliance_reviews
       SET state = ?, legal_basis = ?, legal_basis_reference = ?, reviewed_by = ?,
           reviewed_at = ?, notes = ?, updated_at = ?
       WHERE lead_id = ?`,
    )
    .bind(
      decision.state,
      decision.legalBasis ?? existing.legalBasis,
      decision.legalBasisReference ?? existing.legalBasisReference,
      decision.reviewedBy ?? null,
      now,
      bounded(decision.notes ?? existing.notes ?? '', 2_000),
      now,
      leadId,
    )
    .run()

  return getComplianceReview(db, leadId)
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function countComplianceByState(db) {
  const result = await db
    .prepare('SELECT state, COUNT(*) AS total FROM lead_compliance_reviews GROUP BY state')
    .all()
  return Object.fromEntries((result.results || []).map((row) => [row.state, Number(row.total)]))
}
