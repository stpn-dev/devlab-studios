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
  CHECK (session_player_a_id != session_player_b_id),
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (session_player_a_id) REFERENCES session_players(id) ON DELETE CASCADE,
  FOREIGN KEY (session_player_b_id) REFERENCES session_players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_pairs_session_status ON session_pairs(session_id, status);

-- Fix-round-1 correction: a session_player belongs to at most one ACTIVE
-- pair, but that invariant spans BOTH columns of BOTH rows being compared --
-- "is this new member already the A or B of some other ACTIVE pair" -- which
-- a same-column partial unique index cannot express. The original version of
-- this migration shipped two partial unique indexes (one per column), each
-- of which only deduplicates within its own column: inserting player X as
-- session_player_a_id of one pair and then as session_player_b_id of another
-- passed both indexes with no collision, silently violating the very
-- invariant they were meant to enforce. Caught in review before this
-- migration reached anything but a local dev DB on this unmerged branch, so
-- it is corrected here in place rather than patched in a 0013 (D1 has no
-- ALTER TABLE ADD CHECK, so a 0013 fixing this would force a full table
-- rebuild anyway, for a table that has never held real data anywhere).
--
-- A BEFORE INSERT trigger is the only mechanism that can compare the new
-- row's two member ids against every existing ACTIVE pair's two columns at
-- once. It only guards INSERT because nothing in this codebase ever
-- transitions a pair from DISSOLVED back to ACTIVE (dissolvePair is a
-- one-way ACTIVE -> DISSOLVED UPDATE; there is no reactivate path) -- if that
-- ever changes, this trigger must grow an equivalent BEFORE UPDATE OF status
-- clause.
--
-- The RAISE message deliberately starts with "UNIQUE constraint failed" so
-- sessionPairs.js's isPairConflictViolation() string match catches it --
-- that helper was later broadened beyond this trigger's message to also
-- match "CHECK constraint failed" (the table's own
-- session_player_a_id != session_player_b_id CHECK, a distinct message
-- shape), so createPair() still returns null instead of throwing for either
-- violation, exactly as if a real unique index had fired.
CREATE TRIGGER IF NOT EXISTS trg_session_pairs_one_active_pair_per_player
BEFORE INSERT ON session_pairs
WHEN NEW.status = 'ACTIVE'
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE constraint failed: session_pairs active member')
  WHERE EXISTS (
    SELECT 1 FROM session_pairs
    WHERE session_id = NEW.session_id
      AND status = 'ACTIVE'
      AND (session_player_a_id IN (NEW.session_player_a_id, NEW.session_player_b_id)
        OR session_player_b_id IN (NEW.session_player_a_id, NEW.session_player_b_id))
  );
END;

-- A queued pair inserts TWO queue_entries rows, one per member, sharing this
-- id and one queued_at. Deliberate: it preserves session_player_id NOT NULL
-- and the existing "at most one open entry per session_player" rule (0006)
-- without modifying either. The queue engine groups rows by this column.
ALTER TABLE queue_entries ADD COLUMN session_pair_id TEXT REFERENCES session_pairs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_queue_entries_session_pair ON queue_entries(session_pair_id);
