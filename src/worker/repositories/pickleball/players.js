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

// A page of players is capped, and the cap is enforced here rather than
// trusted from the caller.
//
// This query used to have no LIMIT at all: it returned every player in the
// organization and the page rendered all of them. That is fine for a club of
// twenty and quietly awful for one of two thousand -- the whole roster
// crosses the wire and the browser lays out every row, on a page whose only
// real job is "find one person and edit their name". It is also the failure a
// growing club hits first, precisely when they can least afford it.
export const PLAYERS_PAGE_SIZE = 50
const PLAYERS_MAX_PAGE_SIZE = 200

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} organizationId
 * @param {{ includeInactive?: boolean, search?: string, limit?: number, offset?: number }} [options]
 * @returns {Promise<{ players: unknown[], total: number, limit: number, offset: number, hasMore: boolean }>}
 */
export async function listPlayers(db, organizationId, { includeInactive = false, search = '', limit, offset = 0 } = {}) {
  const activeClause = includeInactive ? '' : 'AND active = 1'

  // Matched on normalized_name, the column the uniqueness rules already use,
  // so search behaves the same way "is this player already here?" does --
  // case- and punctuation-insensitive -- rather than inventing a second
  // notion of what counts as the same name.
  const term = String(search || '').trim().toLowerCase()
  const searchClause = term ? 'AND normalized_name LIKE ?' : ''
  const searchBinding = term ? [`%${term.replace(/[%_]/g, '')}%`] : []

  const safeLimit = Math.min(Math.max(Number(limit) || PLAYERS_PAGE_SIZE, 1), PLAYERS_MAX_PAGE_SIZE)
  const safeOffset = Math.max(Number(offset) || 0, 0)

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM players WHERE organization_id = ? ${activeClause} ${searchClause}`)
    .bind(organizationId, ...searchBinding)
    .first()
  const total = Number(countRow?.total ?? 0)

  const result = await db
    .prepare(
      `SELECT ${PLAYER_COLUMNS} FROM players
       WHERE organization_id = ? ${activeClause} ${searchClause}
       ORDER BY display_name ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(organizationId, ...searchBinding, safeLimit, safeOffset)
    .all()

  const players = (result.results || []).map(toPlayer)
  return { players, total, limit: safeLimit, offset: safeOffset, hasMore: safeOffset + players.length < total }
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

// Everything that references a player does so ON DELETE CASCADE
// (session_players, player_game_stats, matchmaking_history,
// player_performance_snapshots). An unguarded DELETE therefore does not
// fail -- it succeeds and silently takes the player's session attendance,
// per-game statistics and pairing history with it, rewriting finished games
// and other players' matchmaking record on the way out. So a player with any
// history is not deletable at all; `active = 0` is the way to retire one.
//
// Kept as a single reusable fragment so the reason shown to the operator and
// the condition actually enforced can never drift apart.
const PLAYER_IN_USE_CLAUSE = `
  EXISTS (SELECT 1 FROM session_players WHERE player_id = players.id)
  OR EXISTS (SELECT 1 FROM player_game_stats WHERE player_id = players.id)
  OR EXISTS (SELECT 1 FROM matchmaking_history WHERE player_id = players.id OR other_player_id = players.id)`

/**
 * Counts of what a player is currently tied to, for explaining a refusal.
 * `liveSessions` counts only sessions still under way, which is the case an
 * operator is most likely to be surprised by.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} id
 * @param {string} organizationId
 */
export async function findPlayerUsage(db, id, organizationId) {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM session_players sp
            JOIN pickleball_sessions s ON s.id = sp.session_id
           WHERE sp.player_id = ?1 AND s.organization_id = ?2) AS sessions,
         (SELECT COUNT(*) FROM session_players sp
            JOIN pickleball_sessions s ON s.id = sp.session_id
           WHERE sp.player_id = ?1 AND s.organization_id = ?2
             AND s.status NOT IN ('COMPLETED', 'CANCELLED')) AS live_sessions,
         (SELECT COUNT(*) FROM player_game_stats WHERE player_id = ?1) AS games`,
    )
    .bind(id, organizationId)
    .first()

  return {
    sessions: Number(row?.sessions ?? 0),
    liveSessions: Number(row?.live_sessions ?? 0),
    games: Number(row?.games ?? 0),
  }
}

/**
 * Deletes a player only while nothing references them.
 *
 * The precondition lives inside the DELETE rather than in a preceding SELECT,
 * so there is no window in which a player passes the check and is then added
 * to a session before the delete lands. `changes === 0` therefore means
 * "refused or already gone", never "deleted something it shouldn't have".
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} id
 * @param {string} organizationId
 * @returns {Promise<boolean>} whether a row was actually removed
 */
export async function deletePlayer(db, id, organizationId) {
  const result = await db
    .prepare(
      `DELETE FROM players
       WHERE id = ? AND organization_id = ?
         AND NOT (${PLAYER_IN_USE_CLAUSE})`,
    )
    .bind(id, organizationId)
    .run()

  return Number(result?.meta?.changes ?? 0) > 0
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
