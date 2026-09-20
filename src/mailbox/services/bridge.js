/**
 * The bridge from the mailbox into the CRM.
 *
 * WHAT THIS IS FOR. The Lead CRM already has screens that read
 * `lead_conversations` and `lead_messages`: the Conversations thread view, the
 * Replies queue (`listUnansweredReplies`), the reply copilot and the lead
 * timeline. All of them stopped receiving anything when the Zoho mailbox sync
 * was removed. Rather than rebuild those screens against the mailbox tables,
 * an inbound message that belongs to a lead is ALSO written through the lead
 * engine's own `recordMessage`, so they work again unchanged.
 *
 * WHY THAT IS NOT DUPLICATION. The two tables answer different questions and
 * the copy is deliberately lossy in one direction only. The mailbox holds the
 * complete message: raw MIME in R2, attachments, sanitized HTML, the
 * authentication verdict. `lead_messages` holds the plain-text record the CRM
 * reasons about, and 0012 is explicit that it stores nothing more on purpose —
 * "storing full MIME would keep more personal data than the purpose requires."
 * Writing the text across respects that; moving the mailbox into those tables
 * would violate it.
 *
 * Bounces are NOT bridged this way. They go to the lead engine's existing
 * `recordBounce`, which owns suppression, the stage transition and the
 * hard/soft distinction, and has owned them since before this mailbox existed.
 * A bounce is not a conversation and must not appear in the Replies queue.
 */

import { ACTIVITY } from '../../lead-engine/domain/activity.js'
import { recordActivity } from '../../lead-engine/repositories/activity.js'
import { ensureConversation, recordMessage } from '../../lead-engine/repositories/conversations.js'
import { getPrimaryContact } from '../../lead-engine/repositories/contacts.js'
import { getLead, refreshNextAction } from '../../lead-engine/repositories/leads.js'
import { recordBounce } from '../../lead-engine/services/outbox.js'
import { createLogger } from '../../lead-engine/services/log.js'

/**
 * The provider name this mailbox writes under.
 *
 * `lead_messages.provider` has no CHECK constraint (verified against
 * migrations/0012), so a new value is safe — which is exactly the property the
 * three CHECK incidents in this schema taught us to verify rather than assume.
 * The column defaults to 'zoho' for historical reasons; see
 * docs/lead-engine/outreach-handoff.md on the legacy schema names.
 */
export const MAILBOX_PROVIDER = 'devlabconnect'

/**
 * Copies an inbound message into the lead's conversation.
 *
 * `providerMessageId` is the mailbox row id, which makes the copy idempotent
 * through the existing UNIQUE index on (provider, provider_message_id): running
 * this twice for the same message inserts once.
 *
 * @param {D1Database} db
 * @param {{ leadId: string, message: object, correlationId?: string }} input
 */
export async function bridgeToLeadConversation(db, { leadId, message, correlationId }) {
  const logger = createLogger({ correlationId, leadId })

  const lead = await getLead(db, leadId)
  if (!lead) return { status: 'no_lead' }

  const contact = await getPrimaryContact(db, leadId)
  const conversation = await ensureConversation(db, {
    leadId,
    contactId: contact?.id ?? null,
    subject: message.subject || '',
  })

  const recorded = await recordMessage(db, {
    conversationId: conversation.id,
    leadId,
    direction: 'inbound',
    provider: MAILBOX_PROVIDER,
    providerMessageId: message.id,
    providerFolder: message.mailbox ?? null,
    internetMessageId: message.messageId ?? null,
    inReplyTo: message.inReplyTo ?? null,
    references: message.references ?? null,
    fromAddress: message.fromAddress,
    fromName: message.fromName ?? null,
    toAddresses: message.toAddresses ?? [],
    ccAddresses: message.ccAddresses ?? [],
    subject: message.subject ?? '',
    // Text only, by design. See the module note.
    bodyText: message.bodyText ?? '',
    receivedAt: message.receivedAt ?? null,
  })

  if (!recorded.created) {
    logger.log('mailbox.bridge', { result: 'duplicate', mailbox_message: message.id })
    return { status: 'duplicate', conversationId: conversation.id }
  }

  await recordActivity(db, {
    leadId,
    campaignId: lead.campaignId,
    conversationId: conversation.id,
    eventType: ACTIVITY.INBOUND_REPLY,
    actor: 'system',
    summary: `Reply received from ${message.fromAddress}.`,
    metadata: {
      mailboxMessageId: message.id,
      subject: message.subject ?? '',
      // Recorded because a "reply" that failed DMARC is worth distrusting
      // before anyone acts on it.
      dmarc: message.auth?.dmarc ?? null,
    },
    dedupeKey: `mailbox_inbound:${message.id}`,
    correlationId,
  })

  await refreshNextAction(db, leadId)

  logger.log('mailbox.bridge', {
    result: 'ok',
    conversation_id: conversation.id,
    mailbox_message: message.id,
  })

  return { status: 'ok', conversationId: conversation.id, messageId: recorded.message?.id ?? null }
}

/**
 * Correlation methods whose identifier an attacker cannot guess.
 *
 * A VERP tag (`bounce+d-<uuid>@`) and our own `Message-ID` are both issued by
 * us. The only party who learns either one is the actual recipient of that
 * message — so the worst a forger can do with them is suppress themselves,
 * which is an outcome we would honour anyway.
 *
 * The ADDRESS route is deliberately absent. Its input is a `Final-Recipient`
 * line, which is whatever the sender wrote. See below.
 */
const TRUSTED_CORRELATION = new Set(['verp', 'message_id'])

/**
 * Hands a delivery failure to the CRM's existing bounce path.
 *
 * No second bounce state system: this calls `recordBounce`, which decides
 * suppression, records the activity and moves the lead. If the bounce could not
 * be tied to a draft, that is logged and nothing is suppressed — guessing which
 * address a report is about would suppress a business we can never contact
 * again, and that is not reversible from here.
 *
 * WHY AN UNAUTHENTICATED HARD BOUNCE IS RECORDED AS SOFT.
 *
 * A DSN cannot be authenticated. It arrives from an arbitrary third-party MTA
 * with an empty envelope sender, so there is no SPF identity to check and no
 * DMARC alignment to require — that is precisely why VERP exists. Which means
 * the address route, which matches purely on a `Final-Recipient` line the
 * sender wrote, is an assertion by a stranger.
 *
 * Trusting it was an unauthenticated, remote, repeatable denial-of-outreach:
 * anyone could send one plain-text message with `MAIL FROM:<>` and four lines
 * of body text naming any address we were prospecting, and that business would
 * be permanently suppressed and moved to NO_CONTACT with no review. Reproduced
 * against the real schema before this guard existed; `correlate.test.js` now
 * holds that case so it cannot come back.
 *
 * So an address-correlated hard bounce is recorded through the SAME
 * `recordBounce` as everything else, with `kind: 'soft'` — which is the
 * existing, tested meaning of "record this failure and do not suppress". No new
 * state, no new path. The mailbox row keeps the true 5.x.x status, so the
 * Bounces screen shows what actually happened and a person can suppress the
 * address deliberately.
 *
 * The cost is that outreach bounces stop auto-suppressing until the outreach
 * path emits our Message-ID and VERP address — a contained change described in
 * docs/lead-engine/mailbox.md. Under-suppressing costs a retry; the alternative
 * let a stranger delete our prospects.
 *
 * @param {Env} env
 * @param {{ draftId: string|null, kind: 'hard'|'soft', diagnostic: string|null,
 *           method: string|null, correlationId?: string }} input
 */
export async function applyBounceToCrm(env, { draftId, kind, diagnostic, method = null, correlationId }) {
  const logger = createLogger({ correlationId })

  if (!draftId) {
    logger.log('mailbox.bounce', { result: 'uncorrelated', kind, method })
    return { status: 'uncorrelated' }
  }

  const trusted = TRUSTED_CORRELATION.has(String(method))
  const downgraded = kind === 'hard' && !trusted
  const effectiveKind = downgraded ? 'soft' : kind

  const note = downgraded
    ? `Reported as a permanent failure, but matched only by recipient address (${method ?? 'none'}), ` +
      'which any sender can assert. Recorded without suppressing; suppress it by hand if it is genuine. ' +
      `Original diagnostic: ${diagnostic ?? 'none'}`
    : diagnostic

  try {
    const result = await recordBounce(env, draftId, {
      kind: effectiveKind,
      diagnostic: note,
      correlationId,
    })
    logger.log('mailbox.bounce', {
      result: 'recorded',
      kind: effectiveKind,
      reported_kind: kind,
      method,
      trusted,
      downgraded,
      suppressed: result.suppressed,
      draft_id: draftId,
    })
    return { status: 'ok', downgraded, ...result }
  } catch (error) {
    // The engine flag being off, or the draft having been deleted, must not
    // fail an ingest — the bounce is stored in the mailbox either way and is
    // visible on the Bounces screen.
    logger.log('mailbox.bounce', {
      result: 'failed',
      kind,
      draft_id: draftId,
      error: error instanceof Error ? error.message : 'unknown',
    })
    return { status: 'failed' }
  }
}
