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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         url = excluded.url,
         filename = excluded.filename,
         content_type = excluded.content_type,
         size = excluded.size,
         folder = excluded.folder,
         updated_at = excluded.updated_at`,
    )
    .bind(crypto.randomUUID(), key, url, filename, contentType, size, folder, timestamp, timestamp)
    .run()
}

export async function deleteMediaAsset(db, key) {
  await db.prepare('DELETE FROM media_assets WHERE key = ?').bind(key).run()
}

export async function deleteMediaAssetByUrl(db, mediaBucket, url) {
  const row = await db.prepare('SELECT key FROM media_assets WHERE url = ?').bind(url).first()
  if (!row?.key) return false
  await mediaBucket.delete(row.key)
  await deleteMediaAsset(db, row.key)
  return true
}

const MEDIA_REFERENCE_QUERIES = [
  {
    type: 'Project',
    sql: `SELECT project_gallery_images.project_id AS id,
               projects.title AS label,
               project_gallery_images.is_thumbnail AS isThumbnail
        FROM project_gallery_images
        JOIN projects ON projects.id = project_gallery_images.project_id
        WHERE project_gallery_images.url = ?`,
  },
  {
    type: 'Project',
    sql: `SELECT id, title AS label
        FROM projects
        WHERE image_url = ? AND image_url != ''
          AND NOT EXISTS (
            SELECT 1 FROM project_gallery_images
            WHERE project_gallery_images.project_id = projects.id
              AND project_gallery_images.url = projects.image_url
          )`,
  },
  { type: 'Insight cover', sql: 'SELECT id, title AS label FROM articles WHERE cover_image_url = ?' },
  { type: 'Certification badge', sql: 'SELECT id, name AS label FROM certifications WHERE badge_image_url = ?' },
  { type: 'Profile experience', sql: 'SELECT id, role AS label FROM experiences WHERE image_url = ?' },
  { type: 'Testimonial photo', sql: 'SELECT id, author_name AS label FROM testimonials WHERE author_photo_url = ?' },
  { type: 'Case-study cover', sql: 'SELECT id, title AS label FROM case_studies WHERE cover_image_url = ?' },
  { type: 'Case-study gallery', sql: 'SELECT id, title AS label FROM case_studies WHERE INSTR(screenshots_json, ?) > 0' },
  { type: 'Page section', sql: 'SELECT id, section_key AS label FROM page_sections WHERE INSTR(content_json, ?) > 0' },
  { type: 'Site setting', sql: 'SELECT key AS id, key AS label FROM site_settings WHERE INSTR(value_json, ?) > 0' },
  { type: 'SEO image', sql: 'SELECT id, page_slug AS label FROM seo_metadata WHERE og_image = ? OR twitter_image = ?' },
]

export async function findMediaReferences(db, candidates) {
  const values = [...new Set((Array.isArray(candidates) ? candidates : [candidates]).map((value) => String(value || '').trim()).filter(Boolean))]
  const references = []
  for (const query of MEDIA_REFERENCE_QUERIES) {
    for (const value of values) {
      try {
        const bindings = query.type === 'SEO image' ? [value, value] : [value]
        const result = await db.prepare(query.sql).bind(...bindings).all()
        for (const row of result.results || []) references.push({ type: query.type, id: row.id, label: row.label || row.id, isThumbnail: Boolean(row.isThumbnail) })
      } catch (error) {
        if (!/no such table/i.test(String(error?.message || ''))) throw error
      }
    }
  }
  return references.filter((reference, index, items) => items.findIndex((item) => item.type === reference.type && item.id === reference.id) === index)
}

export async function replaceMediaReferences(db, candidates, nextUrl) {
  const values = [...new Set(candidates.map((value) => String(value || '').trim()).filter(Boolean))]
  const statements = []
  for (const value of values) {
    statements.push(
      db.prepare('UPDATE projects SET image_url = ?, updated_at = ? WHERE image_url = ?').bind(nextUrl, nowIso(), value),
      db.prepare('UPDATE project_gallery_images SET url = ?, updated_at = ? WHERE url = ?').bind(nextUrl, nowIso(), value),
      db.prepare('UPDATE articles SET cover_image_url = ?, updated_at = ? WHERE cover_image_url = ?').bind(nextUrl, nowIso(), value),
      db.prepare('UPDATE certifications SET badge_image_url = ?, updated_at = ? WHERE badge_image_url = ?').bind(nextUrl, nowIso(), value),
      db.prepare('UPDATE experiences SET image_url = ?, updated_at = ? WHERE image_url = ?').bind(nextUrl, nowIso(), value),
      db.prepare('UPDATE testimonials SET author_photo_url = ?, updated_at = ? WHERE author_photo_url = ?').bind(nextUrl, nowIso(), value),
      db.prepare('UPDATE case_studies SET cover_image_url = CASE WHEN cover_image_url = ? THEN ? ELSE cover_image_url END, screenshots_json = REPLACE(screenshots_json, ?, ?), updated_at = ? WHERE cover_image_url = ? OR INSTR(screenshots_json, ?) > 0')
        .bind(value, nextUrl, value, nextUrl, nowIso(), value, value),
      db.prepare('UPDATE page_sections SET content_json = REPLACE(content_json, ?, ?), updated_at = ? WHERE INSTR(content_json, ?) > 0')
        .bind(value, nextUrl, nowIso(), value),
      db.prepare('UPDATE site_settings SET value_json = REPLACE(value_json, ?, ?), updated_at = ? WHERE INSTR(value_json, ?) > 0')
        .bind(value, nextUrl, nowIso(), value),
      db.prepare('UPDATE seo_metadata SET og_image = CASE WHEN og_image = ? THEN ? ELSE og_image END, twitter_image = CASE WHEN twitter_image = ? THEN ? ELSE twitter_image END, updated_at = ? WHERE og_image = ? OR twitter_image = ?')
        .bind(value, nextUrl, value, nextUrl, nowIso(), value, value),
    )
  }
  if (statements.length) await db.batch(statements)
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
