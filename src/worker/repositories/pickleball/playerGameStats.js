import { nowIso } from '../../utils/responses.js'

export function buildCreatePlayerGameStatStatement(db, { gameId, playerId, pointsFor, pointsAgainst, gamePerformance, isWin, eligibleForOpi }) {
  return db
    .prepare(
      `INSERT INTO player_game_stats (id, game_id, player_id, points_for, points_against, game_performance, is_win, eligible_for_opi, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), gameId, playerId, pointsFor, pointsAgainst, gamePerformance, isWin ? 1 : 0, eligibleForOpi ? 1 : 0, nowIso())
}

// PHASE 5 SEAM: once player_performance_snapshots exists, invalidating a
// finalized game's stats must also subtract this game's contribution from
// each participant's snapshot before this delete runs -- see spec §7.3's
// invalidateAndRecompute and this plan's Ruling 3. Not yet possible: those
// tables don't exist until Phase 5.
export function buildDeletePlayerGameStatsForGameStatement(db, gameId) {
  return db.prepare(`DELETE FROM player_game_stats WHERE game_id = ?`).bind(gameId)
}
