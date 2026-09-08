-- The one-ACTIVE-pair-per-player trigger, split out of 0012 so it is the
-- ONLY statement in its migration.
--
-- Not cosmetic. Applying 0012 with the trigger inline failed against D1's
-- remote HTTP API with `incomplete input: SQLITE_ERROR`, on production and
-- reproduced on preview. wrangler's own splitter handles the trigger
-- correctly (verified by running its splitter over the file), and D1
-- accepts the identical CREATE TRIGGER when it is sent on its own -- so the
-- failure comes from the trigger travelling alongside other statements, and
-- something in that submission path re-splitting on the `;` inside
-- BEGIN ... END. A trigger body must contain at least one `;` per SQLite's
-- grammar, so the body cannot be rewritten to avoid it; isolating the
-- statement is the fix.
--
-- `IF NOT EXISTS` matters here beyond habit: every local dev database
-- already has this trigger from the original 0012, so this migration must
-- be a no-op there while still creating it on any database that only ever
-- saw the corrected 0012.
--
-- See 0012's own header for WHY a trigger rather than a unique index: the
-- invariant spans both columns of both rows being compared, which no
-- same-column partial index can express.

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
