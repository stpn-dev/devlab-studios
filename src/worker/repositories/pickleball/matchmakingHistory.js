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
// FINISHED game. Returns UNEXECUTED statements for the caller to fold into
// its own db.batch() -- it executes nothing itself.
//
// WHY THIS IS PURE SQL AND NOT A JS LOOP OVER A PRE-FETCHED READ:
// every caller folds these statements into the SAME db.batch() as the very
// status transition being recomputed against (reopenGame's
// FINISHED -> IN_PROGRESS, finishGame's re-finish back to FINISHED). A live
// JS `SELECT ... WHERE status = 'FINISHED'` issued here would run BEFORE that
// batch commits, so it would see the PRE-transition state and rebuild against
// exactly the wrong world: reopen would re-insert the pairs it is supposed to
// remove, and the later re-finish would omit the pairs it is supposed to
// restore -- compounding, not cancelling, and leaving matchmaking_history
// permanently wrong with no rebuild path. Expressing the whole derivation as
// SQL makes D1 evaluate `status = 'FINISHED'` at BATCH-EXECUTION time,
// i.e. after the earlier statements in the same batch have applied. This is
// the same ordering-hazard fix `buildRecomputeGamesPlayedStatement`
// (sessionPlayers.js) already uses for games_played, and it carries the same
// requirement: the caller MUST place these statements AFTER the status
// transition in its batch array.
//
// The self-join pairs every participant of a FINISHED game with every OTHER
// participant of that same game, in BOTH directions (the join is not
// order-restricted), labelling each pair PARTNER when both sit on the same
// team_id and OPPONENT otherwise -- which also handles singles for free,
// where each team has one member so no PARTNER pair can arise. `pairing_count`
// is the number of finished games the pair shared and `last_game_at` the
// latest of those games' finish timestamps, matching what the previous
// incremental upsert loop converged to. `id` is generated SQL-side
// (`randomblob`) rather than as a crypto.randomUUID() per row, because the
// row set is not known until execution time; matchmaking_history.id is an
// opaque TEXT key that nothing joins on.
export function recomputeMatchmakingHistoryStatements(db, sessionId) {
  const deleteStatement = db.prepare(`DELETE FROM matchmaking_history WHERE session_id = ?`).bind(sessionId)

  // Only reached for a FINISHED game with a NULL finished_at, which
  // buildUpdateGameProjectionStatement never produces -- kept because
  // last_game_at is NOT NULL and the previous implementation had the same
  // `game.finished_at || nowIso()` fallback.
  const fallbackTimestamp = nowIso()

  const insertStatement = db
    .prepare(
      `INSERT INTO matchmaking_history (id, session_id, player_id, other_player_id, relation, pairing_count, last_game_at)
       SELECT lower(hex(randomblob(16))), ?, pair.player_id, pair.other_player_id, pair.relation,
              COUNT(*), MAX(pair.game_at)
       FROM (
         SELECT sp_self.player_id AS player_id,
                sp_other.player_id AS other_player_id,
                CASE WHEN gp_self.team_id = gp_other.team_id THEN 'PARTNER' ELSE 'OPPONENT' END AS relation,
                COALESCE(g.finished_at, ?) AS game_at
         FROM games g
         JOIN game_participants gp_self ON gp_self.game_id = g.id
         JOIN game_participants gp_other ON gp_other.game_id = g.id
           AND gp_other.session_player_id <> gp_self.session_player_id
         JOIN session_players sp_self ON sp_self.id = gp_self.session_player_id
         JOIN session_players sp_other ON sp_other.id = gp_other.session_player_id
         WHERE g.session_id = ? AND g.status = 'FINISHED'
       ) AS pair
       GROUP BY pair.player_id, pair.other_player_id, pair.relation`,
    )
    .bind(sessionId, fallbackTimestamp, sessionId)

  return [deleteStatement, insertStatement]
}
