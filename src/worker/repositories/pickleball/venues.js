import { nowIso } from '../../utils/responses.js'

function toVenue(row) {
  if (!row) return null
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    address: row.address || '',
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const VENUE_COLUMNS = 'id, organization_id, name, address, timezone, created_at, updated_at'

export async function listVenues(db, organizationId) {
  const result = await db
    .prepare(`SELECT ${VENUE_COLUMNS} FROM venues WHERE organization_id = ? ORDER BY name ASC`)
    .bind(organizationId)
    .all()
  return (result.results || []).map(toVenue)
}

export async function getVenue(db, id, organizationId) {
  const row = await db
    .prepare(`SELECT ${VENUE_COLUMNS} FROM venues WHERE id = ? AND organization_id = ?`)
    .bind(id, organizationId)
    .first()
  return toVenue(row)
}

export async function createVenue(db, { organizationId, name, address = '', timezone = 'UTC' }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO venues (id, organization_id, name, address, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, organizationId, name.trim(), address ? address.trim() : '', timezone || 'UTC', timestamp, timestamp)
    .run()

  return getVenue(db, id, organizationId)
}
