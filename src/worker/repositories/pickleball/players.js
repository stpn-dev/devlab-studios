import { nowIso } from '../../utils/responses.js'

function normalizeName(displayName) {
  return String(displayName).trim().toLowerCase().replace(/\s+/g, ' ')
}

function toPlayer(row) {
  if (!row) return null
  return {
    id: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
    linkedUserId: row.linked_user_id,
    active: Boolean(row.active),
    publicVisible: Boolean(row.public_visible),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const PLAYER_COLUMNS = 'id, organization_id, display_name, normalized_name, linked_user_id, active, public_visible, created_at, updated_at'

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} organizationId
 * @param {{ includeInactive?: boolean }} [options]
 */
export async function listPlayers(db, organizationId, { includeInactive = false } = {}) {
  const activeClause = includeInactive ? '' : 'AND active = 1'
  const result = await db
    .prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE organization_id = ? ${activeClause} ORDER BY display_name ASC`)
    .bind(organizationId)
    .all()
  return (result.results || []).map(toPlayer)
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} id
 * @param {string} organizationId
 */
export async function getPlayer(db, id, organizationId) {
  const row = await db
    .prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE id = ? AND organization_id = ?`)
    .bind(id, organizationId)
    .first()
  return toPlayer(row)
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ organizationId: string, displayName: string }} options
 */
export async function createPlayer(db, { organizationId, displayName }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO players (id, organization_id, display_name, normalized_name, active, public_visible, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
    )
    .bind(id, organizationId, displayName.trim(), normalizeName(displayName), timestamp, timestamp)
    .run()

  return getPlayer(db, id, organizationId)
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} id
 * @param {string} organizationId
 * @param {{ displayName?: string, active?: boolean }} options
 */
export async function updatePlayer(db, id, organizationId, { displayName, active }) {
  const existing = await getPlayer(db, id, organizationId)
  if (!existing) return null

  const nextDisplayName = displayName !== undefined ? displayName.trim() : existing.displayName
  const nextActive = active !== undefined ? (active ? 1 : 0) : existing.active ? 1 : 0

  await db
    .prepare('UPDATE players SET display_name = ?, normalized_name = ?, active = ?, updated_at = ? WHERE id = ? AND organization_id = ?')
    .bind(nextDisplayName, normalizeName(nextDisplayName), nextActive, nowIso(), id, organizationId)
    .run()

  return getPlayer(db, id, organizationId)
}
