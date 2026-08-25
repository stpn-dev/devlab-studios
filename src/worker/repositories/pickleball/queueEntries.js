import { nowIso } from '../../utils/responses.js'

function toQueueEntry(row) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionPlayerId: row.session_player_id,
    status: row.status,
    queuedAt: row.queued_at,
    assignedAt: row.assigned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function hasOpenQueueEntry(db, sessionId, sessionPlayerId) {
  const row = await db
    .prepare(`SELECT id FROM queue_entries WHERE session_id = ? AND session_player_id = ? AND status IN ('QUEUED', 'ASSIGNED', 'PLAYING')`)
    .bind(sessionId, sessionPlayerId)
    .first()
  return Boolean(row)
}

export async function joinQueue(db, { sessionId, sessionPlayerId }) {
  const alreadyOpen = await hasOpenQueueEntry(db, sessionId, sessionPlayerId)
  if (alreadyOpen) return null

  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO queue_entries (id, session_id, session_player_id, status, queued_at, created_at, updated_at)
       VALUES (?, ?, ?, 'QUEUED', ?, ?, ?)`,
    )
    .bind(id, sessionId, sessionPlayerId, timestamp, timestamp, timestamp)
    .run()

  const row = await db.prepare(`SELECT * FROM queue_entries WHERE id = ?`).bind(id).first()
  return toQueueEntry(row)
}

export async function leaveQueue(db, sessionId, sessionPlayerId) {
  const deleted = await db
    .prepare(`DELETE FROM queue_entries WHERE session_id = ? AND session_player_id = ? AND status = 'QUEUED'`)
    .bind(sessionId, sessionPlayerId)
    .run()
  return Boolean(deleted.meta.changes)
}

export async function listQueueForSession(db, sessionId) {
  const result = await db
    .prepare(
      `SELECT qe.id, qe.session_id, qe.session_player_id, qe.status, qe.queued_at, qe.assigned_at,
              sp.player_id, p.display_name, sp.games_played
       FROM queue_entries qe
       JOIN session_players sp ON sp.id = qe.session_player_id
       JOIN players p ON p.id = sp.player_id
       WHERE qe.session_id = ?
       ORDER BY qe.status ASC, qe.queued_at ASC`,
    )
    .bind(sessionId)
    .all()

  return (result.results || []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    sessionPlayerId: row.session_player_id,
    playerId: row.player_id,
    displayName: row.display_name,
    gamesPlayed: row.games_played,
    status: row.status,
    queuedAt: row.queued_at,
    assignedAt: row.assigned_at,
  }))
}

export async function listEligibleQueueCandidates(db, sessionId) {
  const result = await db
    .prepare(
      `SELECT qe.session_player_id, sp.player_id, p.display_name, sp.games_played, qe.queued_at
       FROM queue_entries qe
       JOIN session_players sp ON sp.id = qe.session_player_id
       JOIN players p ON p.id = sp.player_id
       WHERE qe.session_id = ?
         AND qe.status = 'QUEUED'
         AND sp.registration_status = 'REGISTERED'
         AND sp.attendance_status = 'CHECKED_IN'
         AND sp.availability_status = 'AVAILABLE'
       ORDER BY sp.games_played ASC, qe.queued_at ASC`,
    )
    .bind(sessionId)
    .all()

  return (result.results || []).map((row) => ({
    sessionPlayerId: row.session_player_id,
    playerId: row.player_id,
    displayName: row.display_name,
    gamesPlayed: row.games_played,
    queuedAt: row.queued_at,
  }))
}

export async function markAssigned(db, sessionId, sessionPlayerIds) {
  if (!sessionPlayerIds.length) return
  const timestamp = nowIso()
  const placeholders = sessionPlayerIds.map(() => '?').join(', ')
  await db
    .prepare(
      `UPDATE queue_entries SET status = 'ASSIGNED', assigned_at = ?, updated_at = ?
       WHERE session_id = ? AND session_player_id IN (${placeholders}) AND status = 'QUEUED'`,
    )
    .bind(timestamp, timestamp, sessionId, ...sessionPlayerIds)
    .run()
}

export async function closeQueueEntry(db, sessionId, sessionPlayerId) {
  await db
    .prepare(`DELETE FROM queue_entries WHERE session_id = ? AND session_player_id = ?`)
    .bind(sessionId, sessionPlayerId)
    .run()
}
