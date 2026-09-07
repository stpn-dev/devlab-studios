-- Fixed pairs (spec Part B). A pair persists for the whole session, which is
-- what makes it distinct from `teams`: a team is per-game and per-court, and
-- SessionCoordinatorDO.releaseCourt clears its session_court_id the moment
-- the court is released (see 0005's header). Conflating the two would
-- resurrect exactly the stale-binding bug that migration documents.

CREATE TABLE IF NOT EXISTS session_pairs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  session_player_a_id TEXT NOT NULL,
  session_player_b_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISSOLVED')),
  games_played INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (session_player_a_id) REFERENCES session_players(id) ON DELETE CASCADE,
  FOREIGN KEY (session_player_b_id) REFERENCES session_players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_pairs_session_status ON session_pairs(session_id, status);

-- A session_player belongs to at most one ACTIVE pair. Two partial indexes
-- rather than one, because the member can sit in either column and SQLite
-- cannot express "either column is unique" in a single index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_pairs_member_a_active
  ON session_pairs(session_player_a_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_pairs_member_b_active
  ON session_pairs(session_player_b_id) WHERE status = 'ACTIVE';

-- A queued pair inserts TWO queue_entries rows, one per member, sharing this
-- id and one queued_at. Deliberate: it preserves session_player_id NOT NULL
-- and the existing "at most one open entry per session_player" rule (0006)
-- without modifying either. The queue engine groups rows by this column.
ALTER TABLE queue_entries ADD COLUMN session_pair_id TEXT REFERENCES session_pairs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_queue_entries_session_pair ON queue_entries(session_pair_id);
