/**
 * Score history.
 *
 * Append-only, with exactly one row per lead flagged `is_current`. Changing a
 * weight and rescoring leaves the previous score readable and comparable — a
 * score that silently changed under a lead would make "why was this
 * qualified" unanswerable after the fact.
 */

import { RULESET_VERSION } from '../config/defaults.js'
import { newId, nowIso, parseJsonField } from './helpers.js'

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    leadId: row.lead_id,
    total: Number(row.total),
    icpFit: Number(row.icp_fit),
    workflowOpportunity: Number(row.workflow_opportunity),
    contactability: Number(row.contactability),
    dataQuality: Number(row.data_quality),
    routing: row.routing,
    reasons: parseJsonField(row.reasons_json, []),
    rulesetVersion: Number(row.ruleset_version),
    isCurrent: row.is_current === 1,
    createdAt: row.created_at,
  }
}

/**
 * Stores a new score and demotes the previous one.
 *
 * Both statements in one batch, so there is never a moment with two current
 * scores (which would make the denormalized `lead_leads.rule_score` ambiguous)
 * or none (which would make the lead detail screen show no score at all).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} leadId
 * @param {{ total, icpFit, workflowOpportunity, contactability, dataQuality, routing, reasons }} score
 */
export async function recordScore(db, leadId, score) {
  const id = newId()
  const now = nowIso()

  await db.batch([
    db.prepare('UPDATE lead_scores SET is_current = 0 WHERE lead_id = ? AND is_current = 1').bind(leadId),
    db
      .prepare(
        `INSERT INTO lead_scores
           (id, lead_id, total, icp_fit, workflow_opportunity, contactability, data_quality,
            routing, reasons_json, ruleset_version, is_current, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .bind(
        id, leadId, score.total, score.icpFit, score.workflowOpportunity,
        score.contactability, score.dataQuality, score.routing,
        JSON.stringify(score.reasons ?? []), RULESET_VERSION, now,
      ),
  ])

  return id
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getCurrentScore(db, leadId) {
  const row = await db
    .prepare('SELECT * FROM lead_scores WHERE lead_id = ? AND is_current = 1 LIMIT 1')
    .bind(leadId)
    .first()
  return mapRow(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listScoreHistory(db, leadId, limit = 10) {
  const result = await db
    .prepare('SELECT * FROM lead_scores WHERE lead_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(leadId, limit)
    .all()
  return (result.results || []).map(mapRow)
}
