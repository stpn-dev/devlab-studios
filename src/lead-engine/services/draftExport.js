/**
 * The "Export draft" action — what replaced writing into a mailbox over an API.
 *
 * Builds an RFC 5322 file for an approved CRM draft and hands it to the
 * operator, who opens it in their own mail client and presses Send themselves.
 * See mail/eml.js for why there is no mailbox integration any more: polling a
 * personal mailbox from a Worker's rotating egress IPs got the account blocked
 * for suspicious logins, and no change of provider fixes that.
 *
 * NOTHING HERE SENDS, and now there is not even a provider that could. The
 * previous implementation guaranteed that by hard-coding `mode: 'draft'` in an
 * API call; this one guarantees it by producing an inert file.
 *
 * EVERY PRECONDITION IS RE-CHECKED HERE even though the screen already checked
 * them, and for the same reason as before: time passes between a screen
 * rendering and a button being pressed, and the thing that changes in that gap
 * is a suppression entry.
 */

import { assertFlag } from '../config/flags.js'
import { withOperationalFlags } from '../config/operationalFlags.js'
import { ACTIVITY } from '../domain/activity.js'
import { STAGES } from '../domain/pipeline.js'
import { buildEmlFilename, buildEmlMessage } from '../mail/eml.js'
import { findDraftContentCheck, recordActivity } from '../repositories/activity.js'
import { getCompany } from '../repositories/companies.js'
import { getPrimaryContact } from '../repositories/contacts.js'
import { ensureConversation } from '../repositories/conversations.js'
import { getDraft, recordDraftExported } from '../repositories/drafts.js'
import { getLead, refreshNextAction, transitionLead } from '../repositories/leads.js'
import { resolveSettingsSafely } from '../repositories/settings.js'
import { checkSuppression } from '../repositories/suppression.js'
import { createLogger } from './log.js'
import { operationError } from '../repositories/helpers.js'

/**
 * Prepares an approved draft for download.
 *
 * @param {Env} env
 * @param {string} draftId
 * @param {{ actorEmail?: string|null, correlationId?: string, now?: Date }} [options]
 * @returns {Promise<{ status: string, filename: string, contentType: string, message: string,
 *                     to: string, subject: string, bodyText: string }>}
 */
export async function exportDraft(env, draftId, options = {}) {
  env = await withOperationalFlags(env)
  // Gated on the engine itself rather than on a mail-provider flag, because
  // there is no provider to enable or disable any more.
  assertFlag(env, 'engine')

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

  if (draft.status === 'discarded' || draft.status === 'superseded') {
    throw operationError('This draft is no longer current. Regenerate it first.', 409)
  }

  const contact = await getPrimaryContact(db, draft.leadId)
  if (!contact) throw operationError('This lead has no contact to send to.', 422)

  // Re-checked at the moment of action. A suppression entry added between the
  // screen rendering and this button being pressed is exactly what this
  // catches, and the one failure that must never be a warning.
  const suppression = await checkSuppression(db, contact.email)
  if (suppression.suppressed) {
    await recordActivity(db, {
      leadId: lead.id,
      campaignId: lead.campaignId,
      eventType: ACTIVITY.COMPLIANCE_BLOCKED,
      actor: 'human',
      actorEmail: options.actorEmail ?? null,
      summary: 'Draft export refused: the recipient is suppressed.',
      metadata: { reason: suppression.entry?.reason },
      correlationId: logger.correlationId,
    })
    throw operationError(
      `${contact.email} is suppressed (${suppression.entry?.reason?.replace(/_/g, ' ') || 'do not contact'}).`,
      409,
    )
  }

  // A generated draft that tripped the content guard has to be corrected and
  // saved by a person first. The warning is a gate, not decoration the next
  // button ignores.
  if (draft.generatedBy === 'ai') {
    const contentCheck = await findDraftContentCheck(db, draft.id)

    if (!contentCheck) {
      throw operationError(
        'This AI draft has no content-safeguard record. Regenerate it before exporting.',
        422,
      )
    }
    if (contentCheck.violations.length > 0) {
      throw operationError('This AI draft failed content safeguards. Edit and save it before exporting.', 422)
    }
  }

  const settings = await resolveSettingsSafely(db)
  const identity = settings['business.identity'] || {}
  const company = await getCompany(db, lead.companyId)

  const conversation = await ensureConversation(db, {
    leadId: lead.id,
    contactId: contact.id,
    subject: draft.subject,
  })

  const message = buildEmlMessage({
    to: { email: contact.email, name: contact.fullName ?? null },
    // Only asserted when the operator has configured it. An unset sender lets
    // their own client fill in whichever account they open the file with.
    from: identity.senderEmail
      ? { email: identity.senderEmail, name: identity.senderName || null }
      : null,
    subject: draft.subject,
    bodyText: draft.bodyText,
    inReplyTo: draft.kind === 'reply' ? await findInReplyTo(db, draft) : null,
    date: options.now instanceof Date ? options.now : new Date(),
  })

  await recordDraftExported(db, draftId)

  await recordActivity(db, {
    leadId: lead.id,
    campaignId: lead.campaignId,
    conversationId: conversation?.id ?? null,
    eventType: draft.kind === 'reply' ? ACTIVITY.REPLY_DRAFT_EXPORTED : ACTIVITY.OUTREACH_DRAFT_EXPORTED,
    actor: 'human',
    actorEmail: options.actorEmail ?? null,
    summary: `Exported the draft for ${contact.email}. Open it in your mail client to review and send.`,
    metadata: { draftId, to: contact.email },
    correlationId: logger.correlationId,
  })

  // READY_TO_CONTACT, NOT contacted. A file on somebody's disk is not a
  // contacted prospect. Nothing observes the send any more, so the move to
  // CONTACTED is an explicit act by the person who sent it.
  if (draft.kind === 'initial' && lead.stage !== STAGES.READY_TO_CONTACT) {
    await transitionLead(db, lead.id, STAGES.READY_TO_CONTACT, {
      summary: 'Draft exported and waiting to be sent manually.',
      actorEmail: options.actorEmail ?? null,
      correlationId: logger.correlationId,
    })
  }

  await refreshNextAction(db, lead.id)
  logger.log('outreach_draft_exported', { stage: 'outreach', result: 'ok', draft_id: draftId })

  return {
    status: 'ok',
    filename: buildEmlFilename({ subject: draft.subject, companyName: company?.name ?? null }),
    contentType: 'message/rfc822',
    message,
    to: contact.email,
    toName: contact.fullName ?? null,
    // The configured sender identity, so the outbox can build a transmittable
    // message with the same From the download asserts. Null when unconfigured,
    // which the compliance gate already refuses to let through.
    from: identity.senderEmail
      ? { email: identity.senderEmail, name: identity.senderName || null }
      : null,
    subject: draft.subject,
    bodyText: draft.bodyText,
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
