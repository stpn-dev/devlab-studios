import { nowIso } from '../../utils/responses.js'

function toSessionCourt(row) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    courtId: row.court_id,
    courtName: row.court_name,
    enabled: Boolean(row.enabled),
    status: row.status,
    currentGameId: row.current_game_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SESSION_COURT_COLUMNS = `sc.id, sc.session_id, sc.court_id, c.name AS court_name, sc.enabled, sc.status, sc.current_game_id, sc.created_at, sc.updated_at`

export async function listSessionCourts(db, sessionId) {
  const result = await db
    .prepare(
      `SELECT ${SESSION_COURT_COLUMNS} FROM session_courts sc
       JOIN courts c ON c.id = sc.court_id
       WHERE sc.session_id = ?
       ORDER BY c.sort_order ASC`,
    )
    .bind(sessionId)
    .all()
  return (result.results || []).map(toSessionCourt)
}

export async function getSessionCourt(db, sessionId, sessionCourtId) {
  const row = await db
    .prepare(`SELECT ${SESSION_COURT_COLUMNS} FROM session_courts sc JOIN courts c ON c.id = sc.court_id WHERE sc.session_id = ? AND sc.id = ?`)
    .bind(sessionId, sessionCourtId)
    .first()
  return toSessionCourt(row)
}

export async function setCourtEnabled(db, sessionId, sessionCourtId, enabled) {
  const result = await db
    .prepare(`UPDATE session_courts SET enabled = ?, updated_at = ? WHERE session_id = ? AND id = ?`)
    .bind(enabled ? 1 : 0, nowIso(), sessionId, sessionCourtId)
    .run()
  if (!result.meta.changes) return null
  return getSessionCourt(db, sessionId, sessionCourtId)
}

// Prepared-but-not-yet-run INSERT for one session_courts row, following the
// same build*Statement convention as buildSetCourtStatusStatement below and
// SessionCoordinatorDO.ts, so a caller can compose several of these into a
// single db.batch() alongside statements from other repositories (e.g. the
// session-creation INSERT in sessions.js).
export function buildCreateSessionCourtStatement(db, sessionId, court, timestamp) {
  return db
    .prepare(
      `INSERT INTO session_courts (id, session_id, court_id, enabled, status, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'AVAILABLE', ?, ?)`,
    )
    .bind(crypto.randomUUID(), sessionId, court.id, timestamp, timestamp)
}

// One statement per venue court, ready to append to the caller's own batch.
// Returns an empty array for a venue with zero courts — callers must not
// treat that as an error, just nothing to seed.
export function buildSeedSessionCourtsStatements(db, sessionId, courts) {
  const timestamp = nowIso()
  return courts.map((court) => buildCreateSessionCourtStatement(db, sessionId, court, timestamp))
}

export async function seedSessionCourtsFromVenue(db, sessionId, courts) {
  if (!courts.length) return
  await db.batch(buildSeedSessionCourtsStatements(db, sessionId, courts))
}

export function buildSetCourtStatusStatement(db, sessionId, sessionCourtId, status) {
  return db
    .prepare(`UPDATE session_courts SET status = ?, updated_at = ? WHERE session_id = ? AND id = ?`)
    .bind(status, nowIso(), sessionId, sessionCourtId)
}
