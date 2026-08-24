-- Pickleball Phase 2: attendance. Registration, attendance, and
-- availability are three independent columns on purpose — see
-- docs/superpowers/specs/2026-08-24-devlab-pickleball-design.md §4.5.
-- No organization_id column here: tenancy is scoped transitively through
-- session_id -> pickleball_sessions.organization_id, checked at the API
-- layer (same pattern Phase 1's final review required elsewhere).

CREATE TABLE IF NOT EXISTS session_players (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  registration_status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (registration_status IN ('REGISTERED', 'CANCELLED')),
  attendance_status TEXT NOT NULL DEFAULT 'NOT_CHECKED_IN' CHECK (attendance_status IN ('NOT_CHECKED_IN', 'CHECKED_IN', 'LEFT_SESSION')),
  availability_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (availability_status IN ('AVAILABLE', 'TEMPORARILY_UNAVAILABLE', 'RESTING')),
  checked_in_at TEXT,
  games_played INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_players_session_player ON session_players(session_id, player_id);
CREATE INDEX IF NOT EXISTS idx_session_players_session_attendance ON session_players(session_id, attendance_status);
