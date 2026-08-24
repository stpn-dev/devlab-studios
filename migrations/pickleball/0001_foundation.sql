-- Pickleball Phase 1: identity, tenancy, RBAC, and the core venue/court/
-- session entities every later phase builds on. Lives in its own D1
-- database (PICKLEBALL_DB) — never the CMS's `devlab-studios-cms` — see
-- docs/superpowers/specs/2026-08-24-devlab-pickleball-design.md §2.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Invite-only: an ADMIN creates a membership row for an email before that
-- person ever signs in. Sign-in only grants access if a matching ACTIVE
-- row exists for the authenticated Google account's email.
CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  invited_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SESSION_FACILITATOR', 'SCOREKEEPER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_org_email ON organization_memberships(organization_id, invited_email);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships(user_id);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  linked_user_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  public_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_players_org_active ON players(organization_id, active);
CREATE INDEX IF NOT EXISTS idx_players_org_normalized_name ON players(organization_id, normalized_name);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_venues_org ON venues(organization_id);

CREATE TABLE IF NOT EXISTS courts (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 999,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_courts_venue_sort ON courts(venue_id, sort_order);

CREATE TABLE IF NOT EXISTS scoring_rulesets (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  name TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  scoring_method TEXT NOT NULL DEFAULT 'SIDE_OUT' CHECK (scoring_method IN ('SIDE_OUT')),
  target_score INTEGER NOT NULL,
  win_by INTEGER NOT NULL DEFAULT 2,
  format TEXT NOT NULL CHECK (format IN ('SINGLES', 'DOUBLES')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rulesets_org_active ON scoring_rulesets(organization_id, active);

CREATE TABLE IF NOT EXISTS pickleball_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  venue_id TEXT NOT NULL,
  name TEXT NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('OPEN_PLAY', 'FIXED_PAIRS')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN_FOR_CHECKIN', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  scoring_ruleset_id TEXT NOT NULL,
  scheduled_start TEXT NOT NULL,
  scheduled_end TEXT NOT NULL,
  actual_start TEXT,
  actual_end TEXT,
  post_game_rotation_policy TEXT NOT NULL DEFAULT 'AUTO_REQUEUE_ALL' CHECK (post_game_rotation_policy IN ('AUTO_REQUEUE_ALL', 'MANUAL_REQUEUE')),
  leaderboard_min_games INTEGER NOT NULL DEFAULT 3,
  public_view_enabled INTEGER NOT NULL DEFAULT 1,
  public_leaderboard_enabled INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  FOREIGN KEY (scoring_ruleset_id) REFERENCES scoring_rulesets(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_org_status ON pickleball_sessions(organization_id, status);

CREATE TABLE IF NOT EXISTS session_courts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  court_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'WARMUP', 'PLAYING', 'FINISHING', 'OUT_OF_SERVICE')),
  current_game_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_courts_session_court ON session_courts(session_id, court_id);

CREATE TABLE IF NOT EXISTS public_session_tokens (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  public_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_public_tokens_session ON public_session_tokens(session_id);

CREATE TABLE IF NOT EXISTS session_operator_grants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  granted_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_grants_session_user ON session_operator_grants(session_id, user_id);
