import { nowIso } from '../utils/responses'

function normalizeString(value) {
  return String(value || '').trim()
}

function toLead(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ name: string, email: string, subject: string, message: string, source?: string }} input
 */
export async function createLead(db, input) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO leads (id, name, email, subject, message, source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(
      id,
      normalizeString(input.name),
      normalizeString(input.email),
      normalizeString(input.subject),
      normalizeString(input.message),
      normalizeString(input.source) || 'contact-form',
      timestamp,
      timestamp,
    )
    .run()

  return getLead(db, id)
}

/**
 * Dedupes near-identical resubmissions (double-click, retry-after-timeout)
 * — same email + message within the window counts as the same lead.
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function findRecentDuplicateLead(db, { email, message, windowMinutes = 5 }) {
  const row = await db
    .prepare(
      `SELECT id, name, email, subject, message, source, status, created_at, updated_at
       FROM leads
       WHERE email = ? AND message = ? AND created_at >= datetime('now', ?)
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(normalizeString(email), normalizeString(message), `-${windowMinutes} minutes`)
    .first()

  return toLead(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getLead(db, id) {
  const row = await db
    .prepare('SELECT id, name, email, subject, message, source, status, created_at, updated_at FROM leads WHERE id = ?')
    .bind(id)
    .first()
  return toLead(row)
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ status?: string | null, limit?: number }} [options]
 */
export async function listLeads(db, { status = null, limit = 100 } = {}) {
  const where = status ? 'WHERE status = ?' : ''
  const bindings = status ? [status, limit] : [limit]

  const result = await db
    .prepare(
      `SELECT id, name, email, subject, message, source, status, created_at, updated_at
       FROM leads
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(...bindings)
    .all()

  return (result.results || []).map(toLead)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function updateLeadStatus(db, id, status) {
  await db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?').bind(status, nowIso(), id).run()
}
