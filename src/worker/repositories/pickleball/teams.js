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

export async function createTeam(db, { sessionId, sessionCourtId, kind }) {
  const { id, statement } = buildCreateTeamStatement(db, { sessionId, sessionCourtId, kind })
  await statement.run()
  return { id, sessionId, sessionCourtId: sessionCourtId ?? null, kind }
}

export function buildAddTeamMemberStatement(db, { teamId, sessionPlayerId }) {
  return db
    .prepare(`INSERT INTO team_members (id, team_id, session_player_id) VALUES (?, ?, ?)`)
    .bind(crypto.randomUUID(), teamId, sessionPlayerId)
}

export async function addTeamMember(db, { teamId, sessionPlayerId }) {
  await buildAddTeamMemberStatement(db, { teamId, sessionPlayerId }).run()
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
 * bound to that court who still hold an open ASSIGNED queue entry. DISTINCT
 * because a player could appear on more than one historical team for the court.
 */
export async function listAssignedSessionPlayerIdsForCourt(db, sessionCourtId) {
  const result = await db
    .prepare(
      `SELECT DISTINCT tm.session_player_id
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       JOIN queue_entries qe ON qe.session_player_id = tm.session_player_id AND qe.session_id = t.session_id
       WHERE t.session_court_id = ? AND qe.status = 'ASSIGNED'`,
    )
    .bind(sessionCourtId)
    .all()

  return (result.results || []).map((row) => row.session_player_id)
}
