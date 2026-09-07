-- Records WHICH fixed pair a team was, at the moment it was seated.
--
-- Pair statistics previously resolved the pair to credit by looking up a
-- member's CURRENT active pair, while counting over the game's actual
-- teammates. Those are not the same thing the moment anyone re-pairs: if p1
-- dissolves from p2 and re-pairs with p3, reopening and re-finishing the old
-- p1+p2 game wrote that game's count onto the new p1+p3 pair, which never
-- played it. listEligiblePairs orders by games_played, so that corrupted the
-- fairness input, not just a displayed number.
--
-- A member-set lookup cannot fix it either: the same two people can form,
-- dissolve and re-form, leaving two session_pairs rows with identical
-- membership and no way to tell which one played. The only unambiguous
-- answer is to record the pair on the team when the team is created, which
-- is what this column does.
--
-- Nullable because AD_HOC teams (every OPEN_PLAY game) have no pair.
-- ON DELETE SET NULL rather than CASCADE: a team is a historical record of
-- who played, and must survive its pair row being removed.
ALTER TABLE teams ADD COLUMN session_pair_id TEXT REFERENCES session_pairs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teams_session_pair ON teams(session_pair_id);
