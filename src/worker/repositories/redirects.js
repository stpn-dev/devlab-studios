import { nowIso } from '../utils/responses'

function normalizeString(value) {
  return String(value || '').trim()
}

function toRedirect(row) {
  return {
    id: row.id,
    fromPath: row.from_path,
    toPath: row.to_path,
    statusCode: Number(row.status_code) || 301,
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listRedirects(db) {
  const result = await db
    .prepare('SELECT id, from_path, to_path, status_code, note, created_at, updated_at FROM redirects ORDER BY from_path ASC')
    .all()
  return (result.results || []).map(toRedirect)
}

/** Used by middleware only when a response already 404'd (see src/middleware.ts) — a fast indexed lookup, not a full table scan. */
export async function findRedirect(db, fromPath) {
  const row = await db
    .prepare('SELECT id, from_path, to_path, status_code, note, created_at, updated_at FROM redirects WHERE from_path = ?')
    .bind(fromPath)
    .first()
  return row ? toRedirect(row) : null
}

export async function upsertRedirect(db, input) {
  const id = normalizeString(input.id) || crypto.randomUUID()
  const fromPath = normalizeString(input.fromPath)
  const toPath = normalizeString(input.toPath)

  if (!fromPath || !toPath) {
    const error = new Error('Both fromPath and toPath are required.')
    error.status = 400
    throw error
  }

  const timestamp = nowIso()
  await db
    .prepare(
      `INSERT INTO redirects (id, from_path, to_path, status_code, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(from_path) DO UPDATE SET
         to_path = excluded.to_path,
         status_code = excluded.status_code,
         note = excluded.note,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      fromPath,
      toPath,
      input.statusCode === 302 ? 302 : 301,
      normalizeString(input.note),
      timestamp,
      timestamp,
    )
    .run()

  return findRedirect(db, fromPath)
}

export async function deleteRedirect(db, id) {
  await db.prepare('DELETE FROM redirects WHERE id = ?').bind(id).run()
  return { id }
}
