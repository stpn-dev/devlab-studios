// Teams and their members.
//
// Each write here is exposed twice: as a `build*Statement` function returning
// an unexecuted D1 prepared statement, and as an `async` convenience wrapper
// that runs it immediately. SessionCoordinatorDO needs the former so it can
// pass every write of one court assignment into a single `db.batch([...])`
// transaction — all ids are generated client-side, so nothing in the sequence
// depends on a previous statement's result.

/**
 * @returns {{ id: string, statement: unknown }} the new team id (usable before
 *   the statement is executed) and the unexecuted INSERT.
 */
export function buildCreateTeamStatement(db, { sessionId, sessionCourtId, kind }) {
  const id = crypto.randomUUID()
  const statement = db
    .prepare(`INSERT INTO teams (id, session_id, session_court_id, kind, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, sessionId, sessionCourtId ?? null, kind, new Date().toISOString())
  return { id, statement }
}

export function buildAddTeamMemberStatement(db, { teamId, sessionPlayerId }) {
  return db
    .prepare(`INSERT INTO team_members (id, team_id, session_player_id) VALUES (?, ?, ?)`)
    .bind(crypto.randomUUID(), teamId, sessionPlayerId)
}

/**
 * Swaps one member of a team for another. Scoped by team id AND the outgoing
 * player so it can never rewrite an unrelated roster row.
 */
export function buildReplaceTeamMemberStatement(db, { teamId, outgoingSessionPlayerId, incomingSessionPlayerId }) {
  return db
    .prepare(`UPDATE team_members SET session_player_id = ? WHERE team_id = ? AND session_player_id = ?`)
    .bind(incomingSessionPlayerId, teamId, outgoingSessionPlayerId)
}

/**
 * Unbinds every team currently attached to a court, so the binding lasts only
 * as long as the occupancy it represents.
 *
 * Without this, `teams.session_court_id` would be write-once and outlive the
 * assignment: a court that is released and later reassigned (which happens
 * constantly in open play) would still carry its old team, and a later release
 * of that court would match those old members against whatever assignment they
 * hold *now* — on a different court — sweeping them into the wrong release.
 * Clearing the binding as part of the release keeps at most one live team
 * binding per court at any moment.
 */
export function buildClearTeamCourtBindingStatement(db, sessionId, sessionCourtId) {
  return db
    .prepare(`UPDATE teams SET session_court_id = NULL WHERE session_court_id = ? AND session_id = ?`)
    .bind(sessionCourtId, sessionId)
}

/**
 * Whether ANY of the given teams is still bound to `sessionCourtId`.
 *
 * `teams.session_court_id` is the only representation of "this occupancy owns
 * this court": assignCourt sets it, and every release clears it via
 * buildClearTeamCourtBindingStatement. So asking "are THIS game's own two
 * teams still bound to the court the game was played on?" is exactly the
 * question "is this game still that court's current occupant?" — which is
 * what finishGame/abandonGame must answer before releasing the court, so a
 * stale finish/abandon can never release a court a LATER game has since been
 * assigned to.
 *
 * @param {string[]} teamIds
 * @returns {Promise<boolean>}
 */
export async function hasTeamBoundToCourt(db, sessionId, sessionCourtId, teamIds) {
  const ids = (teamIds || []).filter(Boolean)
  if (!ids.length || !sessionCourtId) return false

  const placeholders = ids.map(() => '?').join(', ')
  const row = await db
    .prepare(
      `SELECT 1 AS bound FROM teams
       WHERE session_id = ? AND session_court_id = ? AND id IN (${placeholders})
       LIMIT 1`,
    )
    .bind(sessionId, sessionCourtId, ...ids)
    .first()

  return Boolean(row)
}

export async function getTeamWithMembers(db, teamId) {
  const team = await db
    .prepare(`SELECT id, session_id, session_court_id, kind, created_at FROM teams WHERE id = ?`)
    .bind(teamId)
    .first()
  if (!team) return null

  const members = await db
    .prepare(
      `SELECT tm.session_player_id, sp.player_id, p.display_name
       FROM team_members tm
       JOIN session_players sp ON sp.id = tm.session_player_id
       JOIN players p ON p.id = sp.player_id
       WHERE tm.team_id = ?`,
    )
    .bind(teamId)
    .all()

  return {
    id: team.id,
    sessionId: team.session_id,
    sessionCourtId: team.session_court_id,
    kind: team.kind,
    createdAt: team.created_at,
    members: (members.results || []).map((row) => ({
      sessionPlayerId: row.session_player_id,
      playerId: row.player_id,
      displayName: row.display_name,
    })),
  }
}

// Both teams currently bound to a court, each with its full member roster —
// the same lookup startGame's inline SQL already does (SessionCoordinatorDO.ts),
// extracted here so a read-only route can serve it without duplicating the
// query. Returns 0, 1, or 2 teams depending on the court's actual state; a
// normally ASSIGNED/PLAYING court has exactly 2.
export async function listTeamsForCourt(db, sessionId, sessionCourtId) {
  const result = await db
    .prepare(`SELECT id FROM teams WHERE session_court_id = ? AND session_id = ?`)
    .bind(sessionCourtId, sessionId)
    .all()
  const teamIds = (result.results || []).map((row) => row.id)
  const teams = await Promise.all(teamIds.map((id) => getTeamWithMembers(db, id)))
  return teams.filter(Boolean)
}

// NOTE: "active" here means only "most recently created team containing this
// player" — it does NOT prove the player is currently seated on a court.
// Callers that act on a live assignment (SessionCoordinatorDO) must
// additionally verify the player holds an open ASSIGNED/PLAYING queue entry
// and that the returned team's sessionCourtId matches the court in question.
export async function getActiveTeamForSessionPlayer(db, sessionId, sessionPlayerId) {
  const row = await db
    .prepare(
      `SELECT t.id FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       WHERE t.session_id = ? AND tm.session_player_id = ?
       ORDER BY t.created_at DESC LIMIT 1`,
    )
    .bind(sessionId, sessionPlayerId)
    .first()
  if (!row) return null
  return getTeamWithMembers(db, row.id)
}

/**
 * Session players currently occupying one specific court: members of a team
 * bound to that court who still hold an open assignment. DISTINCT because a
 * player could appear on more than one team row for the court.
 *
 * Matches ASSIGNED *and* PLAYING, the same definition of "open assignment" as
 * `hasOpenAssignment`. Nothing writes PLAYING until Phase 4's game engine, but
 * matching only ASSIGNED would then silently regress: releaseCourt would return
 * an empty list and flip the court to AVAILABLE while its players sat stuck in
 * PLAYING with no queue entry.
 *
 * This is only correct because releaseCourt clears the court binding of every
 * team it releases (see buildClearTeamCourtBindingStatement) — otherwise a team
 * from a previous occupancy of this same court would still match here, and its
 * members' *current* assignments on some other court would be swept into this
 * court's release.
 */
export async function listAssignedSessionPlayerIdsForCourt(db, sessionId, sessionCourtId) {
  const result = await db
    .prepare(
      `SELECT DISTINCT tm.session_player_id
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       JOIN queue_entries qe ON qe.session_player_id = tm.session_player_id AND qe.session_id = t.session_id
       WHERE t.session_court_id = ? AND t.session_id = ? AND qe.status IN ('ASSIGNED', 'PLAYING')`,
    )
    .bind(sessionCourtId, sessionId)
    .all()

  return (result.results || []).map((row) => row.session_player_id)
}
