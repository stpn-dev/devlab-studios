export async function createTeam(db, { sessionId, kind }) {
  const id = crypto.randomUUID()
  await db
    .prepare(`INSERT INTO teams (id, session_id, kind, created_at) VALUES (?, ?, ?, ?)`)
    .bind(id, sessionId, kind, new Date().toISOString())
    .run()
  return { id, sessionId, kind }
}

export async function addTeamMember(db, { teamId, sessionPlayerId }) {
  const id = crypto.randomUUID()
  await db
    .prepare(`INSERT INTO team_members (id, team_id, session_player_id) VALUES (?, ?, ?)`)
    .bind(id, teamId, sessionPlayerId)
    .run()
}

export async function getTeamWithMembers(db, teamId) {
  const team = await db.prepare(`SELECT id, session_id, kind, created_at FROM teams WHERE id = ?`).bind(teamId).first()
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
    kind: team.kind,
    createdAt: team.created_at,
    members: (members.results || []).map((row) => ({
      sessionPlayerId: row.session_player_id,
      playerId: row.player_id,
      displayName: row.display_name,
    })),
  }
}

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
