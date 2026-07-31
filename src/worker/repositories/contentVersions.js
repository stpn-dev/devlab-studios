import { nowIso, parseJsonField } from '../utils/responses'

/**
 * Generic, append-only version history sitting on top of every content
 * type's live table (which keeps representing current/published state as
 * it always has). Call recordVersion() after every successful save;
 * rollback re-applies an old snapshot as a brand-new version, never
 * mutates history.
 */

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ contentType: string, contentId?: string | null, status: string, snapshot: unknown, createdBy?: string | null }} options
 */
export async function recordVersion(db, { contentType, contentId = null, status, snapshot, createdBy = null }) {
  const latest = await db
    .prepare('SELECT MAX(version_number) as max_version FROM content_versions WHERE content_type = ? AND content_id IS ?')
    .bind(contentType, contentId)
    .first()

  const nextVersion = Number(latest?.max_version || 0) + 1

  await db
    .prepare(
      `INSERT INTO content_versions (id, content_type, content_id, version_number, status, snapshot_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), contentType, contentId, nextVersion, status, JSON.stringify(snapshot), createdBy, nowIso())
    .run()

  return nextVersion
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} contentType
 * @param {string | null} [contentId]
 */
export async function listVersions(db, contentType, contentId = null) {
  const result = await db
    .prepare(
      `SELECT id, version_number, status, snapshot_json, created_by, created_at
       FROM content_versions
       WHERE content_type = ? AND content_id IS ?
       ORDER BY version_number DESC`,
    )
    .bind(contentType, contentId)
    .all()

  return (result.results || []).map((row) => ({
    id: row.id,
    versionNumber: row.version_number,
    status: row.status,
    snapshot: parseJsonField(row.snapshot_json, null),
    createdBy: row.created_by,
    createdAt: row.created_at,
  }))
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} contentType
 * @param {string | null} contentId
 * @param {number} versionNumber
 * @returns {Promise<{ id: string, versionNumber: number, status: string, snapshot: unknown, createdBy: string | null, createdAt: string } | null>}
 */
export async function getVersion(db, contentType, contentId, versionNumber) {
  const row = await db
    .prepare(
      `SELECT id, version_number, status, snapshot_json, created_by, created_at
       FROM content_versions
       WHERE content_type = ? AND content_id IS ? AND version_number = ?`,
    )
    .bind(contentType, contentId, versionNumber)
    .first()

  if (!row) return null

  return {
    id: row.id,
    versionNumber: row.version_number,
    status: row.status,
    snapshot: parseJsonField(row.snapshot_json, null),
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}
