import { nowIso } from '../utils/responses'

/**
 * Storage for the daily digest.
 *
 * Kept away from the `articles` repository on purpose: the retention sweep here
 * is a DELETE with a date predicate, and it must never be able to reach real
 * editorial content. See migrations/0011_insights_digest.sql.
 */

function toItem(row) {
  return {
    id: row.id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    title: row.title,
    summary: row.summary || '',
    publishedAt: row.published_at || null,
  }
}

/**
 * Published digests, newest day first, each with its items.
 *
 * Two queries rather than a join: a join would repeat every digest column once
 * per item, and the grouping has to happen in JS either way.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function listDigests(db, { limit = 7, includeDrafts = false } = {}) {
  const where = includeDrafts ? '' : "WHERE status = 'published'"
  const digestRows = await db
    .prepare(
      `SELECT id, digest_date, status, item_count, model, generated_at
       FROM digests ${where}
       ORDER BY digest_date DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all()

  const digests = digestRows.results || []
  if (digests.length === 0) return []

  const placeholders = digests.map(() => '?').join(', ')
  const itemRows = await db
    .prepare(
      `SELECT id, digest_id, source_name, source_url, title, summary, published_at, sort_order
       FROM digest_items
       WHERE digest_id IN (${placeholders})
       ORDER BY sort_order ASC`,
    )
    .bind(...digests.map((digest) => digest.id))
    .all()

  const itemsByDigest = new Map()
  for (const row of itemRows.results || []) {
    if (!itemsByDigest.has(row.digest_id)) itemsByDigest.set(row.digest_id, [])
    itemsByDigest.get(row.digest_id).push(toItem(row))
  }

  return digests.map((digest) => ({
    id: digest.id,
    digestDate: digest.digest_date,
    status: digest.status,
    itemCount: Number(digest.item_count) || 0,
    model: digest.model || null,
    generatedAt: digest.generated_at,
    items: itemsByDigest.get(digest.id) || [],
  }))
}

/**
 * Source URLs already published in the trailing window, so a story that ran
 * yesterday does not reappear today.
 *
 * `excludeDate` leaves one day out, and the run always passes the day it is
 * generating. Without it a re-run would treat its OWN earlier output as
 * "already published" and replace a full edition with the leftovers — which is
 * precisely what "Generate now" does when pressed twice.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function listRecentSourceUrls(db, days = 7, { excludeDate = null } = {}) {
  const result = await db
    .prepare(
      `SELECT DISTINCT i.source_url
       FROM digest_items i
       JOIN digests d ON d.id = i.digest_id
       WHERE d.digest_date >= date('now', ?)
         AND (? IS NULL OR d.digest_date <> ?)`,
    )
    .bind(`-${days} days`, excludeDate, excludeDate)
    .all()

  return new Set((result.results || []).map((row) => row.source_url))
}

/**
 * Writes one day's digest, replacing that day if it already exists.
 *
 * The delete-then-insert runs in a single `db.batch()` transaction. D1 does not
 * implicitly wrap sequential `.run()` calls, so a mid-loop failure after the
 * DELETE had committed would leave the day visible with no items.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function saveDigest(db, { digestDate, items, model }) {
  const timestamp = nowIso()
  const existing = await db.prepare('SELECT id FROM digests WHERE digest_date = ?').bind(digestDate).first()
  const digestId = existing?.id || crypto.randomUUID()

  const statements = [
    db
      .prepare(
        `INSERT INTO digests (id, digest_date, status, item_count, model, generated_at, created_at, updated_at)
         VALUES (?, ?, 'published', ?, ?, ?, ?, ?)
         ON CONFLICT(digest_date) DO UPDATE SET
           item_count = excluded.item_count,
           model = excluded.model,
           generated_at = excluded.generated_at,
           updated_at = excluded.updated_at`,
      )
      .bind(digestId, digestDate, items.length, model, timestamp, timestamp, timestamp),
    db.prepare('DELETE FROM digest_items WHERE digest_id = ?').bind(digestId),
  ]

  items.forEach((item, index) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO digest_items (id, digest_id, source_name, source_url, title, summary, published_at, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          digestId,
          item.sourceName,
          item.sourceUrl,
          item.title,
          item.summary || '',
          item.publishedAt,
          index,
          timestamp,
        ),
    )
  })

  await db.batch(statements)
  return { id: digestId, digestDate, itemCount: items.length }
}

/**
 * Removes digests older than the retention window. Items go with them via the
 * foreign key's ON DELETE CASCADE.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function pruneDigests(db, days = 7) {
  const result = await db
    .prepare("DELETE FROM digests WHERE digest_date < date('now', ?)")
    .bind(`-${days} days`)
    .run()

  return Number(result?.meta?.changes) || 0
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function setDigestStatus(db, id, status) {
  await db
    .prepare('UPDATE digests SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, nowIso(), id)
    .run()
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function deleteDigest(db, id) {
  await db.prepare('DELETE FROM digests WHERE id = ?').bind(id).run()
}
