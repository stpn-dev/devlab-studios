/**
 * Mailbox threads.
 *
 * Rollups (`message_count`, `unread_count`, the three timestamps) are
 * denormalized so the inbox list is one indexed query rather than an aggregate
 * per row. They are maintained in the SAME batch as the message insert, which
 * is the only thing that keeps them honest — a rollup updated in a separate
 * round trip drifts the first time a Worker is evicted between the two.
 */

import { SUBJECT_MATCH_WINDOW_DAYS, normalizeSubject, subjectMatches } from '../domain/threading.js'
import { bounded, buildWhere, clampLimit, clampOffset, newId, nowIso } from './helpers.js'

function mapThread(row) {
  if (!row) return null
  return {
    id: row.id,
    mailbox: row.mailbox,
    subject: row.subject,
    correspondent: row.correspondent,
    correspondentName: row.correspondent_name,
    state: row.state,
    messageCount: Number(row.message_count),
    unreadCount: Number(row.unread_count),
    lastMessageAt: row.last_message_at,
    lastInboundAt: row.last_inbound_at,
    lastOutboundAt: row.last_outbound_at,
    leadId: row.lead_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyName: row.company_name ?? null,
  }
}

const THREAD_SELECT = `
  SELECT t.*, c.name AS company_name
  FROM mailbox_threads t
  LEFT JOIN lead_leads l ON l.id = t.lead_id
  LEFT JOIN lead_companies c ON c.id = l.company_id
`

/**
 * @param {D1Database} db
 * @param {string} id
 * @returns {Promise<any|null>}
 */
export async function getThread(db, id) {
  const row = await db.prepare(`${THREAD_SELECT} WHERE t.id = ?`).bind(id).first()
  return mapThread(row)
}

/** @param {D1Database} db */
export async function createThread(db, input) {
  const id = newId()
  const now = nowIso()

  await db
    .prepare(
      `INSERT INTO mailbox_threads
         (id, mailbox, subject, correspondent, correspondent_name, state,
          message_count, unread_count, lead_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'inbox', 0, 0, ?, ?, ?)`,
    )
    .bind(
      id,
      input.mailbox,
      bounded(input.subject ?? '', 500),
      String(input.correspondent ?? '').toLowerCase(),
      input.correspondentName ? bounded(input.correspondentName, 200) : null,
      input.leadId ?? null,
      now,
      now,
    )
    .run()

  return getThread(db, id)
}

/**
 * Finds the thread containing any of these Message-IDs.
 *
 * Checks both directions of the conversation: a reply quotes the Message-ID of
 * something WE sent far more often than something we received, and that id may
 * still be sitting in `mailbox_outbound` if the transmitter has not confirmed
 * yet. Looking only at `mailbox_messages` would miss the most common case.
 *
 * @param {D1Database} db
 * @param {string[]} messageIds bracketless, most specific first
 */
export async function findThreadByMessageIds(db, messageIds) {
  const ids = (messageIds || []).filter(Boolean).slice(0, 25)
  if (ids.length === 0) return null

  // In caller order, not database order: the first id is the direct parent, and
  // a query with `IN` would return whichever row the index reached first.
  for (const id of ids) {
    const row = await db
      .prepare(
        `SELECT thread_id FROM mailbox_messages WHERE message_id = ?
         UNION ALL
         SELECT thread_id FROM mailbox_outbound WHERE message_id = ?
         LIMIT 1`,
      )
      .bind(id, id)
      .first()

    if (row?.thread_id) return getThread(db, row.thread_id)
  }

  return null
}

/**
 * The heuristic fallback: same correspondent, same mailbox, same subject,
 * recently. Candidates come from the database, the decision is made by the pure
 * policy in domain/threading.js.
 *
 * @param {D1Database} db
 */
export async function findThreadBySubject(db, { mailbox, correspondent, subject }, now = new Date()) {
  if (!normalizeSubject(subject)) return null

  const since = new Date(now.getTime() - SUBJECT_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const result = await db
    .prepare(
      `${THREAD_SELECT}
       WHERE t.mailbox = ? AND t.correspondent = ? AND t.state != 'trash'
         AND t.last_message_at >= ?
       ORDER BY t.last_message_at DESC LIMIT 20`,
    )
    .bind(mailbox, String(correspondent ?? '').toLowerCase(), since)
    .all()

  for (const row of result.results || []) {
    const thread = mapThread(row)
    if (subjectMatches(thread, { mailbox, correspondent, subject }, now)) return thread
  }

  return null
}

/**
 * The statements that fold a message into its thread's rollups.
 *
 * Returns prepared statements rather than running them, so the caller can put
 * them in the same `db.batch()` as the insert.
 *
 * @param {D1Database} db
 */
export function threadRollupStatements(db, { threadId, direction, messageAt, unread, subject, correspondent }) {
  const now = nowIso()
  const column = direction === 'inbound' ? 'last_inbound_at' : 'last_outbound_at'

  return [
    db
      .prepare(
        `UPDATE mailbox_threads
         SET message_count = message_count + 1,
             unread_count = unread_count + ?,
             last_message_at = ?,
             ${column} = ?,
             -- An empty thread subject is filled by the first message that has
             -- one, so a thread started by a subjectless message does not stay
             -- permanently unlabelled in the list.
             subject = CASE WHEN subject = '' THEN ? ELSE subject END,
             correspondent = CASE WHEN correspondent = '' THEN ? ELSE correspondent END,
             -- An archived thread returns to the inbox when it receives a new
             -- message. Leaving it archived is how a reply is never seen.
             state = CASE WHEN state = 'archived' AND ? = 'inbound' THEN 'inbox' ELSE state END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        unread ? 1 : 0,
        messageAt,
        messageAt,
        bounded(subject ?? '', 500),
        String(correspondent ?? '').toLowerCase(),
        direction,
        now,
        threadId,
      ),
  ]
}

/** @param {D1Database} db */
export async function setThreadState(db, id, state) {
  await db
    .prepare('UPDATE mailbox_threads SET state = ?, updated_at = ? WHERE id = ?')
    .bind(state, nowIso(), id)
    .run()
  return getThread(db, id)
}

/** @param {D1Database} db */
export async function attachThreadToLead(db, id, leadId) {
  await db
    .prepare('UPDATE mailbox_threads SET lead_id = ?, updated_at = ? WHERE id = ? AND lead_id IS NULL')
    .bind(leadId, nowIso(), id)
    .run()
}

/**
 * Recomputes `unread_count` from the messages themselves.
 *
 * Called after a read/unread change rather than incrementing, because marking a
 * thread read touches an unknown number of messages and a delta computed in the
 * application is a delta that can be applied twice.
 *
 * @param {D1Database} db
 */
export async function recountUnread(db, threadId) {
  await db
    .prepare(
      `UPDATE mailbox_threads
       SET unread_count = (
             SELECT COUNT(*) FROM mailbox_messages
             WHERE thread_id = ? AND direction = 'inbound' AND read_at IS NULL AND state != 'trash'
           ),
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(threadId, nowIso(), threadId)
    .run()
}

/**
 * @param {D1Database} db
 * @param {{ mailbox?: string|null, mailboxes?: string[]|null, state?: string|null,
 *           leadId?: string|null, unreadOnly?: boolean, search?: string|null,
 *           limit?: number, offset?: number }} [filters]
 * @returns {Promise<any[]>}
 */
export async function listThreads(db, filters = {}) {
  const conditions = [
    ['t.mailbox = ?', filters.mailbox ?? null],
    ['t.state = ?', filters.state ?? null],
    ['t.lead_id = ?', filters.leadId ?? null],
  ]

  const { clause, bindings } = buildWhere(conditions)
  const extra = []
  const extraBindings = []

  if (Array.isArray(filters.mailboxes) && filters.mailboxes.length > 0) {
    extra.push(`t.mailbox IN (${filters.mailboxes.map(() => '?').join(', ')})`)
    extraBindings.push(...filters.mailboxes)
  }
  if (filters.unreadOnly) extra.push('t.unread_count > 0')

  // Substring search over the fields the list already shows. LIKE with bound
  // parameters, never interpolation; the wildcards are added to the VALUE, so a
  // search for `100%` searches for that text rather than becoming a pattern.
  //
  // ESCAPE is written into each condition rather than patched into the finished
  // SQL afterwards. A `String.replace` with a string pattern rewrites only the
  // first occurrence, which would have left the other two LIKEs treating a
  // backslash-escaped `%` as a wildcard again.
  if (filters.search) {
    extra.push(
      "(t.subject LIKE ? ESCAPE '\\' OR t.correspondent LIKE ? ESCAPE '\\'" +
        " OR t.correspondent_name LIKE ? ESCAPE '\\')",
    )
    const pattern = `%${String(filters.search).replace(/[%_\\]/g, '\\$&')}%`
    extraBindings.push(pattern, pattern, pattern)
  }

  // A thread with no messages is never shown. The ingest path creates the
  // thread and inserts the message in that order, so a message that turns out
  // to be a duplicate — which only happens when two deliveries race, since the
  // normal path bails before this point — leaves an empty thread behind.
  // Filtering here means that costs nothing visible, rather than an untitled
  // blank row sitting in the operator's inbox forever.
  extra.push('t.message_count > 0')

  const where = [clause.replace(/^WHERE /, ''), ...extra].filter(Boolean).join(' AND ')
  const sql = `${THREAD_SELECT} ${where ? `WHERE ${where}` : ''}
    ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC
    LIMIT ? OFFSET ?`

  const result = await db
    .prepare(sql)
    .bind(...bindings, ...extraBindings, clampLimit(filters.limit, 50, 200), clampOffset(filters.offset))
    .all()

  return (result.results || []).map(mapThread)
}

/**
 * Per-mailbox unread totals for the navigation.
 *
 * @param {D1Database} db
 * @returns {Promise<Record<string, { unread: number, threads: number }>>}
 */
export async function unreadCounts(db) {
  const result = await db
    .prepare(
      `SELECT mailbox, SUM(unread_count) AS unread, COUNT(*) AS threads
       FROM mailbox_threads WHERE state = 'inbox' GROUP BY mailbox`,
    )
    .all()

  const counts = {}
  for (const row of result.results || []) {
    counts[row.mailbox] = { unread: Number(row.unread ?? 0), threads: Number(row.threads ?? 0) }
  }
  return counts
}
