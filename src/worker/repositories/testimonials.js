import { nowIso } from '../utils/responses'

function normalizeString(value) {
  return String(value || '').trim()
}

function normalizeStatus(value) {
  return value === 'published' || value === 'archived' ? value : 'draft'
}

function normalizeSortOrder(value, fallback = 999) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

function toTestimonial(row) {
  return {
    id: row.id,
    quote: row.quote,
    authorName: row.author_name,
    authorTitle: row.author_title || '',
    authorCompany: row.author_company || '',
    authorPhotoUrl: row.author_photo_url || '',
    relatedServiceId: row.related_service_id || null,
    isFeatured: Number(row.is_featured) === 1,
    sortOrder: Number(row.sort_order) || 999,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listTestimonials(db, { includeDrafts = false } = {}) {
  const where = includeDrafts ? '' : "WHERE status = 'published'"
  const result = await db
    .prepare(
      `SELECT id, quote, author_name, author_title, author_company, author_photo_url, related_service_id, is_featured, sort_order, status, created_at, updated_at
       FROM testimonials
       ${where}
       ORDER BY sort_order ASC, updated_at DESC`,
    )
    .all()
  return (result.results || []).map(toTestimonial)
}

export async function replaceTestimonials(db, items) {
  await db.prepare('DELETE FROM testimonials').run()

  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const timestamp = nowIso()
    const id = normalizeString(item.id) || crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO testimonials (
          id, quote, author_name, author_title, author_company, author_photo_url, related_service_id, is_featured, sort_order, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        normalizeString(item.quote),
        normalizeString(item.authorName),
        normalizeString(item.authorTitle),
        normalizeString(item.authorCompany),
        normalizeString(item.authorPhotoUrl),
        normalizeString(item.relatedServiceId) || null,
        item.isFeatured ? 1 : 0,
        normalizeSortOrder(item.sortOrder, (index + 1) * 10),
        normalizeStatus(item.status),
        timestamp,
        timestamp,
      )
      .run()
  }
}
