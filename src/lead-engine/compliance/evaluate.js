/**
 * Runs a country profile's checks against one lead.
 *
 * SCOPE: this produces an OPERATIONAL SAFEGUARD RECORD with PROVENANCE, for
 * AUDITABILITY. It is NOT a legal-decision engine and it must never be
 * presented as one. A `passed` result means "every configured check we know how
 * to run came back clean" — it does not mean the outreach is lawful, and no
 * screen, export or API response derived from this function may say that it
 * does. The useful claim is the narrow one: here is what was checked, here is
 * what it found, here is the evidence, here is who reviewed it.
 *
 * Manual sending is NOT exempt. This evaluation applies to a message a person
 * writes by hand exactly as it applies to a generated draft; the engine drafting
 * rather than sending is an operational choice and changes nothing about the
 * commercial-email and privacy expectations the checks encode.
 *
 * PURE. Configuration and already-fetched records in, verdict out — no database
 * access, no network, no clock. The caller fetches the suppression result and
 * the stored review and passes them in, which keeps this function exhaustively
 * testable and re-runnable over historical records.
 *
 * It never returns `waived`. Waiving is a human act with a required written
 * reason and it lives in repositories/compliance.js; a function that could
 * compute its way to `waived` would make the one state that means "a person
 * accepted this risk" indistinguishable from a rule firing.
 */

import { BUSINESS_IDENTITY_FIELDS } from '../config/defaults.js'
import { getCountryProfile, HARD_BOUNDARY_CHECK_KEYS } from './countryProfiles.js'
import { buildUnsubscribeInstruction, messageContainsOptOutInstruction } from './optOut.js'

/**
 * Lead stages that mean "a person or an inbound opt-out said no".
 *
 * Mirrors the stage vocabulary in migrations/0012_lead_intelligence_engine.sql.
 * A stage not listed here is not treated as consent — it is simply not a
 * refusal.
 */
export const DO_NOT_CONTACT_STAGES = Object.freeze(['DO_NOT_CONTACT', 'UNSUBSCRIBED', 'NO_CONTACT'])

/** @param {unknown} value */
function present(value) {
  return String(value ?? '').trim().length > 0
}

/**
 * One evaluator per check key, returning the pass/fail and the sentence the
 * lead detail screen shows underneath it.
 *
 * Every detail is written to be actionable: a blocked lead should tell the
 * reader what to change, not that something is wrong.
 */
const EVALUATORS = Object.freeze({
  /**
   * The hard boundary. `suppression` is the result of
   * repositories/suppression.js `checkSuppression`, passed in by the caller.
   * A missing result fails rather than passes: "we did not check" and "we
   * checked and it was clean" must never collapse into the same outcome for
   * the one check that has no acceptable failure mode.
   */
  recipient_not_suppressed({ suppression }) {
    if (!suppression) {
      return { passed: false, detail: 'Suppression was not checked before this evaluation ran.' }
    }
    if (suppression.suppressed) {
      const reason = suppression.entry?.reason ?? 'unknown reason'
      const scope = suppression.entry?.scope === 'domain' ? 'domain' : 'address'
      return { passed: false, detail: `Suppressed by ${scope} (${reason}).` }
    }
    return { passed: true, detail: 'Neither the address nor its domain is suppressed.' }
  },

  not_do_not_contact({ lead }) {
    const stage = String(lead?.stage ?? '').trim().toUpperCase()
    if (DO_NOT_CONTACT_STAGES.includes(stage)) {
      return { passed: false, detail: `Lead is at stage ${stage}.` }
    }
    return { passed: true, detail: 'Lead is not marked do-not-contact.' }
  },

  sender_identity_configured({ businessIdentity }) {
    const missing = BUSINESS_IDENTITY_FIELDS.sender.filter((field) => !present(businessIdentity[field]))
    if (missing.length) {
      return { passed: false, detail: `Business identity settings are missing: ${missing.join(', ')}.` }
    }
    return { passed: true, detail: `Sending as ${businessIdentity.senderName} <${businessIdentity.senderEmail}>.` }
  },

  postal_address_configured({ businessIdentity }) {
    const missing = BUSINESS_IDENTITY_FIELDS.postal.filter((field) => !present(businessIdentity[field]))
    if (missing.length) {
      return { passed: false, detail: `Business postal address is incomplete: ${missing.join(', ')}.` }
    }
    return { passed: true, detail: 'A complete business postal address is configured.' }
  },

  contact_provenance_recorded({ contact }) {
    if (!contact) return { passed: false, detail: 'No contact has been recorded for this lead yet.' }
    if (!present(contact.sourceUrl) || !present(contact.sourceType)) {
      return { passed: false, detail: 'The contact has no recorded source URL or source type.' }
    }
    if (contact.publishedPublicly !== true) {
      return { passed: false, detail: 'The contact is not recorded as publicly published.' }
    }
    return { passed: true, detail: `Observed on ${contact.sourceUrl} (${contact.sourceType}).` }
  },

  /**
   * Two questions, in order: can an opt-out line be produced for this sender,
   * and — when the caller attached the draft under review — is it actually in
   * the text? The second half exists because a draft that lost its opt-out line
   * during editing looks identical to one that never needed it.
   */
  opt_out_mechanism_present({ businessIdentity, lead }) {
    if (!buildUnsubscribeInstruction(businessIdentity)) {
      return { passed: false, detail: 'No sender address is configured, so no opt-out line can be produced.' }
    }

    const draft = lead?.draftBodyText
    if (present(draft) && !messageContainsOptOutInstruction(draft)) {
      return { passed: false, detail: 'The draft under review does not contain a reply-to-opt-out instruction.' }
    }

    return { passed: true, detail: 'A reply-to-opt-out instruction is available for this sender.' }
  },

  /**
   * Records that a person asserted a basis. It does not assess the basis —
   * this module has no opinion on whether the assertion is correct, only on
   * whether it exists and is attributable.
   */
  legal_basis_recorded({ review }) {
    if (!present(review?.legalBasis)) {
      return { passed: false, detail: 'No legal basis has been recorded for this lead.' }
    }
    return { passed: true, detail: `Recorded basis: ${review.legalBasis}.` }
  },

  privacy_review_recorded({ review }) {
    if (!present(review?.reviewedBy) || !present(review?.legalBasisReference)) {
      return {
        passed: false,
        detail: 'No named reviewer and reference to a privacy assessment have been recorded.',
      }
    }
    return { passed: true, detail: `Reviewed by ${review.reviewedBy}, reference ${review.legalBasisReference}.` }
  },

  /**
   * Shares the opt-out mechanism on purpose. An objection and an unsubscribe
   * arrive through the same reply, are detected by the same deterministic
   * check, and land in the same suppression registry — two separate routes
   * would mean two chances to leave one of them unwired.
   */
  objection_handling_available({ businessIdentity }) {
    if (!buildUnsubscribeInstruction(businessIdentity)) {
      return { passed: false, detail: 'No sender address is configured, so there is no route to object.' }
    }
    return { passed: true, detail: 'Replies to the configured sender address reach the suppression registry.' }
  },

  /** Only reachable from the fallback profile, and it is the reason it exists. */
  market_profile_configured({ countryCode }) {
    const named = present(countryCode) ? countryCode : 'an unrecorded country'
    return { passed: false, detail: `No country profile is configured for ${named}.` }
  },
})

/**
 * Evaluates one lead against its market's profile.
 *
 * @param {{
 *   countryCode?: unknown,
 *   businessIdentity?: { senderName?, senderEmail?, postalAddress?, city?, region?, postalCode?, countryCode?, legalName? },
 *   contact?: { sourceUrl?, sourceType?, publishedPublicly? }|null,
 *   lead?: { stage?: string, draftBodyText?: string }|null,
 *   suppression?: { suppressed: boolean, entry?: object|null }|null,
 *   review?: { legalBasis?, legalBasisReference?, reviewedBy? }|null,
 * }} input
 * @returns {{ profileKey: string, countryCode: string, state: 'passed'|'blocked'|'needs_human_review',
 *             checks: Array<{ key: string, required: boolean, passed: boolean, detail: string }>,
 *             blockingReasons: string[] }}
 */
export function evaluateCompliance(input = {}) {
  const profile = getCountryProfile(input.countryCode)
  const context = {
    countryCode: profile.countryCode,
    businessIdentity: input.businessIdentity ?? {},
    contact: input.contact ?? null,
    lead: input.lead ?? null,
    suppression: input.suppression ?? null,
    review: input.review ?? null,
  }

  const checks = profile.checks.map((check) => {
    const evaluator = EVALUATORS[check.key]
    // A profile check with no evaluator would silently count as passing, which
    // is the one outcome this file must never produce by accident. Throwing is
    // loud, happens in tests, and is unreachable in production because a test
    // asserts the two maps agree.
    if (!evaluator) throw new Error(`No evaluator for compliance check "${check.key}"`)

    const { passed, detail } = evaluator(context)
    return { key: check.key, required: check.required, passed, detail }
  })

  const failedRequired = checks.filter((check) => check.required && !check.passed)
  const hardFailures = failedRequired.filter((check) => HARD_BOUNDARY_CHECK_KEYS.includes(check.key))

  // Hard boundary first: a suppressed recipient is blocked whatever else is
  // wrong, and "blocked" must not be downgraded to "someone should look at it"
  // merely because a configuration check also failed.
  const state = hardFailures.length > 0
    ? 'blocked'
    : failedRequired.length > 0 ? 'needs_human_review' : 'passed'

  const reasonSource = hardFailures.length > 0 ? hardFailures : failedRequired
  const labels = new Map(profile.checks.map((check) => [check.key, check.label]))

  return {
    profileKey: profile.key,
    countryCode: profile.countryCode,
    state,
    checks,
    blockingReasons: reasonSource.map((check) => `${labels.get(check.key)}: ${check.detail}`),
  }
}

/**
 * Whether a lead may be shown in the outreach review queue.
 *
 * Accepts either a fresh evaluation or the stored review row, because the queue
 * reads the stored row and a human may have waived a block there. `waived` is
 * honoured here and nowhere else in this directory: it can only have been
 * written by repositories/compliance.js, which requires a named reviewer and a
 * written reason. Everything else — including `pending` — keeps the lead out.
 *
 * @param {{ state?: string }|null|undefined} evaluation
 * @returns {boolean}
 */
export function isReadyForOutreachReview(evaluation) {
  return evaluation?.state === 'passed' || evaluation?.state === 'waived'
}
