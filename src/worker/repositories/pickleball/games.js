import { nowIso } from '../../utils/responses.js'

function toGame(row) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionCourtId: row.session_court_id,
    scoringRulesetId: row.scoring_ruleset_id,
    format: row.format,
    status: row.status,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    revision: row.revision,
    scoreA: row.score_a,
    scoreB: row.score_b,
    servingTeam: row.serving_team,
    serverNumber: row.server_number,
    teamAStartingServerSessionPlayerId: row.team_a_starting_server_session_player_id,
    teamBStartingServerSessionPlayerId: row.team_b_starting_server_session_player_id,
    teamACurrentServerSessionPlayerId: row.team_a_current_server_session_player_id,
    teamBCurrentServerSessionPlayerId: row.team_b_current_server_session_player_id,
    correctionPending: Boolean(row.correction_pending),
    winningTeamId: row.winning_team_id,
    finalScoreA: row.final_score_a,
    finalScoreB: row.final_score_b,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const GAME_COLUMNS = `id, session_id, session_court_id, scoring_ruleset_id, format, status, team_a_id, team_b_id,
  revision, score_a, score_b, serving_team, server_number,
  team_a_starting_server_session_player_id, team_b_starting_server_session_player_id,
  team_a_current_server_session_player_id, team_b_current_server_session_player_id,
  correction_pending,
  winning_team_id, final_score_a, final_score_b,
  started_at, finished_at, created_at, updated_at`

export function buildCreateGameStatement(db, {
  id, sessionId, sessionCourtId, scoringRulesetId, format, teamAId, teamBId, servingTeam,
  teamAStartingServerSessionPlayerId, teamBStartingServerSessionPlayerId, timestamp,
}) {
  return db
    .prepare(
      `INSERT INTO games (
        id, session_id, session_court_id, scoring_ruleset_id, format, status, team_a_id, team_b_id,
        revision, score_a, score_b, serving_team, server_number,
        team_a_starting_server_session_player_id, team_b_starting_server_session_player_id,
        team_a_current_server_session_player_id, team_b_current_server_session_player_id,
        started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, 1, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, sessionId, sessionCourtId, scoringRulesetId, format, teamAId, teamBId, servingTeam,
      format === 'DOUBLES' ? 2 : 1,
      teamAStartingServerSessionPlayerId, teamBStartingServerSessionPlayerId,
      teamAStartingServerSessionPlayerId, teamBStartingServerSessionPlayerId,
      timestamp, timestamp, timestamp,
    )
}

export function buildUpdateServerIdentityStatement(db, gameId, { teamACurrentServerSessionPlayerId, teamBCurrentServerSessionPlayerId }) {
  return db
    .prepare(`UPDATE games SET team_a_current_server_session_player_id = ?, team_b_current_server_session_player_id = ? WHERE id = ?`)
    .bind(teamACurrentServerSessionPlayerId, teamBCurrentServerSessionPlayerId, gameId)
}

export async function getGame(db, sessionId, gameId) {
  const row = await db
    .prepare(`SELECT ${GAME_COLUMNS} FROM games WHERE session_id = ? AND id = ?`)
    .bind(sessionId, gameId)
    .first()
  return toGame(row)
}

// TRUSTED-INTERNAL ONLY -- no session_id filter. Mirrors sessions.js's
// getSessionById: safe only because SessionCoordinatorDO's every caller has
// already resolved gameId through the session-scoped route layer above it.
export async function getGameById(db, gameId) {
  const row = await db.prepare(`SELECT ${GAME_COLUMNS} FROM games WHERE id = ?`).bind(gameId).first()
  return toGame(row)
}

export function buildUpdateGameProjectionStatement(db, gameId, { scoreA, scoreB, servingTeam, serverNumber, status, winningTeamId, finalScoreA, finalScoreB, revision }) {
  return db
    .prepare(
      `UPDATE games SET score_a = ?, score_b = ?, serving_team = ?, server_number = ?, status = ?,
        winning_team_id = ?, final_score_a = ?, final_score_b = ?, revision = ?, updated_at = ?,
        finished_at = CASE WHEN ? = 'FINISHED' THEN ? ELSE finished_at END
       WHERE id = ?`,
    )
    .bind(
      scoreA, scoreB, servingTeam, serverNumber, status, winningTeamId ?? null, finalScoreA ?? null, finalScoreB ?? null,
      revision, nowIso(), status, nowIso(), gameId,
    )
}

export async function listGamesForSession(db, sessionId) {
  const result = await db
    .prepare(`SELECT ${GAME_COLUMNS} FROM games WHERE session_id = ? ORDER BY started_at DESC`)
    .bind(sessionId)
    .all()
  return (result.results || []).map(toGame)
}
