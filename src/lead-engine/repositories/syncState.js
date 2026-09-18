/**
 * Mailbox synchronization cursors.
 *
 * Without a durable cursor the only safe sync is a full mailbox mirror, which
 * this system deliberately does not do — it reads a bounded recent window and
 * only keeps messages that match a known CRM contact or conversation.
 *
 * `last_sync_at`, `last_success_at` and `last_error` are three separate columns
 * because the Zoho status screen has to distinguish "ran and found nothing"
 * from "has not succeeded since Tuesday". One combined timestamp cannot.
 */

import { bounded, newId, nowIso } from './helpers.js'

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    provider: row.provider,
    mailbox: row.mailbox,
    folder: row.folder,
    cursor: row.cursor,
    lastSyncAt: row.last_sync_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    consecutiveFailures: Number(row.consecutive_failures),
    messagesSeen: Number(row.messages_seen),
    messagesImported: Number(row.messages_imported),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ provider?: string, mailbox: string, folder: 'inbox'|'sent' }} key
 */
export async function getSyncState(db, { provider = 'zoho', mailbox, folder }) {
  const row = await db
    .prepare('SELECT * FROM lead_sync_state WHERE provider = ? AND mailbox = ? AND folder = ?')
    .bind(provider, mailbox, folder)
    .first()
  return mapRow(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function ensureSyncState(db, { provider = 'zoho', mailbox, folder }) {
  const existing = await getSyncState(db, { provider, mailbox, folder })
  if (existing) return existing

  const now = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO lead_sync_state
         (id, provider, mailbox, folder, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId(), provider, mailbox, folder, now, now)
    .run()

  return getSyncState(db, { provider, mailbox, folder })
}

/**
 * Records a successful run and advances the cursor.
 *
 * The cursor only ever moves FORWARD on success. A run that failed halfway
 * leaves it where it was, so the next run re-reads the same window — which is
 * safe because message import is idempotent on `provider_message_id`, and is
 * strictly better than advancing past messages that were never examined.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function recordSyncSuccess(db, { provider = 'zoho', mailbox, folder, cursor, seen = 0, imported = 0 }) {
  const now = nowIso()
  await db
    .prepare(
      `UPDATE lead_sync_state
       SET cursor = COALESCE(?, cursor),
           last_sync_at = ?, last_success_at = ?,
           last_error = NULL, last_error_at = NULL, consecutive_failures = 0,
           messages_seen = messages_seen + ?, messages_imported = messages_imported + ?,
           updated_at = ?
       WHERE provider = ? AND mailbox = ? AND folder = ?`,
    )
    .bind(cursor ?? null, now, now, seen, imported, now, provider, mailbox, folder)
    .run()
}

/**
 * Records a failed run. The cursor is untouched.
 *
 * `consecutive_failures` drives the dashboard's "mailbox synchronization
 * problems" card and the back-off in the sync scheduler: a mailbox that has
 * failed repeatedly is polled less often rather than hammered.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function recordSyncFailure(db, { provider = 'zoho', mailbox, folder, error }) {
  const now = nowIso()
  await db
    .prepare(
      `UPDATE lead_sync_state
       SET last_sync_at = ?, last_error = ?, last_error_at = ?,
           consecutive_failures = consecutive_failures + 1, updated_at = ?
       WHERE provider = ? AND mailbox = ? AND folder = ?`,
    )
    .bind(now, bounded(error, 500), now, now, provider, mailbox, folder)
    .run()
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listSyncState(db) {
  const result = await db.prepare('SELECT * FROM lead_sync_state ORDER BY provider, mailbox, folder').all()
  return (result.results || []).map(mapRow).filter(Boolean)
}
