/**
 * Composing a reply in the CMS and queueing it for transmission.
 *
 * The boundary, restated because it is the thing most likely to erode: this
 * application decides what may be sent and records what was; n8n submitting to
 * the private Postfix instance puts it on the wire. Nothing here opens a
 * socket. The Email Worker is not an alternative — Cloudflare's `reply()` may
 * only answer the message currently being handled, once per event, and only
 * when that message passed DMARC, so it cannot serve a reply composed later by
 * a person.
 */

import { PRIMARY_ADDRESS } from '../config.js'
import { MAILBOX, verpAddress } from '../domain/mailboxes.js'
import { KIND_OUTBOUND, buildMessageId, buildReferenceChain, parseReferences } from '../domain/messageId.js'
import { buildOutboundMessage, replySubject } from '../outbound/buildMessage.js'
import { newId, operationError } from '../repositories/helpers.js'
import { getMessage, listMessagesForThread } from '../repositories/messages.js'
import { queueOutbound } from '../repositories/outbound.js'
import { createThread, getThread } from '../repositories/threads.js'
import { checkSuppression } from '../../lead-engine/repositories/suppression.js'
import { normalizeEmail } from '../../lead-engine/domain/domains.js'
import { createLogger } from '../../lead-engine/services/log.js'

/**
 * Queues a reply.
 *
 * SUPPRESSION IS RE-CHECKED HERE, at the moment of composing, exactly as the
 * lead engine's outbox re-checks it at the moment of collection. Someone may
 * have unsubscribed between receiving their message and this reply being
 * written, and the whole point of keeping the gates on this side of the
 * boundary is that they run when it matters rather than when it was convenient.
 *
 * @param {Env} env
 * `asDraft` saves it without handing it over, which is what the Drafts folder
 * writes. Suppression is still checked at THIS point rather than at send time:
 * refusing early tells the operator before they spend effort writing, and the
 * check runs again nowhere else because a draft is promoted, not re-composed.
 *
 * @param {{ threadId: string, inReplyToMessageId?: string|null, bodyText: string,
 *           subject?: string|null, toAddress?: string|null, actorEmail?: string|null,
 *           asDraft?: boolean, correlationId?: string }} input
 */
export async function composeReply(env, input) {
  const db = env.DB
  const logger = createLogger({ correlationId: input.correlationId })

  const thread = await getThread(db, input.threadId)
  if (!thread) throw operationError('Thread not found.', 404)

  // The message being answered: the one named, or the most recent inbound one.
  let parent = null
  if (input.inReplyToMessageId) {
    parent = await getMessage(db, input.inReplyToMessageId)
    if (!parent || parent.threadId !== thread.id) {
      throw operationError('That message is not part of this thread.', 400)
    }
  } else {
    const messages = await listMessagesForThread(db, thread.id)
    parent = [...messages].reverse().find((message) => message.direction === 'inbound') ?? null
  }

  // Reply-To wins over From when the sender set one — that is what it is for,
  // and ignoring it sends the answer somewhere nobody reads.
  const recipient = normalizeEmail(input.toAddress || parent?.replyTo || parent?.fromAddress || thread.correspondent)
  if (!recipient) throw operationError('This thread has no address to reply to.', 400)

  const body = String(input.bodyText ?? '').trim()
  // A draft may be empty — that is what a draft is. A reply being sent may not.
  if (!body && !input.asDraft) throw operationError('A reply needs a body.', 422)

  // `checkSuppression` covers the address AND its domain in one query, and
  // returns the matching entry so the refusal can say which rule applied.
  const suppression = await checkSuppression(db, recipient)
  if (suppression.suppressed) {
    throw operationError(
      `That address is suppressed${suppression.entry?.reason ? ` (${suppression.entry.reason})` : ''}. ` +
        'Remove it on the Suppression screen first if this is deliberate.',
      409,
    )
  }

  // Generated before the insert so the Message-ID can carry it — the id is what
  // a DSN echoes back, and it is how a bounce on this reply finds its way home.
  const outboundId = newId()
  const messageId = buildMessageId({ kind: KIND_OUTBOUND, id: outboundId })
  const references = buildReferenceChain({
    parentReferences: parent?.references ?? null,
    parentMessageId: parent?.messageId ?? null,
  })

  const queued = await queueOutbound(db, {
    id: outboundId,
    threadId: thread.id,
    inReplyToMessageId: parent?.id ?? null,
    mailbox: thread.mailbox,
    toAddress: recipient,
    toName: parent?.fromName ?? thread.correspondentName ?? null,
    subject: input.subject ? String(input.subject) : replySubject(parent?.subject ?? thread.subject),
    bodyText: body,
    messageId,
    inReplyTo: parent?.messageId ?? null,
    references: references.length > 0 ? references.map((id) => `<${id}>`).join(' ') : null,
    envelopeFrom: verpAddress(KIND_OUTBOUND, outboundId),
    status: input.asDraft ? 'draft' : 'queued',
    leadId: thread.leadId ?? null,
    createdBy: input.actorEmail ?? null,
  })

  logger.log(input.asDraft ? 'mailbox.reply_drafted' : 'mailbox.reply_queued', {
    outbound_id: outboundId,
    thread_id: thread.id,
    lead_id: thread.leadId ?? null,
    in_reply_to: Boolean(parent),
  })

  return queued
}

/**
 * Starts a NEW conversation — the Compose button.
 *
 * Every other path in this file answers something that already arrived, so it
 * has a thread to attach to. Compose does not, and inventing one lazily at send
 * time would leave the message unattached in the UI until the recipient
 * replied. So a thread is created up front, which also means a reply from them
 * threads onto it by the ordinary rules.
 *
 * SAME GATES AS A REPLY, deliberately: suppression is checked here, the VERP
 * return path and Message-ID are generated here, and nothing is transmitted by
 * this application. A new message is not a lesser act than a reply — if
 * anything it is riskier, because nobody wrote to us first.
 *
 * @param {Env} env
 * @param {{ toAddress: string, subject?: string|null, bodyText: string,
 *           asDraft?: boolean, actorEmail?: string|null, correlationId?: string }} input
 */
export async function composeNew(env, input) {
  const db = env.DB
  const logger = createLogger({ correlationId: input.correlationId })

  const recipient = normalizeEmail(input.toAddress)
  if (!recipient) throw operationError('A valid recipient address is required.', 422)

  const body = String(input.bodyText ?? '').trim()
  if (!body && !input.asDraft) throw operationError('A message needs a body.', 422)

  const suppression = await checkSuppression(db, recipient)
  if (suppression.suppressed) {
    throw operationError(
      `That address is suppressed${suppression.entry?.reason ? ` (${suppression.entry.reason})` : ''}. ` +
        'Remove it on the Suppression screen first if this is deliberate.',
      409,
    )
  }

  const subject = String(input.subject ?? '').trim()
  const thread = await createThread(db, {
    mailbox: MAILBOX.HELLO,
    subject,
    correspondent: recipient,
  })

  const outboundId = newId()

  const queued = await queueOutbound(db, {
    id: outboundId,
    threadId: thread.id,
    inReplyToMessageId: null,
    mailbox: MAILBOX.HELLO,
    toAddress: recipient,
    toName: null,
    subject,
    bodyText: body,
    messageId: buildMessageId({ kind: KIND_OUTBOUND, id: outboundId }),
    // No In-Reply-To or References: this starts a thread rather than joining
    // one, and inventing either would make the recipient's client file it under
    // a conversation that does not exist.
    inReplyTo: null,
    references: null,
    envelopeFrom: verpAddress(KIND_OUTBOUND, outboundId),
    status: input.asDraft ? 'draft' : 'queued',
    leadId: null,
    createdBy: input.actorEmail ?? null,
  })

  logger.log(input.asDraft ? 'mailbox.compose_drafted' : 'mailbox.compose_queued', {
    outbound_id: outboundId,
    thread_id: thread.id,
  })

  return { outbound: queued, threadId: thread.id }
}

/**
 * Renders a queued reply into the finished message plus its envelope.
 *
 * Returned as two separate things on purpose. The envelope is not derivable
 * from the message — that is the entire point of VERP — and a transmitter that
 * infers `MAIL FROM` from the `From:` header (which is what nodemailer does by
 * default, and what n8n's mail node forces) produces a message whose bounces
 * come back to `hello@` with no identifier attached.
 *
 * @param {object} outbound a `mailbox_outbound` row
 * @param {{ date?: Date }} [options]
 */
export function renderOutbound(outbound, options = {}) {
  const raw = buildOutboundMessage({
    to: { email: outbound.toAddress, name: outbound.toName },
    from: { email: PRIMARY_ADDRESS, name: 'DevLab Studios' },
    subject: outbound.subject,
    bodyText: outbound.bodyText,
    messageId: outbound.messageId,
    inReplyTo: outbound.inReplyTo,
    references: parseReferences(outbound.references),
    date: options.date instanceof Date ? options.date : new Date(outbound.createdAt),
  })

  return {
    id: outbound.id,
    envelope: {
      // What the transmitter must issue as MAIL FROM.
      from: outbound.envelopeFrom,
      to: [outbound.toAddress],
    },
    raw,
    // Repeated as plain fields so a transmitter that genuinely cannot take a
    // raw message can still send something — degraded (no threading headers,
    // no VERP), but not broken. The `raw` field is the supported path.
    fallback: {
      from: PRIMARY_ADDRESS,
      to: outbound.toAddress,
      subject: outbound.subject,
      text: outbound.bodyText,
    },
  }
}
