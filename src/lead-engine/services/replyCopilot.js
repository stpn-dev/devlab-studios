/**
 * The reply copilot: analyse an inbound message, suggest a response.
 *
 * A COPILOT, not an agent. It reads, it summarizes, it drafts — and then it
 * stops. Nothing here sends, schedules a send, or marks a conversation
 * resolved. The operator reads the analysis, edits the draft, pushes it to Zoho
 * Drafts and sends it themselves.
 *
 * Deterministic opt-out detection has already run in the mailbox sync by the
 * time anything here executes, and a message that tripped it never reaches this
 * module. Re-checked below anyway: this function is also reachable from a
 * manual "analyse now" action, and the check is one string scan.
 */

import { AI } from '../config/defaults.js'
import { assertFlag } from '../config/flags.js'
import { ACTIVITY } from '../domain/activity.js'
import { STAGES } from '../domain/pipeline.js'
import { runAiTask } from '../ai/client.js'
import { buildReplyBrief, buildReplyContext } from '../ai/payload.js'
import { replyAnalysisSchema, replyDraftSchema } from '../ai/schemas.js'
import { validateGeneratedMessage } from '../ai/validate.js'
import * as replyAnalysisPrompt from '../ai/prompts/replyAnalysis.v1.js'
import * as replyDraftPrompt from '../ai/prompts/replyDraft.v1.js'
import { detectOptOut } from '../compliance/optOut.js'
import { recordActivity } from '../repositories/activity.js'
import { getLatestAiRun, recordAiRun } from '../repositories/aiRuns.js'
import { getCompany } from '../repositories/companies.js'
import { attachMessageAnalysis, listMessages } from '../repositories/conversations.js'
import { createDraft } from '../repositories/drafts.js'
import { getLead, refreshNextAction, transitionLead } from '../repositories/leads.js'
import { resolveSettingsSafely } from '../repositories/settings.js'
import { checkSuppression } from '../repositories/suppression.js'
import { operationError } from '../repositories/helpers.js'
import { createLogger } from './log.js'

const DEVLAB_CAPABILITIES = Object.freeze([
  'Custom web applications',
  'Workflow automation',
  'Systems and API integration',
  'Website development',
  'Data and reporting tooling',
])

/** Reads one stored message with its conversation. */
async function loadMessage(db, messageId) {
  const row = await db
    .prepare(
      `SELECT m.*, cv.subject AS conversation_subject, cv.id AS conversation_id
       FROM lead_messages m JOIN lead_conversations cv ON cv.id = m.conversation_id
       WHERE m.id = ?`,
    )
    .bind(messageId)
    .first()

  if (!row) return null
  return {
    id: row.id,
    conversationId: row.conversation_id,
    leadId: row.lead_id,
    direction: row.direction,
    fromAddress: row.from_address,
    subject: row.subject,
    bodyText: row.body_text,
    receivedAt: row.received_at,
    conversationSubject: row.conversation_subject,
  }
}

/**
 * Analyses one inbound message.
 *
 * @param {{ DB: object, AI?: object }} env
 * @param {string} messageId
 * @param {{ correlationId?: string }} [options]
 */
export async function analyzeReply(env, messageId, options = {}) {
  assertFlag(env, 'ai')

  const db = env.DB
  const message = await loadMessage(db, messageId)
  if (!message) throw operationError('Message not found.', 404)
  if (message.direction !== 'inbound') return { status: 'skipped', reason: 'not_inbound' }

  const logger = createLogger({ correlationId: options.correlationId, leadId: message.leadId })

  // Re-checked because this path is also reachable from a manual action. The
  // deterministic decision always wins; the model is never asked.
  const optOut = detectOptOut(message.bodyText, message.subject)
  if (optOut.detected) {
    logger.log('reply_analysis_skipped', { stage: 'reply', result: 'opt_out' })
    return { status: 'skipped', reason: 'opt_out_detected', optOut }
  }

  const lead = await getLead(db, message.leadId)
  if (!lead) throw operationError('Lead not found.', 404)

  const [company, history, opportunityRun, settings] = await Promise.all([
    getCompany(db, lead.companyId),
    listMessages(db, message.conversationId),
    getLatestAiRun(db, message.leadId, 'opportunity_review'),
    resolveSettingsSafely(db),
  ])

  const aiConfig = { ...AI, ...(settings['ai.config'] || {}) }
  const outcome = await runAiTask(env, {
    task: 'reply_analysis',
    systemPrompt: replyAnalysisPrompt.SYSTEM_PROMPT,
    userPrompt: replyAnalysisPrompt.buildUserPrompt(
      buildReplyContext({
        company,
        opportunity: opportunityRun?.result || null,
        // Excludes the message being analysed, which is supplied separately —
        // a model shown the same text twice tends to summarize the history
        // rather than answer about the new message.
        messages: history.filter((entry) => entry.id !== messageId),
        newMessage: message,
      }),
    ),
    promptVersion: replyAnalysisPrompt.PROMPT_VERSION,
    schema: replyAnalysisSchema,
    model: aiConfig.model,
    maxTokens: aiConfig.maxTokens?.reply_analysis,
    temperature: aiConfig.temperature?.reply_analysis,
  })

  await recordAiRun(db, {
    leadId: message.leadId,
    conversationId: message.conversationId,
    messageId,
    task: 'reply_analysis',
    model: outcome.model,
    promptVersion: outcome.promptVersion,
    status: outcome.status,
    result: outcome.value,
    confidence: null,
    rawOutput: outcome.rawOutput,
    errorMessage: outcome.error,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    neurons: outcome.usage.neurons,
    durationMs: outcome.durationMs,
  })

  if (outcome.status !== 'ok') {
    logger.log('reply_analysis_failed', { stage: 'reply', result: outcome.status, error: outcome.error })
    return { status: outcome.status, reason: outcome.error }
  }

  const analysis = outcome.value
  await attachMessageAnalysis(db, messageId, {
    classification: analysis.intent,
    aiSummary: analysis.summary,
    aiIntent: analysis.intent,
  })

  await recordActivity(db, {
    leadId: message.leadId,
    campaignId: lead.campaignId,
    conversationId: message.conversationId,
    eventType: ACTIVITY.REPLY_ANALYZED,
    summary: analysis.summary,
    metadata: {
      intent: analysis.intent,
      recommendedAction: analysis.recommended_action,
      needsHumanAttention: analysis.needs_human_attention,
    },
    dedupeKey: `reply_analyzed:${messageId}`,
    correlationId: logger.correlationId,
  })

  // An AI-suggested stage is applied only when it is one the pipeline
  // recognizes AND is not a compliance-terminal one. A model must not be able
  // to move a lead into or out of a suppression state — those transitions
  // belong to the deterministic path alone.
  const suggested = String(analysis.suggested_pipeline_stage || '').toUpperCase()
  const APPLICABLE = [STAGES.CONVERSATION, STAGES.MEETING, STAGES.PROPOSAL, STAGES.NOT_INTERESTED, STAGES.HOLD]
  if (APPLICABLE.includes(suggested)) {
    await transitionLead(db, message.leadId, suggested, {
      summary: `Stage suggested by reply analysis: ${analysis.summary}`,
      metadata: { intent: analysis.intent },
      correlationId: logger.correlationId,
    })
  }

  await refreshNextAction(db, message.leadId)
  logger.log('reply_analyzed', { stage: 'reply', result: 'ok', intent: analysis.intent })

  return { status: 'ok', analysis }
}

/**
 * Generates a suggested reply.
 *
 * @param {{ DB: object, AI?: object }} env
 * @param {string} messageId the inbound message being answered
 * @param {{ variant?: string|null, actorEmail?: string|null, correlationId?: string }} [options]
 */
export async function generateReplyDraft(env, messageId, options = {}) {
  assertFlag(env, 'ai')

  const db = env.DB
  const message = await loadMessage(db, messageId)
  if (!message) throw operationError('Message not found.', 404)

  const logger = createLogger({ correlationId: options.correlationId, leadId: message.leadId })

  // Suppression is a hard boundary for a reply too. Someone who asked to be
  // left alone does not get a suggested response drafted for them.
  const suppression = await checkSuppression(db, message.fromAddress)
  if (suppression.suppressed) {
    return { status: 'blocked', reason: 'suppressed', entry: suppression.entry }
  }

  const lead = await getLead(db, message.leadId)
  if (!lead) throw operationError('Lead not found.', 404)

  const [company, history, analysisRun, opportunityRun, settings] = await Promise.all([
    getCompany(db, lead.companyId),
    listMessages(db, message.conversationId),
    getLatestAiRun(db, message.leadId, 'reply_analysis'),
    getLatestAiRun(db, message.leadId, 'opportunity_review'),
    resolveSettingsSafely(db),
  ])

  const analysis = analysisRun?.result
  if (!analysis) {
    return { status: 'not_ready', reason: 'Analyse the reply before drafting a response.' }
  }

  const brief = buildReplyBrief({
    company,
    opportunity: opportunityRun?.result || null,
    analysis,
    messages: history,
    sender: settings['business.identity'] || {},
    capabilities: DEVLAB_CAPABILITIES,
    subject: message.conversationSubject || message.subject,
  })

  const aiConfig = { ...AI, ...(settings['ai.config'] || {}) }
  const outcome = await runAiTask(env, {
    task: 'reply_draft',
    systemPrompt: replyDraftPrompt.SYSTEM_PROMPT,
    userPrompt: replyDraftPrompt.buildUserPrompt(brief, options.variant ?? null),
    promptVersion: replyDraftPrompt.PROMPT_VERSION,
    schema: replyDraftSchema,
    model: aiConfig.model,
    maxTokens: aiConfig.maxTokens?.reply_draft,
    temperature: aiConfig.temperature?.reply_draft,
  })

  const aiRunId = await recordAiRun(db, {
    leadId: message.leadId,
    conversationId: message.conversationId,
    messageId,
    task: 'reply_draft',
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
    logger.log('reply_draft_failed', { stage: 'reply', result: outcome.status, error: outcome.error })
    return { status: outcome.status, reason: outcome.error }
  }

  const contentCheck = validateGeneratedMessage(
    { subject: outcome.value.subject, body: outcome.value.body },
    { allowedLinks: [] },
  )

  const draft = await createDraft(db, {
    leadId: message.leadId,
    contactId: null,
    conversationId: message.conversationId,
    kind: 'reply',
    inReplyToMessageId: messageId,
    subject: outcome.value.subject,
    bodyText: outcome.value.body,
    aiRunId,
    generatedBy: 'ai',
    variant: options.variant ?? null,
  })

  await recordActivity(db, {
    leadId: message.leadId,
    campaignId: lead.campaignId,
    conversationId: message.conversationId,
    eventType: ACTIVITY.REPLY_DRAFT_CREATED,
    actor: options.actorEmail ? 'human' : 'system',
    actorEmail: options.actorEmail ?? null,
    summary: options.variant ? `Regenerated the reply draft (${options.variant}).` : 'Generated a suggested reply.',
    metadata: { draftId: draft.id, violations: contentCheck.violations },
    correlationId: logger.correlationId,
  })

  await refreshNextAction(db, message.leadId)
  logger.log('reply_draft_created', { stage: 'reply', result: 'ok', violations: contentCheck.violations.length })

  return { status: 'ok', draft, violations: contentCheck.violations }
}

/**
 * Analyse then draft, which is what the queue consumer runs.
 *
 * Sequential and short-circuiting: a failed analysis means there is nothing to
 * draft from, and drafting anyway would produce a reply written without knowing
 * what was asked.
 *
 * @param {{ DB: object, AI?: object }} env
 */
export async function processInboundReply(env, messageId, options = {}) {
  const analysis = await analyzeReply(env, messageId, options)
  if (analysis.status !== 'ok') return { analysis, draft: null }

  // A model that flagged this for human attention has said the situation is
  // unclear. Drafting a confident reply on top of that is exactly the wrong
  // response to uncertainty, so the operator writes this one themselves.
  if (analysis.analysis.needs_human_attention) {
    return { analysis, draft: null, reason: 'needs_human_attention' }
  }

  const draft = await generateReplyDraft(env, messageId, options)
  return { analysis, draft }
}
