import { nowIso } from '../../utils/responses.js'

function toCourt(row) {
  if (!row) return null
  return {
    id: row.id,
    venueId: row.venue_id,
    organizationId: row.organization_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const COURT_COLUMNS = 'id, venue_id, organization_id, name, sort_order, created_at, updated_at'

export async function listCourtsForVenue(db, venueId, organizationId) {
  const result = await db
    .prepare(`SELECT ${COURT_COLUMNS} FROM courts WHERE venue_id = ? AND organization_id = ? ORDER BY sort_order ASC`)
    .bind(venueId, organizationId)
    .all()
  return (result.results || []).map(toCourt)
}

export async function getCourt(db, id, organizationId) {
  const row = await db
    .prepare(`SELECT ${COURT_COLUMNS} FROM courts WHERE id = ? AND organization_id = ?`)
    .bind(id, organizationId)
    .first()
  return toCourt(row)
}

export async function createCourt(db, { venueId, organizationId, name, sortOrder = 999 }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO courts (id, venue_id, organization_id, name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, venueId, organizationId, name.trim(), Number.isFinite(sortOrder) ? sortOrder : 999, timestamp, timestamp)
    .run()

  return getCourt(db, id, organizationId)
}
