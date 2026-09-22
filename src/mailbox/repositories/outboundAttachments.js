/**
 * Attachments on an outgoing message.
 *
 * THE LIFECYCLE IS TWO STEPS, AND THAT IS THE WHOLE DESIGN. An operator picks
 * files while composing, before any `mailbox_outbound` row exists. So an upload
 * lands here UNCLAIMED (`outbound_id IS NULL`), and pressing Send claims it.
 *
 * Claiming is one UPDATE guarded by `outbound_id IS NULL`. That guard is doing
 * real work: a double-submit, or two tabs composing at once, cannot attach the
 * same upload to two messages — whichever UPDATE lands second changes nothing
 * and the caller is told the file was already used, rather than silently
 * sending it twice.
 *
 * Limits are enforced at CLAIM time, not upload time, because the limit is per
 * MESSAGE and a message is not a message until it exists. Uploading eleven
 * files is fine; sending eleven is not.
 */

import {
  ATTACHMENT_SOURCE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_TOTAL_ATTACHMENT_BYTES,
  assertAttachmentSource,
} from '../domain/attachmentSources.js'
import { bounded, newId, nowIso, operationError } from './helpers.js'

/** @param {object|null} row */
function mapAttachment(row) {
  if (!row) return null
  return {
    id: row.id,
    outboundId: row.outbound_id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    position: row.position,
    r2Key: row.r2_key,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

/**
 * Records an upload that no message has claimed yet.
 *
 * @param {D1Database} db
 * @param {{ filename: string, contentType?: string, size: number, r2Key: string,
 *           source?: string, createdBy?: string|null, id?: string }} input
 */
export async function createOutboundAttachment(db, input) {
  const id = input.id ?? newId()
  const now = nowIso()

  await db
    .prepare(
      `INSERT INTO mailbox_outbound_attachments
         (id, outbound_id, filename, content_type, size, r2_key, source, created_by, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      bounded(input.filename, 255),
      input.contentType || 'application/octet-stream',
      Number(input.size) || 0,
      input.r2Key,
      assertAttachmentSource(input.source ?? ATTACHMENT_SOURCE.UPLOAD),
      input.createdBy ?? null,
      now,
    )
    .run()

  return getOutboundAttachment(db, id)
}

/** @param {D1Database} db */
export async function getOutboundAttachment(db, id) {
  const row = await db.prepare('SELECT * FROM mailbox_outbound_attachments WHERE id = ?').bind(id).first()
  return mapAttachment(row)
}

/**
 * The attachments belonging to one outgoing message, in the operator's order.
 *
 * Order matters: it is the order the parts appear in the MIME message, and
 * therefore the order the recipient sees them. `position` is used rather than
 * `created_at` because files picked together are uploaded in the same
 * millisecond.
 *
 * @param {D1Database} db
 * @param {string} outboundId
 */
export async function listOutboundAttachments(db, outboundId) {
  const result = await db
    .prepare('SELECT * FROM mailbox_outbound_attachments WHERE outbound_id = ? ORDER BY position ASC, created_at ASC')
    .bind(outboundId)
    .all()
  return (result.results ?? []).map(mapAttachment)
}

/**
 * Binds uploads to the message being sent.
 *
 * Refuses the whole set rather than attaching some of it. A message that goes
 * out with three of its four attachments is worse than one that is not sent:
 * the operator believes the recipient has everything, and nothing in the
 * delivered message says otherwise.
 *
 * @param {D1Database} db
 * @param {{ ids: string[], outboundId: string }} input
 * @returns {Promise<Array<object>>} the claimed attachments, in send order
 */
export async function claimOutboundAttachments(db, { ids, outboundId }) {
  const wanted = (ids ?? []).filter(Boolean)
  if (wanted.length === 0) return []

  if (wanted.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw operationError(`A message may carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments.`, 400)
  }

  const unique = [...new Set(wanted)]
  if (unique.length !== wanted.length) {
    throw operationError('The same attachment was listed twice.', 400)
  }

  const placeholders = unique.map(() => '?').join(', ')
  const found = await db
    .prepare(`SELECT * FROM mailbox_outbound_attachments WHERE id IN (${placeholders})`)
    .bind(...unique)
    .all()
  const rows = (found.results ?? []).map(mapAttachment)

  if (rows.length !== unique.length) {
    throw operationError('An attachment no longer exists. Remove it and try again.', 404)
  }

  const alreadyUsed = rows.find((row) => row.outboundId)
  if (alreadyUsed) {
    throw operationError(`"${alreadyUsed.filename}" has already been sent with another message.`, 409)
  }

  const total = rows.reduce((sum, row) => sum + (row.size || 0), 0)
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    const mb = (MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0)
    throw operationError(`Attachments total ${(total / 1024 / 1024).toFixed(1)} MB; the limit is ${mb} MB.`, 413)
  }

  // `unique` order, not `rows` order: `rows` came back in whatever order the
  // IN clause produced, and the operator's sequence is the one that matters.
  for (const [position, id] of unique.entries()) {
    const row = rows.find((candidate) => candidate.id === id)

    // Guarded by `outbound_id IS NULL`, so a concurrent claim of the same
    // upload changes nothing rather than reassigning it.
    const result = await db
      .prepare(
        'UPDATE mailbox_outbound_attachments SET outbound_id = ?, position = ? ' +
          'WHERE id = ? AND outbound_id IS NULL',
      )
      .bind(outboundId, position, id)
      .run()

    if (result.meta?.changes === 0) {
      throw operationError(`"${row.filename}" was claimed by another message. Nothing was sent.`, 409)
    }
  }

  return listOutboundAttachments(db, outboundId)
}

/**
 * Removes an upload nobody has sent.
 *
 * Only while unclaimed. Once a message owns it, the attachment is part of what
 * was transmitted and deleting it would make the record disagree with what the
 * recipient holds.
 *
 * @param {D1Database} db
 * @param {string} id
 */
export async function deleteUnclaimedAttachment(db, id) {
  const row = await getOutboundAttachment(db, id)
  if (!row) throw operationError('Attachment not found.', 404)
  if (row.outboundId) {
    throw operationError('This attachment has already been sent and cannot be removed.', 409)
  }

  await db
    .prepare('DELETE FROM mailbox_outbound_attachments WHERE id = ? AND outbound_id IS NULL')
    .bind(id)
    .run()

  return row
}
