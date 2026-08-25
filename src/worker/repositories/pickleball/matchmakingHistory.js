import { nowIso } from '../../utils/responses.js'

export function buildUpsertMatchmakingStatement(db, { sessionId, playerId, otherPlayerId, relation, timestamp }) {
  return db
    .prepare(
      `INSERT INTO matchmaking_history (id, session_id, player_id, other_player_id, relation, pairing_count, last_game_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(session_id, player_id, other_player_id, relation) DO UPDATE SET
         pairing_count = pairing_count + 1,
         last_game_at = excluded.last_game_at`,
    )
    .bind(crypto.randomUUID(), sessionId, playerId, otherPlayerId, relation, timestamp)
}

// Full session-scoped rebuild (Ruling 11): delete everything for this
// session, then re-derive every partner/opponent pair from every currently
// FINISHED game, processed oldest-finished-first so last_game_at naturally
// ends up correct (each upsert overwrites it with the latest timestamp
// processed) with no special-casing for "was the corrected game the most
// recent one." Returns an array of UNEXECUTED statements for the caller to
// fold into its own db.batch() -- this function only READS before building
// them, it does not execute anything itself.
export async function recomputeMatchmakingHistoryStatements(db, sessionId) {
  const deleteStatement = db.prepare(`DELETE FROM matchmaking_history WHERE session_id = ?`).bind(sessionId)

  const gamesResult = await db
    .prepare(`SELECT id, team_a_id, team_b_id, finished_at FROM games WHERE session_id = ? AND status = 'FINISHED' ORDER BY finished_at ASC`)
    .bind(sessionId)
    .all()
  const games = gamesResult.results || []

  const upsertStatements = []
  for (const game of games) {
    const participantsResult = await db
      .prepare(
        `SELECT gp.team_id, sp.player_id FROM game_participants gp
         JOIN session_players sp ON sp.id = gp.session_player_id
         WHERE gp.game_id = ?`,
      )
      .bind(game.id)
      .all()
    const participants = participantsResult.results || []
    const teamAPlayers = participants.filter((p) => p.team_id === game.team_a_id).map((p) => p.player_id)
    const teamBPlayers = participants.filter((p) => p.team_id === game.team_b_id).map((p) => p.player_id)
    const timestamp = game.finished_at || nowIso()

    for (const players of [teamAPlayers, teamBPlayers]) {
      for (let i = 0; i < players.length; i += 1) {
        for (let j = i + 1; j < players.length; j += 1) {
          upsertStatements.push(
            buildUpsertMatchmakingStatement(db, { sessionId, playerId: players[i], otherPlayerId: players[j], relation: 'PARTNER', timestamp }),
            buildUpsertMatchmakingStatement(db, { sessionId, playerId: players[j], otherPlayerId: players[i], relation: 'PARTNER', timestamp }),
          )
        }
      }
    }
    for (const playerA of teamAPlayers) {
      for (const playerB of teamBPlayers) {
        upsertStatements.push(
          buildUpsertMatchmakingStatement(db, { sessionId, playerId: playerA, otherPlayerId: playerB, relation: 'OPPONENT', timestamp }),
          buildUpsertMatchmakingStatement(db, { sessionId, playerId: playerB, otherPlayerId: playerA, relation: 'OPPONENT', timestamp }),
        )
      }
    }
  }

  return [deleteStatement, ...upsertStatements]
}
