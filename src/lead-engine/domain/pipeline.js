/**
 * The lead pipeline: stages, their meaning, and how they are grouped.
 *
 * The stage set is closed and mirrored by a CHECK constraint on
 * `lead_leads.stage` (migrations/0012). If a stage is added here it must be
 * added there too — a unit test asserts the two lists match, because a stage
 * the application believes in and the database rejects is a write that fails
 * at 3am rather than in CI.
 *
 * Transitions are deliberately NOT a matrix. The pipeline is non-linear by
 * design: a lead can go from RESEARCHED straight to DO_NOT_CONTACT, from
 * READY_TO_CONTACT back to HOLD, or from anywhere to ARCHIVED. What is enforced
 * is narrower and more useful — the terminal-state rule below — and everything
 * else is recorded in `lead_activity` rather than prevented.
 */

export const STAGES = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  RESEARCHING: 'RESEARCHING',
  RESEARCHED: 'RESEARCHED',
  RULE_QUALIFIED: 'RULE_QUALIFIED',
  AI_REVIEW: 'AI_REVIEW',
  AI_QUALIFIED: 'AI_QUALIFIED',
  CONTACT_FOUND: 'CONTACT_FOUND',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  READY_TO_CONTACT: 'READY_TO_CONTACT',
  CONTACTED: 'CONTACTED',
  AWAITING_REPLY: 'AWAITING_REPLY',
  REPLIED: 'REPLIED',
  CONVERSATION: 'CONVERSATION',
  MEETING: 'MEETING',
  PROPOSAL: 'PROPOSAL',
  WON: 'WON',
  LOST: 'LOST',
  NOT_QUALIFIED: 'NOT_QUALIFIED',
  HOLD: 'HOLD',
  NO_CONTACT: 'NO_CONTACT',
  DO_NOT_CONTACT: 'DO_NOT_CONTACT',
  UNSUBSCRIBED: 'UNSUBSCRIBED',
  BOUNCED: 'BOUNCED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  ARCHIVED: 'ARCHIVED',
})

export const ALL_STAGES = Object.freeze(Object.values(STAGES))

/** The happy path, in order. Used for the dashboard funnel and for sorting. */
export const PROGRESSION_STAGES = Object.freeze([
  STAGES.DISCOVERED,
  STAGES.RESEARCHING,
  STAGES.RESEARCHED,
  STAGES.RULE_QUALIFIED,
  STAGES.AI_REVIEW,
  STAGES.AI_QUALIFIED,
  STAGES.CONTACT_FOUND,
  STAGES.READY_FOR_REVIEW,
  STAGES.READY_TO_CONTACT,
  STAGES.CONTACTED,
  STAGES.AWAITING_REPLY,
  STAGES.REPLIED,
  STAGES.CONVERSATION,
  STAGES.MEETING,
  STAGES.PROPOSAL,
  STAGES.WON,
])

/**
 * Stages from which the engine must generate no further outreach and schedule
 * no further work. A lead here is finished with, one way or another.
 *
 * The compliance-terminal subset below is stricter still: those cannot be left
 * by any action short of a privileged suppression removal, because leaving them
 * means contacting someone who asked not to be.
 */
export const TERMINAL_STAGES = Object.freeze([
  STAGES.WON,
  STAGES.LOST,
  STAGES.NOT_QUALIFIED,
  STAGES.NO_CONTACT,
  STAGES.DO_NOT_CONTACT,
  STAGES.UNSUBSCRIBED,
  STAGES.BOUNCED,
  STAGES.NOT_INTERESTED,
  STAGES.ARCHIVED,
])

/**
 * The one-way door. A lead in one of these stages arrived there because a
 * person objected, an address bounced, or an operator said no — and the engine
 * is not permitted to move it back out. Only removing the underlying
 * suppression entry (a privileged, audited admin action) can.
 */
export const COMPLIANCE_TERMINAL_STAGES = Object.freeze([
  STAGES.DO_NOT_CONTACT,
  STAGES.UNSUBSCRIBED,
  STAGES.BOUNCED,
])

/** Stages at which a human is expected to do something. Drives the dashboard. */
export const ACTIONABLE_STAGES = Object.freeze([
  STAGES.READY_FOR_REVIEW,
  STAGES.READY_TO_CONTACT,
  STAGES.REPLIED,
  STAGES.HOLD,
])

export const STAGE_LABELS = Object.freeze({
  DISCOVERED: 'Discovered',
  RESEARCHING: 'Researching',
  RESEARCHED: 'Researched',
  RULE_QUALIFIED: 'Rule qualified',
  AI_REVIEW: 'AI review',
  AI_QUALIFIED: 'AI qualified',
  CONTACT_FOUND: 'Contact found',
  READY_FOR_REVIEW: 'Ready for review',
  READY_TO_CONTACT: 'Ready to contact',
  CONTACTED: 'Contacted',
  AWAITING_REPLY: 'Awaiting reply',
  REPLIED: 'Replied',
  CONVERSATION: 'In conversation',
  MEETING: 'Meeting',
  PROPOSAL: 'Proposal',
  WON: 'Won',
  LOST: 'Lost',
  NOT_QUALIFIED: 'Not qualified',
  HOLD: 'Hold',
  NO_CONTACT: 'No contact found',
  DO_NOT_CONTACT: 'Do not contact',
  UNSUBSCRIBED: 'Unsubscribed',
  BOUNCED: 'Bounced',
  NOT_INTERESTED: 'Not interested',
  ARCHIVED: 'Archived',
})

/** @param {string} stage */
export function isValidStage(stage) {
  return ALL_STAGES.includes(stage)
}

/** @param {string} stage */
export function isTerminal(stage) {
  return TERMINAL_STAGES.includes(stage)
}

/** @param {string} stage */
export function isComplianceTerminal(stage) {
  return COMPLIANCE_TERMINAL_STAGES.includes(stage)
}

/**
 * Whether a transition is permitted.
 *
 * Permissive by design — it refuses exactly three things:
 *
 *   1. An unknown stage, which would be rejected by the database anyway but is
 *      better caught with a usable message.
 *   2. Leaving a compliance-terminal stage. This is the rule that makes
 *      "unsubscribe means unsubscribed" structural rather than a convention
 *      each call site has to remember.
 *   3. A no-op, so the activity timeline is not filled with transitions that
 *      did not happen.
 *
 * @param {string} from
 * @param {string} to
 * @param {{ allowComplianceOverride?: boolean }} [options] set only by the
 *   privileged suppression-removal path, which has its own audit trail.
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canTransition(from, to, { allowComplianceOverride = false } = {}) {
  if (!isValidStage(to)) return { allowed: false, reason: `Unknown stage: ${to}` }
  if (from && !isValidStage(from)) return { allowed: false, reason: `Unknown stage: ${from}` }
  if (from === to) return { allowed: false, reason: 'Lead is already in that stage.' }

  if (isComplianceTerminal(from) && !allowComplianceOverride) {
    return {
      allowed: false,
      reason: `A lead in ${STAGE_LABELS[from]} cannot be moved. Remove the suppression entry first.`,
    }
  }

  return { allowed: true }
}

/**
 * The recommended next step, as a sentence for the operator.
 *
 * Centralized here rather than computed in the UI so the leads table, the lead
 * detail screen and the dashboard cards cannot disagree about what a lead
 * needs. Returns null when the engine is what acts next, which the UI renders
 * as "waiting on the engine" rather than prompting a human.
 *
 * @param {{ stage: string, hasContact?: boolean, complianceState?: string|null,
 *           hasDraft?: boolean, draftExported?: boolean, hasUnansweredReply?: boolean }} lead
 * @returns {string|null}
 */
export function describeNextAction(lead) {
  const { stage } = lead

  if (lead.hasUnansweredReply) return 'Review the reply and create a Zoho reply draft.'

  switch (stage) {
    case STAGES.DISCOVERED:
    case STAGES.RESEARCHING:
      return null
    case STAGES.RESEARCHED:
    case STAGES.RULE_QUALIFIED:
    case STAGES.AI_REVIEW:
      return null
    case STAGES.AI_QUALIFIED:
      return lead.hasContact ? null : 'No public business contact found yet — add one manually or reject.'
    case STAGES.CONTACT_FOUND:
      return lead.complianceState === 'needs_human_review'
        ? 'Complete the compliance review for this lead.'
        : null
    case STAGES.READY_FOR_REVIEW:
      return 'Review the opportunity and the suggested outreach draft.'
    case STAGES.READY_TO_CONTACT:
      if (!lead.hasDraft) return 'Generate an outreach draft.'
      if (!lead.draftExported) return 'Export the draft, then send it yourself from your mail client.'
      return 'Send it yourself from your mail client, then mark the lead contacted.'
    case STAGES.CONTACTED:
    case STAGES.AWAITING_REPLY:
      return null
    case STAGES.REPLIED:
      return 'Review the reply and the suggested response.'
    case STAGES.CONVERSATION:
      return 'Continue the conversation in Zoho.'
    case STAGES.MEETING:
      return 'Hold the meeting and record the outcome.'
    case STAGES.PROPOSAL:
      return 'Follow up on the proposal.'
    case STAGES.HOLD:
      return 'Decide whether to resume or reject this lead.'
    case STAGES.NO_CONTACT:
      return 'Add a public business contact manually, or archive.'
    default:
      return null
  }
}
