import { nowIso } from '../utils/responses'

/**
 * D1 metadata for R2-hosted media (the R2 object itself is the source of
 * truth for file bytes; this table exists purely so the admin media
 * library can list/search/attach-alt-text without listing the whole R2
 * bucket). Table existed unused since migrations/0001_cms_foundation.sql —
 * first real write happens in src/pages/api/admin/media.ts.
 */
export async function recordMediaAsset(db, { key, url, filename, contentType, size, folder }) {
  const timestamp = nowIso()
  await db
    .prepare(
      `INSERT INTO media_assets (id, key, url, filename, content_type, size, folder, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), key, url, filename, contentType, size, folder, timestamp, timestamp)
    .run()
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ folder?: string | null, limit?: number }} [options]
 */
export async function listMediaAssets(db, { folder = null, limit = 100 } = {}) {
  const where = folder ? 'WHERE folder = ?' : ''
  const bindings = folder ? [folder, limit] : [limit]

  const result = await db
    .prepare(
      `SELECT id, key, url, filename, content_type, size, alt_text, folder, created_at, updated_at
       FROM media_assets
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(...bindings)
    .all()

  return (result.results || []).map((row) => ({
    id: row.id,
    key: row.key,
    url: row.url,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    altText: row.alt_text || '',
    folder: row.folder,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}
