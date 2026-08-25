-- Pickleball Phase 4 hardening pass. Additive except the idempotency_keys
-- rebuild below, which is a genuine primary-key correction (see the plan's
-- Ruling 6) done via the standard SQLite rename/recreate/copy/drop sequence
-- since ALTER TABLE cannot change a PRIMARY KEY in place. migrations 0001-0007
-- are NOT touched.

-- Serving-player identity (Ruling 1) and the correction-mode flag (Ruling 2).
-- All five are nullable/defaulted so every existing row (there should be
-- none yet in any real environment, but this is safe regardless) remains
-- valid without a backfill.
ALTER TABLE games ADD COLUMN team_a_starting_server_session_player_id TEXT;
ALTER TABLE games ADD COLUMN team_b_starting_server_session_player_id TEXT;
ALTER TABLE games ADD COLUMN team_a_current_server_session_player_id TEXT;
ALTER TABLE games ADD COLUMN team_b_current_server_session_player_id TEXT;
ALTER TABLE games ADD COLUMN correction_pending INTEGER NOT NULL DEFAULT 0;

-- idempotency_keys rebuild: `key` alone was globally unique across every
-- game and every command, which defeats the purpose of an idempotency key
-- scoped to one command on one game (see Ruling 6).
ALTER TABLE idempotency_keys RENAME TO idempotency_keys_old;

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'RECORD_RALLY', 'UNDO_LAST_RALLY', 'FINISH_GAME', 'ABANDON_GAME', 'REOPEN_GAME', 'CORRECT_GAME'
  )),
  key TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_game_command_key ON idempotency_keys(game_id, command_type, key);

-- Preserve any existing rows (expected: none in practice, since no command
-- used this table before this migration) under a placeholder command_type
-- the CHECK constraint above must therefore also accept.
INSERT INTO idempotency_keys (id, game_id, command_type, key, result_json, created_at)
  SELECT lower(hex(randomblob(16))), game_id, 'RECORD_RALLY', key, result_json, created_at
  FROM idempotency_keys_old;

DROP TABLE idempotency_keys_old;
