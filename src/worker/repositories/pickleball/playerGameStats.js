import { nowIso } from '../../utils/responses.js'

export function buildCreatePlayerGameStatStatement(db, { gameId, playerId, pointsFor, pointsAgainst, gamePerformance, isWin, eligibleForOpi }) {
  return db
    .prepare(
      `INSERT INTO player_game_stats (id, game_id, player_id, points_for, points_against, game_performance, is_win, eligible_for_opi, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), gameId, playerId, pointsFor, pointsAgainst, gamePerformance, isWin ? 1 : 0, eligibleForOpi ? 1 : 0, nowIso())
}

// PHASE 5 SEAM (now filled): player_performance_snapshots exists now, and
// invalidation does NOT subtract this game's contribution incrementally --
// see playerPerformanceSnapshots.js's buildRecomputePlayerSnapshotsStatements,
// which every caller of this delete (reopenGame, finishGame's re-finish path)
// runs immediately afterward in the SAME batch. It deletes and re-derives each
// affected player's snapshot wholesale from their current player_game_stats
// rows, which is what actually satisfies spec §7.3's "never apply corrected
// statistics on top of the old statistics" -- there's no old snapshot value
// left to subtract from once this delete has run.
export function buildDeletePlayerGameStatsForGameStatement(db, gameId) {
  return db.prepare(`DELETE FROM player_game_stats WHERE game_id = ?`).bind(gameId)
}
