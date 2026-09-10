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

/**
 * Counts of what a venue is tied to, for explaining a refusal. Courts are
 * reported but never block: they are part of the venue's own configuration
 * and are expected to go with it. Sessions are the opposite -- they are
 * historical results, and `pickleball_sessions.venue_id` cascades, so
 * deleting a used venue would erase every session played there.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} id
 * @param {string} organizationId
 */
export async function findVenueUsage(db, id, organizationId) {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM pickleball_sessions
           WHERE venue_id = ?1 AND organization_id = ?2) AS sessions,
         (SELECT COUNT(*) FROM pickleball_sessions
           WHERE venue_id = ?1 AND organization_id = ?2
             AND status NOT IN ('COMPLETED', 'CANCELLED')) AS live_sessions,
         (SELECT COUNT(*) FROM courts WHERE venue_id = ?1) AS courts`,
    )
    .bind(id, organizationId)
    .first()

  return {
    sessions: Number(row?.sessions ?? 0),
    liveSessions: Number(row?.live_sessions ?? 0),
    courts: Number(row?.courts ?? 0),
  }
}

/**
 * Deletes a venue only while no session references it. Its courts cascade.
 *
 * As with deletePlayer, the precondition is part of the statement so a
 * session created between check and delete cannot slip through.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} id
 * @param {string} organizationId
 * @returns {Promise<boolean>} whether a row was actually removed
 */
export async function deleteVenue(db, id, organizationId) {
  const result = await db
    .prepare(
      `DELETE FROM venues
       WHERE id = ? AND organization_id = ?
         AND NOT EXISTS (SELECT 1 FROM pickleball_sessions WHERE venue_id = venues.id)`,
    )
    .bind(id, organizationId)
    .run()

  return Number(result?.meta?.changes ?? 0) > 0
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
