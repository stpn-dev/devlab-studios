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
