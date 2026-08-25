-- Phase 3 Task 6 review fix (Critical): link a team to the court it occupies.
--
-- Without this column, `teams` could only be scoped by session, so
-- SessionCoordinatorDO.releaseCourt() had to find "players to release" via a
-- session-wide `queue_entries.status = 'ASSIGNED'` subquery. With two courts
-- simultaneously ASSIGNED in one session, releasing court 1 also closed and
-- requeued court 2's players while court 2's own `session_courts.status`
-- stayed ASSIGNED — a phantom assignment holding players who were no longer
-- really seated anywhere.
--
-- ON DELETE SET NULL rather than CASCADE: a team is a historical record of who
-- played together and must survive the removal of the court row it occupied
-- (Phase 4's game/scoring records will reference these teams).

ALTER TABLE teams ADD COLUMN session_court_id TEXT REFERENCES session_courts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teams_session_court ON teams(session_court_id);
