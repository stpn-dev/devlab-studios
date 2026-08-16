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
  await deleteMediaAssetByKey(db, mediaBucket, row.key)
  return true
}

/** Same as deleteMediaAssetByUrl, for callers that already resolved the R2 key themselves (skips the redundant media_assets lookup). */
export async function deleteMediaAssetByKey(db, mediaBucket, key) {
  await mediaBucket.delete(key)
  await deleteMediaAsset(db, key)
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
    // Only matches image_url values with no corresponding gallery row (a
    // legacy/rollback snapshot predating the is_thumbnail model) — since it
    // only ever fires for the project's own thumbnail, isThumbnail is always 1.
    sql: `SELECT id, title AS label, 1 AS isThumbnail
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

function buildPlaceholders(count) {
  return Array(count).fill('?').join(', ')
}

// Cloudflare D1 caps bound parameters per query at 100 — well below what a
// full media list's key+url candidate set can reach. Chunk any batched query
// to stay safely under that regardless of how many distinct candidates exist.
const MAX_BOUND_PARAMS_PER_QUERY = 90

export function chunkValues(values, chunkSize) {
  const chunks = []
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize))
  }
  return chunks
}

export function mergeReferenceMaps(chunkMaps, values) {
  const merged = new Map(values.map((value) => [value, []]))
  for (const chunkMap of chunkMaps) {
    for (const [value, refs] of chunkMap) {
      const bucket = merged.get(value)
      if (bucket) bucket.push(...refs)
    }
  }
  return merged
}

// Batched equivalent of the exact-match entries in MEDIA_REFERENCE_QUERIES:
// one IN(...) query per reference type covering every candidate value at
// once, instead of one query per candidate. Each SELECT returns the matched
// value itself so results can be attributed back to the right asset.
const BATCH_EXACT_QUERIES = [
  {
    type: 'Project',
    buildSql: (placeholders) => `
      SELECT project_gallery_images.url AS matchedValue,
             project_gallery_images.project_id AS id,
             projects.title AS label,
             project_gallery_images.is_thumbnail AS isThumbnail
      FROM project_gallery_images
      JOIN projects ON projects.id = project_gallery_images.project_id
      WHERE project_gallery_images.url IN (${placeholders})`,
  },
  {
    type: 'Project',
    // Only matches image_url values with no corresponding gallery row — see
    // the identical entry in MEDIA_REFERENCE_QUERIES for why isThumbnail is always 1 here.
    buildSql: (placeholders) => `
      SELECT image_url AS matchedValue, id, title AS label, 1 AS isThumbnail
      FROM projects
      WHERE image_url IN (${placeholders}) AND image_url != ''
        AND NOT EXISTS (
          SELECT 1 FROM project_gallery_images
          WHERE project_gallery_images.project_id = projects.id
            AND project_gallery_images.url = projects.image_url
        )`,
  },
  { type: 'Insight cover', buildSql: (p) => `SELECT cover_image_url AS matchedValue, id, title AS label FROM articles WHERE cover_image_url IN (${p})` },
  { type: 'Certification badge', buildSql: (p) => `SELECT badge_image_url AS matchedValue, id, name AS label FROM certifications WHERE badge_image_url IN (${p})` },
  { type: 'Profile experience', buildSql: (p) => `SELECT image_url AS matchedValue, id, role AS label FROM experiences WHERE image_url IN (${p})` },
  { type: 'Testimonial photo', buildSql: (p) => `SELECT author_photo_url AS matchedValue, id, author_name AS label FROM testimonials WHERE author_photo_url IN (${p})` },
  { type: 'Case-study cover', buildSql: (p) => `SELECT cover_image_url AS matchedValue, id, title AS label FROM case_studies WHERE cover_image_url IN (${p})` },
]

async function runBatchExactQueriesChunk(db, chunk) {
  const referencesByValue = new Map(chunk.map((value) => [value, []]))
  const placeholders = buildPlaceholders(chunk.length)
  for (const query of BATCH_EXACT_QUERIES) {
    try {
      const result = await db.prepare(query.buildSql(placeholders)).bind(...chunk).all()
      for (const row of result.results || []) {
        const bucket = referencesByValue.get(row.matchedValue)
        if (bucket) bucket.push({ type: query.type, id: row.id, label: row.label || row.id, isThumbnail: Boolean(row.isThumbnail) })
      }
    } catch (error) {
      if (!/no such table/i.test(String(error?.message || ''))) throw error
    }
  }
  return referencesByValue
}

async function runBatchExactQueries(db, values) {
  if (!values.length) return new Map()
  const chunks = chunkValues(values, MAX_BOUND_PARAMS_PER_QUERY)
  const chunkMaps = await Promise.all(chunks.map((chunk) => runBatchExactQueriesChunk(db, chunk)))
  return mergeReferenceMaps(chunkMaps, values)
}

async function runBatchSeoImageQueryChunk(db, chunk) {
  const referencesByValue = new Map(chunk.map((value) => [value, []]))
  const placeholders = buildPlaceholders(chunk.length)
  try {
    const result = await db
      .prepare(`SELECT id, page_slug AS label, og_image, twitter_image FROM seo_metadata WHERE og_image IN (${placeholders}) OR twitter_image IN (${placeholders})`)
      .bind(...chunk, ...chunk)
      .all()
    for (const row of result.results || []) {
      for (const matchedValue of [row.og_image, row.twitter_image]) {
        const bucket = referencesByValue.get(matchedValue)
        if (bucket) bucket.push({ type: 'SEO image', id: row.id, label: row.label || row.id, isThumbnail: false })
      }
    }
  } catch (error) {
    if (!/no such table/i.test(String(error?.message || ''))) throw error
  }
  return referencesByValue
}

async function runBatchSeoImageQuery(db, values) {
  if (!values.length) return new Map()
  // Bound twice per candidate (og_image OR twitter_image), so halve the chunk size.
  const chunks = chunkValues(values, Math.floor(MAX_BOUND_PARAMS_PER_QUERY / 2))
  const chunkMaps = await Promise.all(chunks.map((chunk) => runBatchSeoImageQueryChunk(db, chunk)))
  return mergeReferenceMaps(chunkMaps, values)
}

// The three JSON-blob "contains" columns can't be batched with IN(...) (they're
// substring searches, not equality), so instead of one query per candidate,
// fetch every row from the table ONCE and do the substring check in JS —
// still exactly one query regardless of how many candidates/assets there are,
// and it sidesteps D1's LIKE/GLOB pattern-complexity limit entirely (no LIKE
// or INSTR needed at all for this batched path).
async function runContainsScan(db, { table, jsonColumn, idColumn, labelColumn, type }, values) {
  const referencesByValue = new Map(values.map((value) => [value, []]))
  if (!values.length) return referencesByValue

  let rows
  try {
    const result = await db.prepare(`SELECT ${idColumn} AS id, ${labelColumn} AS label, ${jsonColumn} AS blob FROM ${table}`).all()
    rows = result.results || []
  } catch (error) {
    if (/no such table/i.test(String(error?.message || ''))) return referencesByValue
    throw error
  }

  for (const row of rows) {
    const blob = String(row.blob || '')
    for (const value of values) {
      if (blob.includes(value)) referencesByValue.get(value).push({ type, id: row.id, label: row.label || row.id, isThumbnail: false })
    }
  }
  return referencesByValue
}

const CONTAINS_SCAN_TABLES = [
  { table: 'case_studies', jsonColumn: 'screenshots_json', idColumn: 'id', labelColumn: 'title', type: 'Case-study gallery' },
  { table: 'page_sections', jsonColumn: 'content_json', idColumn: 'id', labelColumn: 'section_key', type: 'Page section' },
  { table: 'site_settings', jsonColumn: 'value_json', idColumn: 'key', labelColumn: 'key', type: 'Site setting' },
]

/**
 * Batched equivalent of findMediaReferences for a whole list of assets at
 * once — used by the Media Library's GET listing, where calling
 * findMediaReferences per-asset would issue ~20 D1 queries per asset (up to
 * thousands per page). This issues ~11 queries per MAX_BOUND_PARAMS_PER_QUERY-
 * sized chunk of candidates (D1 caps bound parameters per query at 100) —
 * a small, roughly-constant number for a typical page, scaling only if the
 * asset list is unusually large — then attributes results back per asset.
 *
 * db: D1Database. assets: array of { key, url } (string fields — only key
 * and url are read). Returns a Map<assetKey, references[]> of
 * {type, id, label, isThumbnail} entries.
 */
export async function findMediaReferencesForAssets(db, assets) {
  const normalize = (value) => String(value || '').trim()
  const candidateSet = new Set()
  for (const asset of assets) {
    const key = normalize(asset.key)
    const url = normalize(asset.url)
    if (key) candidateSet.add(key)
    if (url) candidateSet.add(url)
  }
  const values = [...candidateSet]

  const [exactMap, seoMap, ...containsMaps] = await Promise.all([
    runBatchExactQueries(db, values),
    runBatchSeoImageQuery(db, values),
    ...CONTAINS_SCAN_TABLES.map((tableConfig) => runContainsScan(db, tableConfig, values)),
  ])
  const valueMaps = [exactMap, seoMap, ...containsMaps]

  const byAssetKey = new Map()
  for (const asset of assets) {
    const seen = new Set()
    const refs = []
    for (const candidate of [normalize(asset.key), normalize(asset.url)].filter(Boolean)) {
      for (const map of valueMaps) {
        for (const ref of map.get(candidate) || []) {
          const dedupeKey = `${ref.type}:${ref.id}`
          if (seen.has(dedupeKey)) continue
          seen.add(dedupeKey)
          refs.push(ref)
        }
      }
    }
    byAssetKey.set(asset.key, refs)
  }
  return byAssetKey
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
