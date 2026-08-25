-- Pickleball Phase 3: queueing and team formation for Open Play. No
-- organization_id on any of these tables — tenancy is scoped transitively
-- through session_id -> pickleball_sessions.organization_id, checked at
-- the API layer (see plan's Global Constraints).

CREATE TABLE IF NOT EXISTS queue_entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  session_player_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'ASSIGNED', 'PLAYING')),
  queued_at TEXT NOT NULL,
  assigned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (session_player_id) REFERENCES session_players(id) ON DELETE CASCADE
);

-- A session_player may have at most one OPEN queue entry (QUEUED, ASSIGNED,
-- or PLAYING are all "open") — enforced at the application layer inside
-- the DO's serialized command handlers, not a DB constraint, since "open"
-- spans three status values and SQLite CHECK constraints can't reference
-- other rows. This index supports the lookup that enforcement relies on.
CREATE INDEX IF NOT EXISTS idx_queue_entries_session_player ON queue_entries(session_player_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_entries_session_status ON queue_entries(session_id, status);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'AD_HOC' CHECK (kind IN ('AD_HOC', 'FIXED_PAIR')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_teams_session ON teams(session_id);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  session_player_id TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (session_player_id) REFERENCES session_players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_session_player ON team_members(session_player_id);
