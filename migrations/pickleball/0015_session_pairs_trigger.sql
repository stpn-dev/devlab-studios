-- The one-ACTIVE-pair-per-player trigger, split out of 0012 and formatted so
-- that `wrangler d1 migrations apply --remote` can actually apply it.
--
-- THE RULE THIS FILE EXISTS TO OBEY: in a migration, a semicolon must never be
-- the last thing on a line except at the very end of a statement. Keep an
-- inner terminator on the same line as what follows it, as `); END;` does
-- below. That is not style. It is the difference between this migration
-- applying and failing.
--
-- Why. Wrangler builds one string per migration -- the file, then its own
-- `INSERT INTO d1_migrations` bookkeeping row -- and for the remote path
-- posts that string to D1 unsplit, so D1 splits it server side. That splitter
-- breaks a statement at a semicolon followed by a newline. SQLite grammar
-- requires at least one semicolon inside a trigger body, so a conventionally
-- formatted trigger gets cut in half and the API answers
-- `incomplete input: SQLITE_ERROR`, having applied nothing.
--
-- Established by bisection against a scratch D1 database, not by reading:
-- the same trigger on a single line applied fine, and reformatting the body
-- so its inner terminator is followed by a space rather than a newline made
-- the readable multi-line version apply too. Three earlier guesses were each
-- disproved on the way -- wrangler own splitter (it splits this correctly),
-- D1 rejecting triggers outright (it does not), and apostrophes in comments
-- (removing them changed nothing).
--
-- Two consequences worth keeping in mind:
--   * Any future migration containing a trigger, or any other compound
--     BEGIN ... END body, needs the same treatment.
--   * Avoid ending a COMMENT line with a semicolon in a migration for the
--     same reason.
--
-- `IF NOT EXISTS` matters beyond habit: every database that ran the original
-- 0012 already has this trigger, so this migration is a no-op there while
-- still creating it on any database that only saw the corrected 0012.
--
-- See 0012 own header for WHY a trigger rather than a unique index: the
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
  ); END;
