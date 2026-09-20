/**
 * The outbound queue.
 *
 * Same two rules the lead engine's outbox is built around, for the same
 * reasons (see src/lead-engine/services/outbox.js):
 *
 *   1. UNDER-SEND RATHER THAN DOUBLE-SEND. A row moves to `collected` the
 *      moment it is handed out and is never offered again. If the transmitter
 *      dies between collecting and sending, that reply is not sent and sits in
 *      the CMS for a person. The opposite bias mails a stranger twice.
 *   2. `sent` is recorded by the transmitter calling back, not by handing the
 *      message over. Only the callback knows whether it reached an MTA.
 */

import { bounded, clampLimit, newId, nowIso, operationError } from './helpers.js'

function mapOutbound(row) {
  if (!row) return null
  return {
    id: row.id,
    threadId: row.thread_id,
    inReplyToMessageId: row.in_reply_to_message_id,
    mailbox: row.mailbox,
    toAddress: row.to_address,
    toName: row.to_name,
    subject: row.subject,
    bodyText: row.body_text,
    messageId: row.message_id,
    inReplyTo: row.in_reply_to,
    references: row.references_header,
    envelopeFrom: row.envelope_from,
    status: row.status,
    collectedAt: row.collected_at,
    sentAt: row.sent_at,
    failedAt: row.failed_at,
    error: row.error,
    providerMessageId: row.provider_message_id,
    leadId: row.lead_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * @param {D1Database} db
 * @param {string} id
 * @returns {Promise<any|null>}
 */
export async function getOutbound(db, id) {
  return mapOutbound(await db.prepare('SELECT * FROM mailbox_outbound WHERE id = ?').bind(id).first())
}

/** @param {D1Database} db */
export async function queueOutbound(db, input) {
  const id = input.id ?? newId()
  const now = nowIso()

  await db
    .prepare(
      `INSERT INTO mailbox_outbound
         (id, thread_id, in_reply_to_message_id, mailbox, to_address, to_name, subject, body_text,
          message_id, in_reply_to, references_header, envelope_from,
          status, lead_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.threadId,
      input.inReplyToMessageId ?? null,
      input.mailbox,
      String(input.toAddress).toLowerCase(),
      input.toName ? bounded(input.toName, 200) : null,
      bounded(input.subject ?? '', 500),
      bounded(input.bodyText ?? '', 100_000),
      input.messageId,
      input.inReplyTo ?? null,
      input.references ? bounded(input.references, 4_000) : null,
      input.envelopeFrom,
      input.leadId ?? null,
      input.createdBy ?? null,
      now,
      now,
    )
    .run()

  return getOutbound(db, id)
}

/**
 * Hands out queued replies and marks them collected in the same step.
 *
 * The UPDATE carries `status = 'queued'` in its WHERE clause, so two
 * transmitters polling at once cannot both take the same row — whichever
 * UPDATE lands second changes nothing and that row is dropped from the result.
 * Selecting first and updating after would hand the same reply to both.
 *
 * @param {D1Database} db
 * @param {{ limit?: number }} [options]
 * @returns {Promise<any[]>}
 */
export async function collectQueued(db, { limit = 10 } = {}) {
  const take = clampLimit(limit, 10, 50)
  const result = await db
    .prepare("SELECT * FROM mailbox_outbound WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?")
    .bind(take)
    .all()

  const collected = []
  const now = nowIso()

  for (const row of result.results || []) {
    const claimed = await db
      .prepare(
        "UPDATE mailbox_outbound SET status = 'collected', collected_at = ?, updated_at = ? " +
          "WHERE id = ? AND status = 'queued'",
      )
      .bind(now, now, row.id)
      .run()

    // D1 reports rows_written; a claim that changed nothing was won by someone
    // else and must not be handed out here as well.
    if (Number(claimed.meta?.changes ?? claimed.meta?.rows_written ?? 0) > 0) {
      collected.push(mapOutbound({ ...row, status: 'collected', collected_at: now }))
    }
  }

  return collected
}

/**
 * Records that the transmitter put a reply on the wire.
 *
 * Idempotent: confirming twice leaves the row `sent` with its original
 * timestamp. A retry after a timeout must not look like a second send.
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {{ providerMessageId?: string|null, sentAt?: string|null }} [options]
 */
export async function markSent(db, id, { providerMessageId = null, sentAt = null } = {}) {
  const row = await getOutbound(db, id)
  if (!row) throw operationError('Outbound message not found.', 404)
  if (row.status === 'sent') return { status: 'already_sent', outbound: row }

  const now = nowIso()
  await db
    .prepare(
      "UPDATE mailbox_outbound SET status = 'sent', sent_at = ?, provider_message_id = ?, " +
        "error = NULL, failed_at = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(sentAt || now, providerMessageId, now, id)
    .run()

  return { status: 'ok', outbound: await getOutbound(db, id) }
}

/**
 * Records a transmission failure.
 *
 * Returns to `queued` rather than staying `failed` ONLY when the caller says
 * the failure is retryable. A reply that silently retried forever would mail
 * the same person repeatedly the moment the fault cleared.
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {{ error?: string|null, retryable?: boolean }} [options]
 */
export async function markFailed(db, id, { error = null, retryable = false } = {}) {
  const row = await getOutbound(db, id)
  if (!row) throw operationError('Outbound message not found.', 404)
  if (row.status === 'sent') return { status: 'already_sent', outbound: row }

  const now = nowIso()
  await db
    .prepare(
      `UPDATE mailbox_outbound SET status = ?, failed_at = ?, error = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(retryable ? 'queued' : 'failed', now, error ? bounded(error, 1_000) : null, now, id)
    .run()

  return { status: 'ok', outbound: await getOutbound(db, id) }
}

/** @param {D1Database} db */
export async function cancelOutbound(db, id) {
  const row = await getOutbound(db, id)
  if (!row) throw operationError('Outbound message not found.', 404)
  // Only a reply nobody has taken yet. Once it is collected we cannot know
  // whether it has already reached an MTA, and saying "cancelled" about a
  // message that went out is worse than admitting we do not know.
  if (row.status !== 'queued') {
    throw operationError(`This reply is ${row.status} and can no longer be cancelled.`, 409)
  }

  const now = nowIso()
  await db
    .prepare("UPDATE mailbox_outbound SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'queued'")
    .bind(now, id)
    .run()

  return getOutbound(db, id)
}

/** @param {D1Database} db */
export async function listOutboundForThread(db, threadId) {
  const result = await db
    .prepare('SELECT * FROM mailbox_outbound WHERE thread_id = ? ORDER BY created_at ASC')
    .bind(threadId)
    .all()
  return (result.results || []).map(mapOutbound)
}

/**
 * Queue health for the diagnostics screen.
 *
 * @param {D1Database} db
 * @returns {Promise<Record<string, number>>}
 */
export async function outboundCounts(db) {
  const result = await db.prepare('SELECT status, COUNT(*) AS n FROM mailbox_outbound GROUP BY status').all()
  const counts = {}
  for (const row of result.results || []) counts[row.status] = Number(row.n ?? 0)
  return counts
}
