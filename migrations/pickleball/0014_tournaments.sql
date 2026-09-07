-- A tournament is a FIXED_PAIRS session carrying a format, NOT a third
-- session_type. session_type's CHECK cannot be widened: SQLite has no
-- ALTER ... CHECK, and the standard table rebuild is unsafe on D1 -- dropping
-- the old parent silently deletes every dependent row through ON DELETE
-- CASCADE, and PRAGMA foreign_keys=OFF does not help because SQLite treats it
-- as a no-op inside a transaction and D1 wraps migration batches in one.
-- Measured, not assumed. See docs/pickleball/architecture.md.
--
-- ADD COLUMN with a column-level CHECK does work on D1 (verified: NULL
-- accepted, bad value rejected). NULL means an ordinary fixed-pairs session.
ALTER TABLE pickleball_sessions ADD COLUMN tournament_format TEXT
  CHECK (tournament_format IN ('ROUND_ROBIN', 'SINGLE_ELIMINATION', 'POOL_TO_BRACKET', 'DOUBLE_ELIMINATION'));

-- Locked once the bracket is generated. Seeds are frozen from then on;
-- regenerating mid-tournament is explicitly out of scope (spec §3.2).
ALTER TABLE pickleball_sessions ADD COLUMN bracket_locked_at TEXT;

-- An entrant is a session_pairs row in a tournament. Kept separate from
-- session_pairs so a pair can exist without being entered, and so seed and
-- withdrawal are tournament concerns rather than pair concerns.
CREATE TABLE IF NOT EXISTS tournament_entrants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  session_pair_id TEXT NOT NULL,
  seed INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'WITHDRAWN')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (session_pair_id) REFERENCES session_pairs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_entrants_pair ON tournament_entrants(session_pair_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entrants_session ON tournament_entrants(session_id, status);

-- The whole fixture list is generated up front as slots; advancement fills
-- them. source_a/source_b carry a tagged string (WINNER_OF:<id>,
-- LOSER_OF:<id>, POOL_RANK:<pool>:<n>) so a fixture knows where its entrants
-- come from before they exist. Round robin never uses them -- both entrants
-- are known at generation -- but the column exists now so the elimination
-- formats in C2-C4 need no migration.
CREATE TABLE IF NOT EXISTS tournament_fixtures (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  bracket TEXT NOT NULL DEFAULT 'MAIN' CHECK (bracket IN ('POOL', 'MAIN', 'LOSERS')),
  pool_label TEXT,
  round_number INTEGER NOT NULL,
  position INTEGER NOT NULL,
  entrant_a_id TEXT,
  entrant_b_id TEXT,
  source_a TEXT,
  source_b TEXT,
  game_id TEXT,
  winner_entrant_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'READY', 'IN_PROGRESS', 'FINISHED', 'BYE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (entrant_a_id) REFERENCES tournament_entrants(id) ON DELETE SET NULL,
  FOREIGN KEY (entrant_b_id) REFERENCES tournament_entrants(id) ON DELETE SET NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL
);

-- pool_label is part of the key, not decoration. POOL_TO_BRACKET (C3) runs
-- several pools concurrently and each numbers its own rounds and positions
-- from the start, so without it two pools' round-1/position-0 fixtures would
-- collide on this index. Included now, while this migration is still local to
-- an unmerged branch, rather than costing a second migration in C3 -- the
-- same "make the constraint wide enough up front" lesson this file's own
-- header records about CHECK clauses.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_fixtures_slot
  ON tournament_fixtures(session_id, bracket, pool_label, round_number, position);
CREATE INDEX IF NOT EXISTS idx_tournament_fixtures_status ON tournament_fixtures(session_id, status);
CREATE INDEX IF NOT EXISTS idx_tournament_fixtures_game ON tournament_fixtures(game_id);
