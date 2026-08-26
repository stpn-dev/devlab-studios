import { nowIso } from '../../utils/responses.js'

const ALL_TIME_SCOPE_ID = 'ALL_TIME'

function toSnapshot(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    displayName: row.display_name ?? null,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    opiVersion: row.opi_version,
    eligibleGamesCount: row.eligible_games_count,
    performanceSum: row.performance_sum,
    opi: row.opi,
    updatedAt: row.updated_at,
  }
}

// PHASE 5 SEAM (now filled): mirrors matchmakingHistory.js's
// recomputeMatchmakingHistoryStatements pattern exactly, including its
// ordering requirement -- the caller MUST place these statements AFTER
// whatever player_game_stats-changing statements are earlier in the SAME
// db.batch() call, so D1 evaluates each aggregate at batch-execution time
// against the just-applied state, not the pre-batch state. Delete-then-
// insert-from-aggregate (never an incremental +/-) is what makes this safe
// against BOTH directions of invalidation -- reopenGame's delete of
// player_game_stats rows, and finishGame's re-finish insert of new ones --
// without ever "applying corrected statistics on top of the old statistics"
// (spec §7.3): there are no old statistics left to layer onto once the
// delete has run earlier in the same batch. `HAVING COUNT(*) > 0` means a
// player left with zero eligible games after an invalidation simply gets no
// row at all, rather than a bogus zero-division snapshot.
export function buildRecomputePlayerSnapshotsStatements(db, playerIds, sessionId) {
  if (!playerIds.length) return []
  const timestamp = nowIso()
  const statements = []

  for (const playerId of playerIds) {
    statements.push(
      db.prepare(`DELETE FROM player_performance_snapshots WHERE player_id = ? AND scope_type = 'ALL_TIME'`).bind(playerId),
    )
    statements.push(
      db
        .prepare(
          `INSERT INTO player_performance_snapshots
             (id, player_id, scope_type, scope_id, opi_version, eligible_games_count, performance_sum, opi, updated_at)
           SELECT lower(hex(randomblob(16))), ?, 'ALL_TIME', ?, 'OPI_V1_SCORE_SHARE', COUNT(*), SUM(game_performance), SUM(game_performance) / COUNT(*), ?
           FROM player_game_stats
           WHERE player_id = ? AND eligible_for_opi = 1
           HAVING COUNT(*) > 0`,
        )
        .bind(playerId, ALL_TIME_SCOPE_ID, timestamp, playerId),
    )

    statements.push(
      db
        .prepare(`DELETE FROM player_performance_snapshots WHERE player_id = ? AND scope_type = 'SESSION' AND scope_id = ?`)
        .bind(playerId, sessionId),
    )
    statements.push(
      db
        .prepare(
          `INSERT INTO player_performance_snapshots
             (id, player_id, scope_type, scope_id, opi_version, eligible_games_count, performance_sum, opi, updated_at)
           SELECT lower(hex(randomblob(16))), ?, 'SESSION', ?, 'OPI_V1_SCORE_SHARE', COUNT(*), SUM(pgs.game_performance), SUM(pgs.game_performance) / COUNT(*), ?
           FROM player_game_stats pgs
           JOIN games g ON g.id = pgs.game_id
           WHERE pgs.player_id = ? AND pgs.eligible_for_opi = 1 AND g.session_id = ?
           HAVING COUNT(*) > 0`,
        )
        .bind(playerId, sessionId, timestamp, playerId, sessionId),
    )
  }

  return statements
}

export async function getPlayerSnapshot(db, playerId, scopeType, scopeId) {
  const resolvedScopeId = scopeType === 'ALL_TIME' ? ALL_TIME_SCOPE_ID : scopeId
  const row = await db
    .prepare(`SELECT * FROM player_performance_snapshots WHERE player_id = ? AND scope_type = ? AND scope_id = ?`)
    .bind(playerId, scopeType, resolvedScopeId)
    .first()
  return row ? toSnapshot(row) : null
}

export async function listLeaderboard(db, organizationId, scopeType, scopeId, minGames) {
  const resolvedScopeId = scopeType === 'ALL_TIME' ? ALL_TIME_SCOPE_ID : scopeId
  const result = await db
    .prepare(
      `SELECT s.*, p.display_name
       FROM player_performance_snapshots s
       JOIN players p ON p.id = s.player_id
       WHERE p.organization_id = ? AND s.scope_type = ? AND s.scope_id = ? AND s.eligible_games_count >= ?
       ORDER BY s.opi DESC, p.display_name ASC`,
    )
    .bind(organizationId, scopeType, resolvedScopeId, minGames)
    .all()
  return (result.results || []).map(toSnapshot)
}
