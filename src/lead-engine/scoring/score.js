/**
 * Deterministic lead qualification.
 *
 * Workers AI does NOT invent the score. Every point here comes from a signal
 * that was observed on a public page, has a weight in
 * src/lead-engine/config/defaults.js, and produces a reason row the lead detail
 * screen renders. That is what makes "why was this lead qualified" answerable
 * six months later, and it is what keeps the expensive, non-deterministic step
 * (the model) gated behind a cheap, reproducible one.
 *
 * The scoring function is PURE: signals and configuration in, score and reasons
 * out. It touches no database and performs no I/O, so it is exhaustively
 * testable and can be re-run over historical signals when weights change.
 */

import { SCORE_THRESHOLDS, SIGNAL_LABELS, SIGNAL_WEIGHTS } from '../config/defaults.js'

/** The four categories, in the order the lead detail screen shows them. */
export const SCORE_CATEGORIES = Object.freeze(['icp_fit', 'workflow_opportunity', 'contactability', 'data_quality'])

export const ROUTING = Object.freeze({
  NOT_QUALIFIED: 'not_qualified',
  HOLD: 'hold',
  AI_REVIEW: 'ai_review',
  PRIORITY_AI_REVIEW: 'priority_ai_review',
})

/**
 * Maps a total to a routing decision.
 *
 * Half-open bands against the three configured lower bounds, so there is
 * exactly one number per boundary and no possibility of a gap or an overlap
 * between them.
 *
 * @param {number} total
 * @param {{ hold: number, aiReview: number, priorityAiReview: number }} [thresholds]
 * @returns {string}
 */
export function routeScore(total, thresholds = SCORE_THRESHOLDS) {
  if (total >= thresholds.priorityAiReview) return ROUTING.PRIORITY_AI_REVIEW
  if (total >= thresholds.aiReview) return ROUTING.AI_REVIEW
  if (total >= thresholds.hold) return ROUTING.HOLD
  return ROUTING.NOT_QUALIFIED
}

/**
 * Which category a signal contributes to, and how much.
 *
 * A signal with no configured weight scores zero — adding an extractor does not
 * silently change every lead's score until someone chooses a weight for it.
 *
 * @param {string} signalKey
 * @param {object} [weights]
 * @returns {{ category: string, points: number }|null}
 */
function weightFor(signalKey, weights = SIGNAL_WEIGHTS) {
  for (const category of SCORE_CATEGORIES) {
    const points = weights[category]?.[signalKey]
    if (Number.isFinite(points)) return { category, points }
  }
  return null
}

/**
 * Scores a lead.
 *
 * @param {{
 *   detectedSignalKeys: Iterable<string>,
 *   weights?: object,
 *   thresholds?: object
 * }} input
 * @returns {{
 *   total: number, icpFit: number, workflowOpportunity: number,
 *   contactability: number, dataQuality: number, routing: string,
 *   reasons: Array<{ code: string, label: string, points: number, category: string }>
 * }}
 */
export function scoreLead({ detectedSignalKeys, weights = SIGNAL_WEIGHTS, thresholds = SCORE_THRESHOLDS }) {
  const keys = [...new Set(detectedSignalKeys || [])]

  const totals = { icp_fit: 0, workflow_opportunity: 0, contactability: 0, data_quality: 0 }
  const reasons = []

  for (const key of keys) {
    const weight = weightFor(key, weights)
    if (!weight || weight.points === 0) continue

    totals[weight.category] += weight.points
    reasons.push({
      code: key,
      label: SIGNAL_LABELS[key] || key,
      points: weight.points,
      category: weight.category,
    })
  }

  // Sorted by absolute contribution so the lead detail screen leads with the
  // reasons that actually decided the outcome, rather than with whichever
  // signal happened to be extracted first.
  reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || a.code.localeCompare(b.code))

  // Clamped to 0..100. Negative weights (a disqualifying keyword, an existing
  // booking system) are real and must be able to push a lead below the
  // qualification bar, but a negative TOTAL carries no more information than
  // zero and would break the routing bands and the UI's progress rendering.
  const rawTotal = SCORE_CATEGORIES.reduce((sum, category) => sum + totals[category], 0)
  const total = Math.max(0, Math.min(100, rawTotal))

  return {
    total,
    icpFit: totals.icp_fit,
    workflowOpportunity: totals.workflow_opportunity,
    contactability: totals.contactability,
    dataQuality: totals.data_quality,
    routing: routeScore(total, thresholds),
    reasons,
  }
}

/**
 * Whether a routing decision sends the lead to Workers AI.
 *
 * One place, so the gate cannot drift between the research workflow, the job
 * dispatcher and the admin's manual "review now" action.
 *
 * @param {string} routing
 */
export function routesToAi(routing) {
  return routing === ROUTING.AI_REVIEW || routing === ROUTING.PRIORITY_AI_REVIEW
}

/**
 * The pipeline stage a routing decision implies.
 *
 * @param {string} routing
 * @param {typeof import('../domain/pipeline.js').STAGES} stages
 */
export function stageForRouting(routing, stages) {
  switch (routing) {
    case ROUTING.PRIORITY_AI_REVIEW:
    case ROUTING.AI_REVIEW:
      return stages.RULE_QUALIFIED
    case ROUTING.HOLD:
      return stages.HOLD
    default:
      return stages.NOT_QUALIFIED
  }
}

/**
 * The priority a routing decision implies, used for job ordering and the leads
 * table's Priority column.
 *
 * @param {string} routing
 */
export function priorityForRouting(routing) {
  if (routing === ROUTING.PRIORITY_AI_REVIEW) return 'high'
  if (routing === ROUTING.AI_REVIEW) return 'normal'
  return 'low'
}
