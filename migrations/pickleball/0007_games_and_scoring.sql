-- Pickleball Phase 4: event-sourced game engine.
--
-- `games` carries four columns beyond the design spec's literal enumeration
-- (score_a, score_b, serving_team, server_number) to hold the LIVE GameState
-- projection -- the spec's own text says games is "a materialized projection
-- kept in sync... for fast reads," which requires somewhere to put the live
-- score distinct from final_score_a/final_score_b (frozen only once
-- FINISHED). See the plan's Ruling 7.
--
-- score_events.event_type includes GAME_ABANDONED, which the design spec's
-- enumeration omitted despite requiring an explicit abandon action (edge
-- case #18) -- see the plan's Ruling 2. This migration is authored fresh, so
-- completing the enum here is additive, not an edit to an applied migration.

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  session_court_id TEXT NOT NULL,
  scoring_ruleset_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('SINGLES', 'DOUBLES')),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'ABANDONED', 'CANCELLED')),
  team_a_id TEXT NOT NULL,
  team_b_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  serving_team TEXT NOT NULL CHECK (serving_team IN ('A', 'B')),
  server_number INTEGER NOT NULL DEFAULT 2 CHECK (server_number IN (1, 2)),
  winning_team_id TEXT,
  final_score_a INTEGER,
  final_score_b INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (session_court_id) REFERENCES session_courts(id) ON DELETE CASCADE,
  FOREIGN KEY (scoring_ruleset_id) REFERENCES scoring_rulesets(id),
  FOREIGN KEY (team_a_id) REFERENCES teams(id),
  FOREIGN KEY (team_b_id) REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_games_session_status ON games(session_id, status);
CREATE INDEX IF NOT EXISTS idx_games_session_court ON games(session_court_id);

CREATE TABLE IF NOT EXISTS game_participants (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  session_player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (session_player_id) REFERENCES session_players(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_game_participants_game ON game_participants(game_id);
CREATE INDEX IF NOT EXISTS idx_game_participants_session_player ON game_participants(session_player_id);

CREATE TABLE IF NOT EXISTS score_events (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'GAME_STARTED', 'POINT_AWARDED', 'POINT_REVERSED', 'SERVE_CHANGED',
    'SIDE_OUT', 'SCORE_CORRECTED', 'GAME_FINISHED', 'GAME_REOPENED', 'GAME_ABANDONED'
  )),
  actor_user_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_score_events_game_sequence ON score_events(game_id, sequence);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matchmaking_history (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  other_player_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('PARTNER', 'OPPONENT')),
  pairing_count INTEGER NOT NULL DEFAULT 1,
  last_game_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES pickleball_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (other_player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matchmaking_history_pair
  ON matchmaking_history(session_id, player_id, other_player_id, relation);

CREATE TABLE IF NOT EXISTS player_game_stats (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  points_for INTEGER NOT NULL,
  points_against INTEGER NOT NULL,
  game_performance REAL NOT NULL,
  is_win INTEGER NOT NULL,
  eligible_for_opi INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_game_stats_game_player ON player_game_stats(game_id, player_id);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player ON player_game_stats(player_id);
