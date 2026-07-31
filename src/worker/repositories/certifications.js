import { nowIso } from '../utils/responses'

function normalizeString(value) {
  return String(value || '').trim()
}

function normalizeStatus(value) {
  return value === 'draft' || value === 'archived' ? value : 'published'
}

function normalizeSortOrder(value, fallback = 999) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

function toCertification(row) {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    issuedDate: row.issued_date || '',
    credentialUrl: row.credential_url || '',
    badgeImageUrl: row.badge_image_url || '',
    sortOrder: Number(row.sort_order) || 999,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCertifications(db, { includeDrafts = false } = {}) {
  const where = includeDrafts ? '' : "WHERE status = 'published'"
  const result = await db
    .prepare(
      `SELECT id, name, issuer, issued_date, credential_url, badge_image_url, sort_order, status, created_at, updated_at
       FROM certifications
       ${where}
       ORDER BY sort_order ASC, updated_at DESC`,
    )
    .all()
  return (result.results || []).map(toCertification)
}

export async function replaceCertifications(db, items) {
  await db.prepare('DELETE FROM certifications').run()

  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const timestamp = nowIso()
    const id = normalizeString(item.id) || crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO certifications (
          id, name, issuer, issued_date, credential_url, badge_image_url, sort_order, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        normalizeString(item.name),
        normalizeString(item.issuer),
        normalizeString(item.issuedDate),
        normalizeString(item.credentialUrl),
        normalizeString(item.badgeImageUrl),
        normalizeSortOrder(item.sortOrder, (index + 1) * 10),
        normalizeStatus(item.status),
        timestamp,
        timestamp,
      )
      .run()
  }
}
