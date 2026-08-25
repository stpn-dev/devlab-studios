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
-- played together and must survive the removal of the court row it occupied.
--
-- NOTE (Phase 3 final-review correction): the comment originally here
-- described session_court_id as staying set for the life of the team, for
-- Phase 4's game/scoring records to reference later. That is not what
-- shipped. As established by Task 6's fix rounds, session_court_id means
-- "the court this team CURRENTLY occupies" -- SessionCoordinatorDO.
-- releaseCourt clears it to NULL (buildClearTeamCourtBindingStatement) as
-- soon as the court is released, specifically so a stale binding can't let a
-- later release of the same court sweep in a team that has since moved (or
-- been reassigned) elsewhere. A released team's column is NULL, not its last
-- court -- any future "which court did this team play on" feature needs its
-- own historical field, not this one.

ALTER TABLE teams ADD COLUMN session_court_id TEXT REFERENCES session_courts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teams_session_court ON teams(session_court_id);
