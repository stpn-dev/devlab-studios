-- Phase 5: aggregated OPI snapshots, fully rebuildable from
-- player_game_stats (see src/worker/repositories/pickleball/
-- playerPerformanceSnapshots.js's recompute function). Two rows per player
-- who has at least one eligible finished game: one ALL_TIME row (scope_id =
-- the literal 'ALL_TIME', not NULL -- see this plan's Ruling on why NULL
-- can't enforce uniqueness here) and one SESSION row per session they've
-- played an eligible game in (scope_id = that session's id).

CREATE TABLE IF NOT EXISTS player_performance_snapshots (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('SESSION', 'ALL_TIME')),
  scope_id TEXT NOT NULL,
  opi_version TEXT NOT NULL DEFAULT 'OPI_V1_SCORE_SHARE',
  eligible_games_count INTEGER NOT NULL,
  performance_sum REAL NOT NULL,
  opi REAL NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_performance_snapshots_player_scope
  ON player_performance_snapshots(player_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_player_performance_snapshots_scope_opi
  ON player_performance_snapshots(scope_type, scope_id, opi DESC);
