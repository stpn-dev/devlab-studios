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

/**
 * Unexecuted INSERT placing a player at the back of the queue.
 *
 * Unlike `joinQueue` below there is NO `hasOpenQueueEntry` guard, because this
 * form exists for `db.batch()` callers that delete the player's existing
 * entries earlier in the very same batch — a pre-read there would still see
 * the not-yet-deleted row and wrongly skip the re-queue. Only use this when
 * the same batch guarantees no open entry survives.
 */
export function buildJoinQueueStatement(db, { sessionId, sessionPlayerId }) {
  const timestamp = nowIso()
  return db
    .prepare(
      `INSERT INTO queue_entries (id, session_id, session_player_id, status, queued_at, created_at, updated_at)
       VALUES (?, ?, ?, 'QUEUED', ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), sessionId, sessionPlayerId, timestamp, timestamp, timestamp)
}

// True when a D1 write failed because of
// idx_queue_entries_one_open_per_player (migrations/pickleball/0006) -- the
// partial unique index that is the REAL enforcement of "at most one open
// queue entry per session_player". D1 doesn't expose a typed error code here,
// so this is a string match against the driver's SQLITE_CONSTRAINT message,
// same as any other place in this codebase that has to distinguish a
// constraint violation from an unrelated failure (there is no existing
// precedent to follow -- this is the first).
function isUniqueConstraintViolation(error) {
  const message = String((error && error.message) || error || '')
  return message.includes('UNIQUE constraint failed')
}

export async function joinQueue(db, { sessionId, sessionPlayerId }) {
  const alreadyOpen = await hasOpenQueueEntry(db, sessionId, sessionPlayerId)
  if (alreadyOpen) return null

  const id = crypto.randomUUID()
  const timestamp = nowIso()

  try {
    await db
      .prepare(
        `INSERT INTO queue_entries (id, session_id, session_player_id, status, queued_at, created_at, updated_at)
         VALUES (?, ?, ?, 'QUEUED', ?, ?, ?)`,
      )
      .bind(id, sessionId, sessionPlayerId, timestamp, timestamp, timestamp)
      .run()
  } catch (error) {
    // The `hasOpenQueueEntry` check above is only a fast-path optimization --
    // it's a plain read-then-write with no serialization, so two concurrent
    // or retried calls can both pass it and both reach this INSERT. The
    // partial unique index rejects the second one at the DB level; treat that
    // exactly like the pre-check catching it, so callers get one consistent
    // "already has an open entry" signal regardless of which path caught it.
    if (isUniqueConstraintViolation(error)) return null
    throw error
  }

  const row = await db.prepare(`SELECT * FROM queue_entries WHERE id = ?`).bind(id).first()
  return toQueueEntry(row)
}

/**
 * True when the player holds an open assignment (ASSIGNED or PLAYING) in this
 * session — i.e. they are really seated on a court right now. Distinct from
 * "has a team": a player who played earlier and re-queued still has an old
 * team but no open assignment.
 */
export async function hasOpenAssignment(db, sessionId, sessionPlayerId) {
  const row = await db
    .prepare(
      `SELECT id FROM queue_entries
       WHERE session_id = ? AND session_player_id = ? AND status IN ('ASSIGNED', 'PLAYING')`,
    )
    .bind(sessionId, sessionPlayerId)
    .first()
  return Boolean(row)
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

/**
 * Unexecuted UPDATE flipping QUEUED entries to ASSIGNED. Returns null for an
 * empty id list so batch callers can filter it out.
 */
export function buildMarkAssignedStatement(db, sessionId, sessionPlayerIds) {
  if (!sessionPlayerIds.length) return null
  const timestamp = nowIso()
  const placeholders = sessionPlayerIds.map(() => '?').join(', ')
  return db
    .prepare(
      `UPDATE queue_entries SET status = 'ASSIGNED', assigned_at = ?, updated_at = ?
       WHERE session_id = ? AND session_player_id IN (${placeholders}) AND status = 'QUEUED'`,
    )
    .bind(timestamp, timestamp, sessionId, ...sessionPlayerIds)
}

/**
 * Unexecuted UPDATE flipping ASSIGNED entries to PLAYING, once a game
 * actually starts for the court those players were assigned to.
 */
export function buildMarkPlayingStatement(db, sessionId, sessionPlayerIds) {
  if (!sessionPlayerIds.length) return null
  const timestamp = nowIso()
  const placeholders = sessionPlayerIds.map(() => '?').join(', ')
  return db
    .prepare(
      `UPDATE queue_entries SET status = 'PLAYING', updated_at = ?
       WHERE session_id = ? AND session_player_id IN (${placeholders}) AND status = 'ASSIGNED'`,
    )
    .bind(timestamp, sessionId, ...sessionPlayerIds)
}

export function buildCloseQueueEntryStatement(db, sessionId, sessionPlayerId) {
  return db
    .prepare(`DELETE FROM queue_entries WHERE session_id = ? AND session_player_id = ?`)
    .bind(sessionId, sessionPlayerId)
}
