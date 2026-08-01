import { nowIso, parseJsonField } from '../utils/responses'

function normalizeString(value) {
  return String(value || '').trim()
}

function normalizeStringArray(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => normalizeString(item)).filter(Boolean)
}

function normalizeStatus(value) {
  return value === 'published' || value === 'archived' ? value : 'draft'
}

function normalizeSortOrder(value, fallback = 999) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

function toResourceLibraryItem(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    resourceType: row.resource_type || 'download',
    url: row.url || '',
    icon: row.icon || '',
    tags: parseJsonField(row.tags_json, []),
    isFeatured: Number(row.is_featured) === 1,
    sortOrder: Number(row.sort_order) || 999,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** The real, newly-defined "downloads/reference" Resources collection — see migrations/0004_content_model_v2.sql. */
export async function listResourceLibrary(db, { includeDrafts = false } = {}) {
  const where = includeDrafts ? '' : "WHERE status = 'published'"
  const result = await db
    .prepare(
      `SELECT id, slug, title, description, resource_type, url, icon, tags_json, is_featured, sort_order, status, created_at, updated_at
       FROM resources
       ${where}
       ORDER BY sort_order ASC, updated_at DESC`,
    )
    .all()
  return (result.results || []).map(toResourceLibraryItem)
}

/**
 * Runs as a single db.batch() transaction — see replaceTestimonials's
 * comment in testimonials.js for why a bare DELETE + sequential .run()
 * loop is unsafe on D1.
 */
export async function replaceResourceLibrary(db, items) {
  const timestamp = nowIso()
  const statements = [db.prepare('DELETE FROM resources')]

  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const id = normalizeString(item.id) || crypto.randomUUID()
    const slug = normalizeString(item.slug) || id
    statements.push(
      db
        .prepare(
          `INSERT INTO resources (
            id, slug, title, description, resource_type, url, icon, tags_json, is_featured, sort_order, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          slug,
          normalizeString(item.title),
          normalizeString(item.description),
          normalizeString(item.resourceType) || 'download',
          normalizeString(item.url),
          normalizeString(item.icon),
          JSON.stringify(normalizeStringArray(item.tags)),
          item.isFeatured ? 1 : 0,
          normalizeSortOrder(item.sortOrder, (index + 1) * 10),
          normalizeStatus(item.status),
          timestamp,
          timestamp,
        ),
    )
  }

  await db.batch(statements)
}
