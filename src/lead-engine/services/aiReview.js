/**
 * Workers AI opportunity review.
 *
 * Runs only for leads the deterministic scorer routed to AI. That gate is the
 * cost control and the quality control at once: the model sees a few dozen
 * businesses a day that already look plausible, rather than every domain a
 * directory returned.
 */

import { AI } from '../config/defaults.js'
import { assertFlag } from '../config/flags.js'
import { ACTIVITY } from '../domain/activity.js'
import { STAGES } from '../domain/pipeline.js'
import { runAiTask } from '../ai/client.js'
import { buildOpportunityPayload } from '../ai/payload.js'
import { opportunityReviewSchema } from '../ai/schemas.js'
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from '../ai/prompts/opportunityReview.v1.js'
import { recordActivity } from '../repositories/activity.js'
import { recordAiRun } from '../repositories/aiRuns.js'
import { getCampaign } from '../repositories/campaigns.js'
import { getCompany } from '../repositories/companies.js'
import { listContacts } from '../repositories/contacts.js'
import { getLead, refreshNextAction, transitionLead, updateLeadSummary } from '../repositories/leads.js'
import { listSignals } from '../repositories/research.js'
import { getCurrentScore } from '../repositories/scores.js'
import { resolveSettingsSafely } from '../repositories/settings.js'
import { consumeBudget } from '../repositories/usage.js'
import { createLogger } from './log.js'

/**
 * Reviews one lead.
 *
 * @param {Env} env
 * @param {string} leadId
 * @param {{ correlationId?: string, actorEmail?: string|null }} [options]
 */
export async function reviewLeadOpportunity(env, leadId, options = {}) {
  assertFlag(env, 'ai')

  const db = env.DB
  const lead = await getLead(db, leadId)
  if (!lead) return { status: 'not_found' }

  const logger = createLogger({ correlationId: options.correlationId, campaignId: lead.campaignId, leadId })

  const [company, campaign, signals, score, settings] = await Promise.all([
    getCompany(db, lead.companyId),
    getCampaign(db, lead.campaignId),
    listSignals(db, leadId),
    getCurrentScore(db, leadId),
    resolveSettingsSafely(db),
  ])

  if (!company || !score) return { status: 'not_ready', reason: 'missing_research' }

  // Both the global daily budget and the campaign's own ceiling. The campaign
  // limit is checked as a separate counter so one campaign cannot consume the
  // day's whole AI allowance.
  const globalBudget = await consumeBudget(db, 'ai_reviews', { limits: settings['usage.daily'] })
  if (!globalBudget.allowed) {
    await recordActivity(db, {
      leadId,
      campaignId: lead.campaignId,
      eventType: ACTIVITY.USAGE_LIMIT_REACHED,
      summary: `Daily AI review limit of ${globalBudget.limit} reached. This lead will be reviewed tomorrow.`,
      metadata: { metric: 'ai_reviews', limit: globalBudget.limit },
      correlationId: logger.correlationId,
    })
    logger.log('ai_review_deferred', { stage: 'ai_review', result: 'budget_exhausted' })
    return { status: 'deferred', reason: 'daily_ai_budget_exhausted' }
  }

  const campaignBudget = await consumeBudget(db, 'ai_reviews', {
    campaignId: lead.campaignId,
    limits: { ai_reviews: campaign?.maxAiReviews ?? settings['usage.daily']?.ai_reviews },
  })
  if (!campaignBudget.allowed) {
    logger.log('ai_review_deferred', { stage: 'ai_review', result: 'campaign_budget_exhausted' })
    return { status: 'deferred', reason: 'campaign_ai_budget_exhausted' }
  }

  await transitionLead(db, leadId, STAGES.AI_REVIEW, {
    eventType: ACTIVITY.AI_REVIEW_STARTED,
    summary: 'Sent to Workers AI for opportunity review.',
    correlationId: logger.correlationId,
  })

  const payload = buildOpportunityPayload({
    company,
    campaign,
    signals,
    score,
    technologies: signals.filter((signal) => signal.category === 'technology').map((signal) => signal.valueText).filter(Boolean),
  })

  const aiConfig = { ...AI, ...(settings['ai.config'] || {}) }
  const outcome = await runAiTask(env, {
    task: 'opportunity_review',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(payload),
    promptVersion: PROMPT_VERSION,
    schema: opportunityReviewSchema,
    model: aiConfig.model,
    maxTokens: aiConfig.maxTokens?.opportunity_review,
    temperature: aiConfig.temperature?.opportunity_review,
  })

  await recordAiRun(db, {
    leadId,
    task: 'opportunity_review',
    model: outcome.model,
    promptVersion: outcome.promptVersion,
    status: outcome.status,
    result: outcome.value,
    confidence: outcome.value?.confidence ?? null,
    rawOutput: outcome.rawOutput,
    errorMessage: outcome.error,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    neurons: outcome.usage.neurons,
    durationMs: outcome.durationMs,
  })

  if (outcome.status !== 'ok') {
    // A model failure leaves the lead where the rules put it, and puts it on
    // hold for a human rather than silently rejecting it — the rules already
    // said it was worth looking at.
    await transitionLead(db, leadId, STAGES.HOLD, {
      eventType: ACTIVITY.AI_FAILED,
      summary: `AI review did not produce a usable answer (${outcome.status}).`,
      metadata: { status: outcome.status, error: outcome.error },
      correlationId: logger.correlationId,
    })
    await refreshNextAction(db, leadId)
    logger.log('ai_review_failed', { stage: 'ai_review', result: outcome.status, error: outcome.error })
    return { status: outcome.status, reason: outcome.error }
  }

  const review = outcome.value
  const minConfidence = aiConfig.minConfidenceForOutreach ?? AI.minConfidenceForOutreach
  const qualified = review.qualified && review.confidence >= minConfidence

  await updateLeadSummary(db, leadId, {
    aiConfidence: review.confidence,
    opportunityType: review.opportunity_type,
  })

  if (!qualified) {
    await transitionLead(db, leadId, STAGES.NOT_QUALIFIED, {
      eventType: ACTIVITY.AI_REJECTED,
      summary: review.qualified
        ? `AI qualified this at ${review.confidence.toFixed(2)}, below the ${minConfidence} threshold.`
        : review.reasoning_summary || 'AI did not find a specific opportunity.',
      metadata: { confidence: review.confidence, reasoning: review.reasoning_summary },
      correlationId: logger.correlationId,
    })
    await refreshNextAction(db, leadId)
    logger.log('ai_review_completed', { stage: 'ai_review', result: 'rejected', confidence: review.confidence })
    return { status: 'rejected', review }
  }

  await transitionLead(db, leadId, STAGES.AI_QUALIFIED, {
    eventType: ACTIVITY.AI_QUALIFIED,
    summary: review.observed_problem || 'AI identified an opportunity.',
    metadata: {
      opportunityType: review.opportunity_type,
      confidence: review.confidence,
      devlabService: review.devlab_service,
    },
    correlationId: logger.correlationId,
  })

  // A qualified lead with a contact already on file goes straight to
  // CONTACT_FOUND; one without stops at NO_CONTACT, which is an actionable
  // state a human can resolve by adding an address manually.
  const contacts = await listContacts(db, leadId)
  await transitionLead(db, leadId, contacts.length > 0 ? STAGES.CONTACT_FOUND : STAGES.NO_CONTACT, {
    eventType: contacts.length > 0 ? ACTIVITY.CONTACT_FOUND : ACTIVITY.CONTACT_MISSING,
    summary: contacts.length > 0
      ? `Contactable at ${contacts[0].email}.`
      : 'Qualified, but no public business contact was found.',
    correlationId: logger.correlationId,
  })

  await refreshNextAction(db, leadId)
  logger.log('ai_review_completed', {
    stage: 'ai_review',
    result: 'qualified',
    confidence: review.confidence,
    opportunity_type: review.opportunity_type,
  })

  return { status: 'qualified', review, hasContact: contacts.length > 0 }
}
