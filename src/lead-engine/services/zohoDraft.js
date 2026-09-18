/**
 * The "Create Zoho Draft" action.
 *
 * Saves an approved CRM draft into the operator's Zoho Drafts folder. It does
 * not send, and it does not move the lead to CONTACTED — a draft sitting in a
 * mailbox is not a contacted prospect, and the only thing that moves a lead to
 * CONTACTED is the Sent-folder sync observing the message actually went out.
 *
 * Every precondition is re-checked here even though the UI already checked
 * them. Time passes between a screen rendering and a button being pressed, and
 * the thing that could have changed in between is a suppression entry.
 */

import { assertFlag } from '../config/flags.js'
import { ACTIVITY } from '../domain/activity.js'
import { STAGES } from '../domain/pipeline.js'
import { buildZohoUrl, createDraft as createZohoDraft } from '../zoho/client.js'
import { readZohoConfig } from '../zoho/oauth.js'
import { recordActivity } from '../repositories/activity.js'
import { getPrimaryContact } from '../repositories/contacts.js'
import { ensureConversation } from '../repositories/conversations.js'
import { getDraft, recordZohoDraftCreated, recordZohoDraftFailure } from '../repositories/drafts.js'
import { getLead, refreshNextAction, transitionLead } from '../repositories/leads.js'
import { checkSuppression } from '../repositories/suppression.js'
import { consumeBudget } from '../repositories/usage.js'
import { createLogger } from './log.js'
import { operationError } from '../repositories/helpers.js'

/**
 * Pushes a CRM draft to Zoho Drafts.
 *
 * @param {Env} env
 * @param {string} draftId
 * @param {{ actorEmail?: string|null, fetchImpl?: typeof fetch, correlationId?: string }} [options]
 * @returns {Promise<{ status: string, zohoDraftId?: string|null, zohoUrl?: string, reason?: string }>}
 */
export async function pushDraftToZoho(env, draftId, options = {}) {
  assertFlag(env, 'zohoMail')

  const db = env.DB
  const draft = await getDraft(db, draftId)
  if (!draft) throw operationError('Draft not found.', 404)

  const lead = await getLead(db, draft.leadId)
  if (!lead) throw operationError('Lead not found.', 404)

  const logger = createLogger({
    correlationId: options.correlationId,
    campaignId: lead.campaignId,
    leadId: lead.id,
  })

  if (draft.status === 'zoho_draft_created') {
    // Idempotent: pressing the button twice must not create a second draft in
    // the mailbox for the operator to choose between.
    return { status: 'already_created', zohoDraftId: draft.zohoDraftId, zohoUrl: buildZohoUrl({ folder: 'drafts' }) }
  }

  if (draft.status === 'discarded' || draft.status === 'superseded') {
    throw operationError('This draft is no longer current. Regenerate it first.', 409)
  }

  const contact = await getPrimaryContact(db, draft.leadId)
  if (!contact) throw operationError('This lead has no contact to send to.', 422)

  // Re-checked at the moment of action, not merely when the screen rendered.
  // A suppression entry added in between is exactly the case this catches.
  const suppression = await checkSuppression(db, contact.email)
  if (suppression.suppressed) {
    await recordActivity(db, {
      leadId: lead.id,
      campaignId: lead.campaignId,
      eventType: ACTIVITY.COMPLIANCE_BLOCKED,
      actor: 'human',
      actorEmail: options.actorEmail ?? null,
      summary: 'Zoho draft creation refused: the recipient is suppressed.',
      metadata: { reason: suppression.entry?.reason },
      correlationId: logger.correlationId,
    })
    throw operationError(
      `${contact.email} is suppressed (${suppression.entry?.reason?.replace(/_/g, ' ') || 'do not contact'}).`,
      409,
    )
  }

  const config = readZohoConfig(env)
  if (!config.isConfigured) {
    throw operationError(`Zoho is not configured. Missing: ${config.missing.join(', ')}.`, 503)
  }

  const conversation = await ensureConversation(db, {
    leadId: lead.id,
    contactId: contact.id,
    subject: draft.subject,
  })

  try {
    const result = await createZohoDraft(
      env,
      {
        to: contact.email,
        subject: draft.subject,
        bodyText: draft.bodyText,
        // Threading headers for a reply draft, so the operator's manual send
        // lands in the existing thread and the Sent sync can match it back.
        inReplyTo: draft.kind === 'reply' ? await findInReplyTo(db, draft) : null,
      },
      {
        fetchImpl: options.fetchImpl,
        onUsage: () => consumeBudget(db, 'zoho_api_calls'),
      },
    )

    await recordZohoDraftCreated(db, draftId, {
      zohoDraftId: result.draftId,
      zohoMessageId: result.messageId,
    })

    await recordActivity(db, {
      leadId: lead.id,
      campaignId: lead.campaignId,
      conversationId: conversation?.id ?? null,
      eventType: draft.kind === 'reply' ? ACTIVITY.ZOHO_REPLY_DRAFT_CREATED : ACTIVITY.ZOHO_DRAFT_CREATED,
      actor: 'human',
      actorEmail: options.actorEmail ?? null,
      summary: `Saved to Zoho Drafts for ${contact.email}. Open Zoho to review and send it.`,
      metadata: { draftId, zohoDraftId: result.draftId, to: contact.email },
      correlationId: logger.correlationId,
    })

    // READY_TO_CONTACT, NOT contacted. The draft exists in a mailbox; nobody
    // has been emailed. The move to CONTACTED belongs to the Sent-folder sync.
    if (draft.kind === 'initial' && lead.stage !== STAGES.READY_TO_CONTACT) {
      await transitionLead(db, lead.id, STAGES.READY_TO_CONTACT, {
        summary: 'Draft is in Zoho and waiting to be sent manually.',
        actorEmail: options.actorEmail ?? null,
        correlationId: logger.correlationId,
      })
    }

    await refreshNextAction(db, lead.id)
    logger.log('zoho_draft_created', { stage: 'outreach', provider: 'zoho', result: 'ok', draft_id: draftId })

    return { status: 'ok', zohoDraftId: result.draftId, zohoUrl: buildZohoUrl({ folder: 'drafts' }) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Zoho draft creation failed.'

    // The lead is NOT marked contacted and the draft is NOT lost. A Zoho
    // outage must cost a retry, not the generated text.
    await recordZohoDraftFailure(db, draftId, message)
    await recordActivity(db, {
      leadId: lead.id,
      campaignId: lead.campaignId,
      eventType: ACTIVITY.ZOHO_DRAFT_FAILED,
      actor: 'human',
      actorEmail: options.actorEmail ?? null,
      summary: `Zoho draft creation failed: ${message}`,
      metadata: { draftId, code: error?.code },
      correlationId: logger.correlationId,
    })

    logger.log('zoho_draft_failed', { stage: 'outreach', provider: 'zoho', result: 'error', error: message })
    throw operationError(message, error?.status || 502)
  }
}

/**
 * The Message-ID a reply draft should thread onto.
 *
 * The most recent inbound message in the conversation: replying to what they
 * actually said is what puts the draft in the right thread in their client.
 */
async function findInReplyTo(db, draft) {
  if (!draft.inReplyToMessageId) return null
  const row = await db
    .prepare('SELECT internet_message_id FROM lead_messages WHERE id = ?')
    .bind(draft.inReplyToMessageId)
    .first()
  return row?.internet_message_id ?? null
}

/**
 * Records that the operator opened Zoho.
 *
 * Worth a timeline entry: it is the boundary between what this system did and
 * what the human did next, and without it the gap between ZOHO_DRAFT_CREATED
 * and OUTBOUND_MESSAGE_SENT is unexplained.
 *
 * @param {Env} env
 */
export async function recordZohoOpened(env, draftId, options = {}) {
  const { actorEmail = null } = /** @type {{ actorEmail?: string|null }} */ (options)
  const draft = await getDraft(env.DB, draftId)
  if (!draft) throw operationError('Draft not found.', 404)

  await recordActivity(env.DB, {
    leadId: draft.leadId,
    eventType: ACTIVITY.ZOHO_DRAFT_OPENED,
    actor: 'human',
    actorEmail,
    summary: 'Opened Zoho to review the draft.',
    metadata: { draftId },
  })

  return { status: 'ok', zohoUrl: buildZohoUrl({ folder: 'drafts' }) }
}
