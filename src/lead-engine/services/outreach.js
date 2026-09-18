/**
 * Outreach draft generation, and the gate in front of it.
 *
 * SIX conditions must all hold before a draft is generated. They are checked in
 * one place, here, rather than distributed across the callers, because the one
 * that gets forgotten is the one that matters:
 *
 *   1. The lead is rule-qualified.
 *   2. The lead is AI-qualified at or above the confidence threshold.
 *   3. A contact exists.
 *   4. That contact's provenance is acceptable (a recorded public source).
 *   5. The country compliance profile permits review.
 *   6. Neither the address nor its domain is suppressed.
 *
 * Generating a draft is not sending one. Even with all six satisfied, the
 * output is text on a screen that a person edits and then sends by hand from
 * Zoho.
 */

import { AI } from '../config/defaults.js'
import { assertFlag } from '../config/flags.js'
import { ACTIVITY } from '../domain/activity.js'
import { STAGES } from '../domain/pipeline.js'
import { runAiTask } from '../ai/client.js'
import { buildOutreachBrief } from '../ai/payload.js'
import { outreachDraftSchema } from '../ai/schemas.js'
import { validateGeneratedMessage } from '../ai/validate.js'
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from '../ai/prompts/outreachDraft.v1.js'
import { evaluateCompliance, isReadyForOutreachReview } from '../compliance/evaluate.js'
import { buildUnsubscribeInstruction, messageContainsOptOutInstruction } from '../compliance/optOut.js'
import { recordActivity } from '../repositories/activity.js'
import { recordAiRun, getLatestAiRun } from '../repositories/aiRuns.js'
import { getComplianceReview, recordComplianceEvaluation } from '../repositories/compliance.js'
import { getCompany } from '../repositories/companies.js'
import { getPrimaryContact } from '../repositories/contacts.js'
import { createDraft } from '../repositories/drafts.js'
import { getLead, refreshNextAction, transitionLead } from '../repositories/leads.js'
import { listSignals } from '../repositories/research.js'
import { resolveSettingsSafely } from '../repositories/settings.js'
import { checkSuppression } from '../repositories/suppression.js'
import { createLogger } from './log.js'

/** What DevLab can actually do, given to the model so it has something concrete
 *  to check "do not claim an unlisted capability" against. */
const DEVLAB_CAPABILITIES = Object.freeze([
  'Custom web applications',
  'Workflow automation',
  'Systems and API integration',
  'Website development',
  'Data and reporting tooling',
])

/**
 * Runs the six-condition gate.
 *
 * Returns every failing condition rather than the first, so the lead detail
 * screen can tell the operator everything that needs fixing in one pass.
 *
 * @param {Env} env
 * @param {string} leadId
 * @returns {Promise<{ ready: boolean, blockers: Array<{ code: string, detail: string }>,
 *                     lead, company, contact, compliance }>}
 */
export async function checkOutreachReadiness(env, leadId) {
  const db = env.DB
  const blockers = []

  const lead = await getLead(db, leadId)
  if (!lead) return { ready: false, blockers: [{ code: 'lead_not_found', detail: 'Lead not found.' }] }

  const [company, contact, settings, aiRun] = await Promise.all([
    getCompany(db, lead.companyId),
    getPrimaryContact(db, leadId),
    resolveSettingsSafely(db),
    getLatestAiRun(db, leadId, 'opportunity_review'),
  ])

  if (lead.ruleScore === null || lead.ruleScore === undefined) {
    blockers.push({ code: 'not_scored', detail: 'This lead has not been researched and scored yet.' })
  }

  const review = aiRun?.result || null
  if (!review) {
    blockers.push({ code: 'no_ai_review', detail: 'No Workers AI opportunity review has succeeded for this lead.' })
  } else if (!review.qualified || (review.confidence ?? 0) < (settings['ai.config']?.minConfidenceForOutreach ?? AI.minConfidenceForOutreach)) {
    blockers.push({ code: 'ai_not_qualified', detail: 'The AI review did not qualify this lead.' })
  }

  if (!contact) {
    blockers.push({ code: 'no_contact', detail: 'No public business contact has been recorded.' })
  } else if (!contact.sourceUrl || !contact.sourceType || !contact.publishedPublicly) {
    // Provenance is an admission requirement, not a nice-to-have: an address
    // whose public source we cannot point at is not one to email a stranger at.
    blockers.push({ code: 'contact_provenance', detail: 'The contact has no acceptable recorded public source.' })
  }

  let compliance = null
  let suppression = { suppressed: false, entry: null }

  if (contact) {
    suppression = await checkSuppression(db, contact.email)

    // The stored review is passed back in so the PH profile's legal-basis and
    // privacy checks can see a human's earlier decision — without it, a market
    // that requires human review could never reach a passing state.
    const storedReview = await getComplianceReview(db, leadId)

    compliance = evaluateCompliance({
      countryCode: company?.countryCode || lead.countryCode,
      businessIdentity: settings['business.identity'] || {},
      contact,
      lead,
      suppression,
      review: storedReview,
    })

    await recordComplianceEvaluation(db, leadId, {
      countryCode: compliance.countryCode,
      profileKey: compliance.profileKey,
      state: compliance.state,
      checks: compliance.checks,
    })

    if (suppression.suppressed) {
      blockers.push({
        code: 'suppressed',
        detail: suppression.entry
          ? `Suppressed (${suppression.entry.reason.replace(/_/g, ' ')}).`
          : 'This address cannot be contacted.',
      })
    }

    if (!isReadyForOutreachReview(compliance)) {
      // Built from `checks` rather than `blockingReasons`: the latter is
      // pre-formatted display strings, and the blocker list needs a stable
      // machine-readable code per failure so the UI can group and link them.
      for (const check of compliance.checks) {
        if (check.required && !check.passed) {
          blockers.push({ code: `compliance:${check.key}`, detail: check.detail })
        }
      }
    }
  }

  return { ready: blockers.length === 0, blockers, lead, company, contact, compliance, review }
}

/**
 * Generates an outreach draft.
 *
 * @param {Env} env
 * @param {string} leadId
 * @param {{ variant?: string|null, actorEmail?: string|null, correlationId?: string }} [options]
 */
export async function generateOutreachDraft(env, leadId, options = {}) {
  assertFlag(env, 'ai')

  const db = env.DB
  const readiness = await checkOutreachReadiness(env, leadId)
  const logger = createLogger({ correlationId: options.correlationId, leadId })

  if (!readiness.ready) {
    logger.log('outreach_draft_blocked', { stage: 'outreach', result: 'blocked', blockers: readiness.blockers.map((b) => b.code) })
    return { status: 'blocked', blockers: readiness.blockers }
  }

  const { lead, company, contact, review } = readiness
  const [signals, settings] = await Promise.all([listSignals(db, leadId), resolveSettingsSafely(db)])

  const evidence = signals
    .filter((signal) => signal.evidence || signal.valueText)
    .slice(0, 8)
    .map((signal) => signal.evidence || `${signal.signalKey}: ${signal.valueText}`)

  const brief = buildOutreachBrief({
    company,
    opportunity: review,
    contact,
    sender: settings['business.identity'] || {},
    capabilities: DEVLAB_CAPABILITIES,
    evidence,
    trackedLinks: [],
  })

  const aiConfig = { ...AI, ...(settings['ai.config'] || {}) }
  const outcome = await runAiTask(env, {
    task: 'outreach_draft',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(brief, options.variant ?? null),
    promptVersion: PROMPT_VERSION,
    schema: outreachDraftSchema,
    model: aiConfig.model,
    maxTokens: aiConfig.maxTokens?.outreach_draft,
    temperature: aiConfig.temperature?.outreach_draft,
  })

  const aiRunId = await recordAiRun(db, {
    leadId,
    task: 'outreach_draft',
    model: outcome.model,
    promptVersion: outcome.promptVersion,
    status: outcome.status,
    result: outcome.value,
    rawOutput: outcome.rawOutput,
    errorMessage: outcome.error,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    neurons: outcome.usage.neurons,
    durationMs: outcome.durationMs,
  })

  if (outcome.status !== 'ok') {
    logger.log('outreach_draft_failed', { stage: 'outreach', result: outcome.status, error: outcome.error })
    return { status: outcome.status, reason: outcome.error }
  }

  // Content validation is separate from schema validation and is NOT silently
  // repaired. A draft that trips it is stored with the violations attached, so
  // the human reviewing it sees exactly what the model claimed rather than a
  // laundered version of it.
  const contentCheck = validateGeneratedMessage(
    {
      subject: outcome.value.subject,
      body: outcome.value.body,
      referencedObservations: outcome.value.referenced_observations,
    },
    { allowedLinks: [], availableEvidence: [...evidence, ...signals.map((signal) => signal.signalKey)] },
  )

  const identity = settings['business.identity'] || {}
  const optOutLine = buildUnsubscribeInstruction(identity)
  const body = messageContainsOptOutInstruction(outcome.value.body)
    ? outcome.value.body
    : `${outcome.value.body}\n\n${optOutLine}`

  const draft = await createDraft(db, {
    leadId,
    contactId: contact.id,
    kind: 'initial',
    subject: outcome.value.subject,
    bodyText: body,
    aiRunId,
    generatedBy: 'ai',
    variant: options.variant ?? null,
  })

  await recordActivity(db, {
    leadId,
    campaignId: lead.campaignId,
    eventType: options.variant ? ACTIVITY.OUTREACH_DRAFT_REGENERATED : ACTIVITY.OUTREACH_DRAFT_CREATED,
    actor: options.actorEmail ? 'human' : 'system',
    actorEmail: options.actorEmail ?? null,
    summary: options.variant ? `Regenerated the outreach draft (${options.variant}).` : 'Generated an outreach draft.',
    metadata: { draftId: draft.id, violations: contentCheck.violations },
    correlationId: logger.correlationId,
  })

  // READY_FOR_REVIEW, not READY_TO_CONTACT: a human has not looked at this yet,
  // and the distinction is what keeps the review queue meaningful.
  if (lead.stage !== STAGES.READY_FOR_REVIEW && lead.stage !== STAGES.READY_TO_CONTACT) {
    await transitionLead(db, leadId, STAGES.READY_FOR_REVIEW, {
      eventType: ACTIVITY.READY_FOR_REVIEW,
      summary: 'Outreach draft ready for human review.',
      correlationId: logger.correlationId,
    })
  }

  await refreshNextAction(db, leadId)
  logger.log('outreach_draft_created', {
    stage: 'outreach',
    result: 'ok',
    draft_id: draft.id,
    violations: contentCheck.violations.length,
  })

  return { status: 'ok', draft, violations: contentCheck.violations }
}
