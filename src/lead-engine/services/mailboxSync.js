/**
 * Zoho mailbox synchronization.
 *
 * Reads a bounded recent window of the Inbox and Sent folders and keeps ONLY
 * the messages that match a known CRM contact or conversation. The mailbox is
 * not mirrored: messages that are not about a lead are matched, found to be
 * unrelated, and left entirely alone — their bodies are never even fetched,
 * because the list endpoint returns headers and the content endpoint is called
 * only after a match.
 *
 * The Sent folder is what detects a manual send. Nothing in this system presses
 * Send, so the only way a lead becomes CONTACTED is by observing that a message
 * to its contact actually left the mailbox.
 *
 * Every step is idempotent: import is unique on `provider_message_id`, the
 * cursor only advances on success, and the window deliberately overlaps so a
 * message arriving mid-read is not skipped forever.
 */

import { ZOHO } from '../config/defaults.js'
import { assertFlag } from '../config/flags.js'
import { withOperationalFlags } from '../config/operationalFlags.js'
import { ACTIVITY } from '../domain/activity.js'
import { STAGES } from '../domain/pipeline.js'
import { getMessageContent, listMessages } from '../zoho/client.js'
import { readZohoConfig } from '../zoho/oauth.js'
import { extractPlainBody, normalizeZohoMessage } from '../zoho/normalize.js'
import { matchMessageToConversation } from '../zoho/threadMatch.js'
import { detectOptOut } from '../compliance/optOut.js'
import { recordActivity } from '../repositories/activity.js'
import { findContactsByEmail } from '../repositories/contacts.js'
import {
  ensureConversation,
  findConversationByThreadId,
  messageExists,
  recordMessage,
  updateConversationStatus,
} from '../repositories/conversations.js'
import { getLead, refreshNextAction, transitionLead } from '../repositories/leads.js'
import { addSuppression } from '../repositories/suppression.js'
import {
  ensureSyncState,
  getSyncState,
  recordSyncFailure,
  recordSyncSuccess,
} from '../repositories/syncState.js'
import { consumeBudget } from '../repositories/usage.js'
import { createLogger } from './log.js'

/**
 * Finds the conversation a set of Message-IDs belongs to.
 *
 * Injected into the matcher rather than imported by it, so the matching logic
 * stays pure and testable without a database.
 */
function makeMessageIdLookup(db) {
  return async (ids) => {
    if (!ids || ids.length === 0) return null
    const placeholders = ids.map(() => '?').join(', ')
    const row = await db
      .prepare(
        `SELECT cv.id, cv.lead_id, cv.contact_id, cv.last_message_at
         FROM lead_messages m
         JOIN lead_conversations cv ON cv.id = m.conversation_id
         WHERE m.internet_message_id IN (${placeholders})
         ORDER BY m.created_at DESC LIMIT 1`,
      )
      .bind(...ids)
      .first()

    return row ? { id: row.id, leadId: row.lead_id, contactId: row.contact_id, lastMessageAt: row.last_message_at } : null
  }
}

function makeLeadConversationLookup(db) {
  return async (leadId) => {
    const row = await db
      .prepare("SELECT id, lead_id, contact_id, last_message_at FROM lead_conversations WHERE lead_id = ? AND status != 'closed' ORDER BY created_at ASC LIMIT 1")
      .bind(leadId)
      .first()
    return row ? { id: row.id, leadId: row.lead_id, contactId: row.contact_id, lastMessageAt: row.last_message_at } : null
  }
}

/**
 * Synchronizes one folder.
 *
 * @param {Env} env
 * @param {'inbox'|'sent'} folder
 * @param {{ fetchImpl?: typeof fetch, correlationId?: string, limit?: number }} [options]
 * @returns {Promise<{ status: string, seen: number, imported: number, matched: number, reason?: string }>}
 */
export async function syncFolder(env, folder, options = {}) {
  env = await withOperationalFlags(env)
  assertFlag(env, 'zohoMailSync')

  const db = env.DB
  const config = readZohoConfig(env)
  if (!config.isConfigured) {
    return { status: 'not_configured', seen: 0, imported: 0, matched: 0, reason: config.missing.join(', ') }
  }

  const logger = createLogger({ correlationId: options.correlationId })
  const mailbox = config.userEmail

  await ensureSyncState(db, { mailbox, folder })
  const state = await getSyncState(db, { mailbox, folder })

  // The window deliberately overlaps the previous run. Mail providers order by
  // a server timestamp that can move slightly, so a message that arrived during
  // the last read would otherwise be skipped permanently. The overlap is free
  // because import is idempotent on provider_message_id.
  const sinceMs = state?.cursor
    ? Number(state.cursor) - ZOHO.syncOverlapMinutes * 60 * 1000
    : Date.now() - 7 * 24 * 60 * 60 * 1000

  let entries
  try {
    entries = await listMessages(
      env,
      { folder, limit: options.limit ?? ZOHO.syncPageSize, sinceMs },
      { fetchImpl: options.fetchImpl, onUsage: () => consumeBudget(db, 'zoho_api_calls') },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mailbox sync failed.'
    await recordSyncFailure(db, { mailbox, folder, error: message })
    await recordActivity(db, {
      eventType: ACTIVITY.MAILBOX_SYNC_FAILED,
      summary: `${folder} synchronization failed: ${message}`,
      metadata: { folder, code: error?.code },
      correlationId: logger.correlationId,
    })
    logger.log('mailbox_sync_failed', { provider: 'zoho', stage: folder, result: 'error', error: message })
    return { status: 'failed', seen: 0, imported: 0, matched: 0, reason: message }
  }

  const lookups = {
    findConversationByThreadId: (threadId) => findConversationByThreadId(db, threadId),
    findConversationByMessageIds: makeMessageIdLookup(db),
    findContactsByEmail: (email) => findContactsByEmail(db, email),
    findConversationForLead: makeLeadConversationLookup(db),
  }

  let imported = 0
  let matched = 0
  let newestTimestamp = state?.cursor ? Number(state.cursor) : 0

  for (const entry of entries) {
    const message = normalizeZohoMessage(entry, folder)
    if (!message.providerMessageId) continue

    const messageMs = message.timestamp ? new Date(message.timestamp).getTime() : 0
    if (messageMs > newestTimestamp) newestTimestamp = messageMs

    // Cheapest check first: one indexed lookup beats a match, a body fetch and
    // an AI call for a message we already have.
    if (await messageExists(db, message.providerMessageId)) continue

    const match = await matchMessageToConversation({
      message,
      mailboxAddress: mailbox,
      ...lookups,
    })

    // Unrelated mail. No body is fetched, nothing is stored, nothing is
    // analyzed — the mailbox belongs to a person and this system reads only
    // what concerns a lead.
    if (!match.matched) continue

    matched += 1

    let body = { text: '', truncated: false }
    try {
      const content = await getMessageContent(env, message.providerMessageId, {
        fetchImpl: options.fetchImpl,
        onUsage: () => consumeBudget(db, 'zoho_api_calls'),
      })
      body = extractPlainBody(content?.content ?? content?.body ?? '')
    } catch (error) {
      // A body we could not read still gets its header row stored: knowing a
      // reply arrived is more valuable than the text of it, and the operator
      // can open Zoho.
      logger.log('message_body_fetch_failed', {
        provider: 'zoho',
        result: 'error',
        error: error instanceof Error ? error.message : 'unknown',
      })
    }

    const conversation = match.conversation
      ?? (await ensureConversation(db, {
        leadId: match.leadId,
        contactId: match.contactId,
        subject: message.subject,
        providerThreadId: message.providerThreadId,
      }))

    // DETERMINISTIC OPT-OUT DETECTION, before anything else touches this
    // message. A model never gets the chance to disagree with it.
    const optOut = message.direction === 'inbound' ? detectOptOut(body.text, message.subject) : { detected: false }

    const stored = await recordMessage(db, {
      conversationId: conversation.id,
      leadId: match.leadId,
      direction: message.direction,
      provider: 'zoho',
      providerMessageId: message.providerMessageId,
      providerFolder: folder,
      internetMessageId: message.internetMessageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
      fromAddress: message.fromAddress,
      fromName: message.fromName,
      toAddresses: message.toAddresses,
      ccAddresses: message.ccAddresses,
      subject: message.subject,
      bodyText: body.text,
      classification: optOut.detected ? optOut.kind : null,
      receivedAt: message.receivedAt,
      sentAt: message.sentAt,
    })

    if (!stored.created) continue
    imported += 1

    if (message.direction === 'outbound') {
      await handleOutboundMessage(db, { leadId: match.leadId, conversationId: conversation.id, message, logger })
    } else {
      await handleInboundMessage(db, {
        leadId: match.leadId,
        conversationId: conversation.id,
        messageId: stored.message.id,
        message,
        optOut,
        logger,
      })
    }
  }

  await recordSyncSuccess(db, {
    mailbox,
    folder,
    cursor: newestTimestamp > 0 ? String(newestTimestamp) : null,
    seen: entries.length,
    imported,
  })

  logger.log('mailbox_sync_completed', {
    provider: 'zoho',
    stage: folder,
    result: 'ok',
    seen: entries.length,
    matched,
    imported,
  })

  return { status: 'ok', seen: entries.length, imported, matched }
}

/**
 * A message the operator sent by hand.
 *
 * This is the ONLY path that moves a lead to CONTACTED. The operator is not
 * asked to press "Mark Sent" — the system can see what actually left the
 * mailbox, and asking a human to duplicate that is how CRM records drift from
 * reality.
 */
async function handleOutboundMessage(db, { leadId, conversationId, message, logger }) {
  const lead = await getLead(db, leadId)
  if (!lead) return

  await recordActivity(db, {
    leadId,
    campaignId: lead.campaignId,
    conversationId,
    eventType: lead.stage === STAGES.REPLIED || lead.stage === STAGES.CONVERSATION
      ? ACTIVITY.MANUAL_REPLY_SENT
      : ACTIVITY.OUTBOUND_MESSAGE_SENT,
    actor: 'human',
    summary: `Sent manually from Zoho: "${message.subject}".`,
    metadata: { providerMessageId: message.providerMessageId },
    dedupeKey: `outbound:${message.providerMessageId}`,
    correlationId: logger.correlationId,
  })

  // READY_TO_CONTACT → CONTACTED → AWAITING_REPLY for a first send;
  // REPLIED → CONVERSATION for a manual reply.
  if ([STAGES.READY_TO_CONTACT, STAGES.READY_FOR_REVIEW, STAGES.CONTACT_FOUND].includes(lead.stage)) {
    await transitionLead(db, leadId, STAGES.CONTACTED, {
      actor: 'human',
      summary: 'Detected the outbound message in Zoho Sent.',
      correlationId: logger.correlationId,
    })
    await transitionLead(db, leadId, STAGES.AWAITING_REPLY, {
      eventType: ACTIVITY.AWAITING_REPLY,
      summary: 'Awaiting a reply.',
      correlationId: logger.correlationId,
    })
    await updateConversationStatus(db, conversationId, 'awaiting_reply')
  } else if ([STAGES.REPLIED].includes(lead.stage)) {
    await transitionLead(db, leadId, STAGES.CONVERSATION, {
      actor: 'human',
      summary: 'Replied manually from Zoho.',
      correlationId: logger.correlationId,
    })
    await updateConversationStatus(db, conversationId, 'awaiting_reply')
  }

  await refreshNextAction(db, leadId)
}

/**
 * A reply from the prospect.
 *
 * Opt-out handling happens FIRST and unconditionally. If the deterministic
 * check fired, the address is suppressed, the lead moves to a
 * compliance-terminal stage it cannot leave, and no AI analysis is queued —
 * there is nothing to decide.
 *
 * Returns nothing: every effect is a database write, and the reply-analysis job
 * is enqueued by the caller's caller from a query rather than from a return
 * value here.
 */
async function handleInboundMessage(db, { leadId, conversationId, messageId, message, optOut, logger }) {
  const lead = await getLead(db, leadId)
  if (!lead) return

  await recordActivity(db, {
    leadId,
    campaignId: lead.campaignId,
    conversationId,
    eventType: ACTIVITY.INBOUND_REPLY,
    summary: `Reply received: "${message.subject}".`,
    metadata: { from: message.fromAddress, providerMessageId: message.providerMessageId },
    dedupeKey: `inbound:${message.providerMessageId}`,
    correlationId: logger.correlationId,
  })

  if (optOut.detected) {
    const reason = optOut.kind === 'complaint' ? 'complaint' : optOut.kind === 'do_not_contact' ? 'do_not_contact' : 'unsubscribe'

    await addSuppression(db, {
      scope: 'email',
      value: message.fromAddress,
      reason,
      source: 'inbound_reply',
      leadId,
      messageId,
      notes: `Detected in an inbound reply: "${optOut.matchedPhrase}".`,
    })

    const stage = optOut.kind === 'unsubscribe' ? STAGES.UNSUBSCRIBED : STAGES.DO_NOT_CONTACT
    await transitionLead(db, leadId, stage, {
      eventType: optOut.kind === 'unsubscribe' ? ACTIVITY.UNSUBSCRIBED : ACTIVITY.DO_NOT_CONTACT,
      summary: `Opt-out detected in their reply: "${optOut.matchedPhrase}".`,
      metadata: { kind: optOut.kind },
      correlationId: logger.correlationId,
    })

    await updateConversationStatus(db, conversationId, 'closed')
    await refreshNextAction(db, leadId)

    logger.log('opt_out_detected', { lead_id: leadId, stage: 'reply', result: 'suppressed', kind: optOut.kind })
    // No AI analysis. There is nothing for a model to add, and asking it would
    // only create the possibility of it disagreeing.
    return
  }

  await transitionLead(db, leadId, STAGES.REPLIED, {
    summary: 'Prospect replied.',
    correlationId: logger.correlationId,
  })
  await updateConversationStatus(db, conversationId, 'needs_attention')
  await refreshNextAction(db, leadId)

  // Nothing is returned, and reply analysis is NOT enqueued from here. The
  // mailbox_sync job handler queries for inbound messages with no analysis
  // afterwards, so a sync that half-completed still gets its replies analysed
  // on the next tick rather than losing them with the interrupted loop.
}

/**
 * Synchronizes both folders.
 *
 * Sent first, deliberately. A manual send and its reply can both land between
 * two runs, and processing them in that order produces the correct
 * CONTACTED → AWAITING_REPLY → REPLIED sequence rather than a reply arriving at
 * a lead that the CRM still believes was never contacted.
 *
 * @param {Env} env
 */
export async function syncMailbox(env, options = {}) {
  env = await withOperationalFlags(env)
  const sent = await syncFolder(env, 'sent', options)
  const inbox = await syncFolder(env, 'inbox', options)
  return { sent, inbox }
}
