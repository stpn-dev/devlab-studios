import { nowIso } from '../../utils/responses.js'

function toSessionPlayer(row) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    playerId: row.player_id,
    displayName: row.display_name,
    registrationStatus: row.registration_status,
    attendanceStatus: row.attendance_status,
    availabilityStatus: row.availability_status,
    checkedInAt: row.checked_in_at,
    gamesPlayed: row.games_played,
    registeredAt: row.registered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SESSION_PLAYER_COLUMNS = `sp.id, sp.session_id, sp.player_id, p.display_name, sp.registration_status, sp.attendance_status,
  sp.availability_status, sp.checked_in_at, sp.games_played, sp.registered_at, sp.created_at, sp.updated_at`

export async function listSessionPlayers(db, sessionId) {
  const result = await db
    .prepare(
      `SELECT ${SESSION_PLAYER_COLUMNS}
       FROM session_players sp
       JOIN players p ON p.id = sp.player_id
       WHERE sp.session_id = ?
       ORDER BY p.display_name ASC`,
    )
    .bind(sessionId)
    .all()
  return (result.results || []).map(toSessionPlayer)
}

export async function getSessionPlayer(db, sessionId, playerId) {
  const row = await db
    .prepare(
      `SELECT ${SESSION_PLAYER_COLUMNS}
       FROM session_players sp
       JOIN players p ON p.id = sp.player_id
       WHERE sp.session_id = ? AND sp.player_id = ?`,
    )
    .bind(sessionId, playerId)
    .first()
  return toSessionPlayer(row)
}

export async function registerPlayer(db, { sessionId, playerId }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO session_players (id, session_id, player_id, registration_status, attendance_status, availability_status, games_played, registered_at, created_at, updated_at)
       VALUES (?, ?, ?, 'REGISTERED', 'NOT_CHECKED_IN', 'AVAILABLE', 0, ?, ?, ?)
       ON CONFLICT(session_id, player_id) DO UPDATE SET
         registration_status = 'REGISTERED',
         updated_at = excluded.updated_at`,
    )
    .bind(id, sessionId, playerId, timestamp, timestamp, timestamp)
    .run()

  return getSessionPlayer(db, sessionId, playerId)
}

export async function checkInPlayer(db, sessionId, playerId) {
  const timestamp = nowIso()
  const result = await db
    .prepare(
      `UPDATE session_players SET attendance_status = 'CHECKED_IN', checked_in_at = ?, updated_at = ?
       WHERE session_id = ? AND player_id = ? AND registration_status = 'REGISTERED' AND attendance_status = 'NOT_CHECKED_IN'`,
    )
    .bind(timestamp, timestamp, sessionId, playerId)
    .run()

  if (!result.meta.changes) return null
  return getSessionPlayer(db, sessionId, playerId)
}

export async function bulkCheckIn(db, sessionId, playerIds) {
  if (!playerIds.length) return []

  const timestamp = nowIso()
  const placeholders = playerIds.map(() => '?').join(', ')

  const eligible = await db
    .prepare(
      `SELECT player_id FROM session_players
       WHERE session_id = ? AND player_id IN (${placeholders}) AND registration_status = 'REGISTERED' AND attendance_status = 'NOT_CHECKED_IN'`,
    )
    .bind(sessionId, ...playerIds)
    .all()

  const eligibleIds = (eligible.results || []).map((row) => row.player_id)
  if (!eligibleIds.length) return []

  const eligiblePlaceholders = eligibleIds.map(() => '?').join(', ')
  await db
    .prepare(
      `UPDATE session_players SET attendance_status = 'CHECKED_IN', checked_in_at = ?, updated_at = ?
       WHERE session_id = ? AND player_id IN (${eligiblePlaceholders})`,
    )
    .bind(timestamp, timestamp, sessionId, ...eligibleIds)
    .run()

  return eligibleIds
}

export async function setAvailability(db, sessionId, playerId, status) {
  const result = await db
    .prepare(
      `UPDATE session_players SET availability_status = ?, updated_at = ?
       WHERE session_id = ? AND player_id = ? AND attendance_status = 'CHECKED_IN'`,
    )
    .bind(status, nowIso(), sessionId, playerId)
    .run()

  if (!result.meta.changes) return null
  return getSessionPlayer(db, sessionId, playerId)
}

export async function leaveSession(db, sessionId, playerId) {
  const result = await db
    .prepare(
      `UPDATE session_players SET attendance_status = 'LEFT_SESSION', updated_at = ?
       WHERE session_id = ? AND player_id = ? AND attendance_status = 'CHECKED_IN'`,
    )
    .bind(nowIso(), sessionId, playerId)
    .run()

  if (!result.meta.changes) return null
  return getSessionPlayer(db, sessionId, playerId)
}

export async function cancelRegistration(db, sessionId, playerId) {
  const result = await db
    .prepare(
      `UPDATE session_players SET registration_status = 'CANCELLED', updated_at = ?
       WHERE session_id = ? AND player_id = ? AND registration_status = 'REGISTERED' AND attendance_status = 'NOT_CHECKED_IN'`,
    )
    .bind(nowIso(), sessionId, playerId)
    .run()

  if (!result.meta.changes) return null
  return getSessionPlayer(db, sessionId, playerId)
}
