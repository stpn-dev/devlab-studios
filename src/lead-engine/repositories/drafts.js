/**
 * Outreach drafts.
 *
 * A draft is a SUGGESTION, never a send queue. There is no `sent` status here,
 * no scheduled-send column and no transition in this file that could stand in
 * for one — `zoho_draft_created` means the text was saved into the Zoho Drafts
 * folder, and the move to CONTACTED comes later and exclusively from observing
 * the message in Zoho's Sent folder.
 */

import { bounded, buildWhere, clampLimit, newId, nowIso, operationError } from './helpers.js'

const MAX_SUBJECT = 300
const MAX_BODY = 8_000

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    leadId: row.lead_id,
    contactId: row.contact_id,
    conversationId: row.conversation_id,
    kind: row.kind,
    inReplyToMessageId: row.in_reply_to_message_id,
    status: row.status,
    subject: row.subject,
    bodyText: row.body_text,
    aiRunId: row.ai_run_id,
    generatedBy: row.generated_by,
    variant: row.variant,
    editedBy: row.edited_by,
    editedAt: row.edited_at,
    zohoDraftId: row.zoho_draft_id,
    zohoMessageId: row.zoho_message_id,
    zohoDraftCreatedAt: row.zoho_draft_created_at,
    zohoError: row.zoho_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Stores a generated draft, superseding the previous one of the same kind.
 *
 * Superseding rather than deleting: "Make Shorter" produces a new draft and the
 * previous text stays readable, which matters when the shorter one turns out
 * worse. A draft already pushed to Zoho is NOT superseded — that text exists in
 * a mailbox now, and marking it superseded here would make the CRM disagree
 * with what is actually sitting in the Drafts folder.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ leadId, contactId?, conversationId?, kind?, inReplyToMessageId?,
 *           subject, bodyText, aiRunId?, generatedBy?, variant? }} input
 */
export async function createDraft(db, input) {
  const id = newId()
  const now = nowIso()
  const kind = input.kind || 'initial'

  await db.batch([
    db
      .prepare(
        `UPDATE lead_outreach_drafts
         SET status = 'superseded', updated_at = ?
         WHERE lead_id = ? AND kind = ? AND status IN ('draft', 'edited')`,
      )
      .bind(now, input.leadId, kind),
    db
      .prepare(
        `INSERT INTO lead_outreach_drafts
           (id, lead_id, contact_id, conversation_id, kind, in_reply_to_message_id, status,
            subject, body_text, ai_run_id, generated_by, variant, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, input.leadId, input.contactId ?? null, input.conversationId ?? null, kind,
        input.inReplyToMessageId ?? null,
        bounded(input.subject || '', MAX_SUBJECT),
        bounded(input.bodyText || '', MAX_BODY),
        input.aiRunId ?? null, input.generatedBy || 'ai', input.variant ?? null,
        now, now,
      ),
  ])

  return getDraft(db, id)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getDraft(db, id) {
  const row = await db.prepare('SELECT * FROM lead_outreach_drafts WHERE id = ?').bind(id).first()
  return mapRow(row)
}

/**
 * The draft a human would act on: the most recent one not superseded or
 * discarded.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function getCurrentDraft(db, leadId, kind = 'initial') {
  const row = await db
    .prepare(
      `SELECT * FROM lead_outreach_drafts
       WHERE lead_id = ? AND kind = ? AND status NOT IN ('superseded', 'discarded')
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(leadId, kind)
    .first()
  return mapRow(row)
}

/**
 * Applies a human edit.
 *
 * Refused once the draft has been pushed to Zoho: the authoritative copy is in
 * the mailbox at that point, and silently editing the CRM's copy would leave
 * the operator reviewing text that is not what they are about to send. The
 * caller is told to regenerate instead, which creates a fresh draft.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function editDraft(db, id, { subject, bodyText, actorEmail }) {
  const existing = await getDraft(db, id)
  if (!existing) throw operationError('Draft not found.', 404)
  if (existing.status === 'zoho_draft_created') {
    throw operationError('This draft is already in Zoho. Edit it there, or regenerate to create a new one.', 409)
  }
  if (existing.status === 'discarded' || existing.status === 'superseded') {
    throw operationError('This draft is no longer editable.', 409)
  }

  const now = nowIso()
  await db
    .prepare(
      `UPDATE lead_outreach_drafts
       SET subject = ?, body_text = ?, status = 'edited', generated_by = 'human',
           edited_by = ?, edited_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      bounded(subject ?? existing.subject, MAX_SUBJECT),
      bounded(bodyText ?? existing.bodyText, MAX_BODY),
      actorEmail ?? null, now, now, id,
    )
    .run()

  return getDraft(db, id)
}

/**
 * Records that Zoho accepted the draft into the Drafts folder.
 *
 * Note what this does NOT do: it does not touch the lead's stage. Saving a
 * draft is not contacting anybody, and the CONTACTED transition belongs to the
 * Sent-folder sync alone.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function recordZohoDraftCreated(db, id, { zohoDraftId, zohoMessageId = null }) {
  const now = nowIso()
  await db
    .prepare(
      `UPDATE lead_outreach_drafts
       SET status = 'zoho_draft_created', zoho_draft_id = ?, zoho_message_id = ?,
           zoho_draft_created_at = ?, zoho_error = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .bind(zohoDraftId, zohoMessageId, now, now, id)
    .run()

  return getDraft(db, id)
}

/**
 * Records a Zoho failure, leaving the draft retryable.
 *
 * The status moves to `zoho_draft_failed` rather than back to `draft` so the
 * UI can show that an attempt was made and why it failed — but the draft is
 * still editable and still retryable, because a Zoho outage must not cost the
 * generated text.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function recordZohoDraftFailure(db, id, errorMessage) {
  const now = nowIso()
  await db
    .prepare(
      `UPDATE lead_outreach_drafts
       SET status = 'zoho_draft_failed', zoho_error = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(bounded(errorMessage, 500), now, id)
    .run()
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function discardDraft(db, id) {
  await db
    .prepare("UPDATE lead_outreach_drafts SET status = 'discarded', updated_at = ? WHERE id = ?")
    .bind(nowIso(), id)
    .run()
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listDrafts(db, filters = {}) {
  const { clause, bindings } = buildWhere([
    ['lead_id = ?', filters.leadId ?? null],
    ['kind = ?', filters.kind ?? null],
    ['status = ?', filters.status ?? null],
  ])

  const result = await db
    .prepare(`SELECT * FROM lead_outreach_drafts ${clause} ORDER BY created_at DESC LIMIT ?`)
    .bind(...bindings, clampLimit(filters.limit, 25, 100))
    .all()

  return (result.results || []).map(mapRow)
}

/**
 * Reply drafts waiting for a human — the dashboard's "AI reply drafts ready"
 * card.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function countPendingReplyDrafts(db) {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM lead_outreach_drafts WHERE kind = 'reply' AND status IN ('draft', 'edited')")
    .first()
  return Number(row?.total || 0)
}
