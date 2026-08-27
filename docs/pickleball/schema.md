# Devlab Pickleball — Schema

All tables live in the `PICKLEBALL_DB` D1 database, entirely isolated from
the CMS's database. Migrations are numbered and applied in order from
`migrations/pickleball/`; never edit an applied migration, only add a new
numbered file.

## Migration files

| File | Adds |
|---|---|
| `0001_foundation.sql` | Identity, tenancy, and RBAC, plus the core venue/court/session entities every later phase builds on: `organizations`, `users`, `organization_memberships`, `players`, `venues`, `courts`, `scoring_rulesets`, `pickleball_sessions`, `session_courts`, `public_session_tokens`, `session_operator_grants`. |
| `0002_default_ruleset.sql` | Seeds one global (`organization_id` NULL) built-in `scoring_rulesets` row every new session can reference immediately. |
| `0003_session_players.sql` | Attendance: `session_players`, tracking registration, attendance, and availability as three independent columns. |
| `0004_queue_and_teams.sql` | Queueing and team formation for Open Play: `queue_entries`, `teams`, `team_members`. |
| `0005_teams_session_court.sql` | Phase 3 review fix: adds `teams.session_court_id`, linking a team to the court it currently occupies. |
| `0006_queue_entries_unique_open.sql` | Phase 3 final-review fix: a partial unique index enforcing at most one open (`QUEUED`/`ASSIGNED`/`PLAYING`) `queue_entries` row per session player. |
| `0007_games_and_scoring.sql` | Event-sourced game engine: `games`, `game_participants`, `score_events`, `idempotency_keys`, `matchmaking_history`, and `player_game_stats`. |
| `0008_phase4_hardening.sql` | Phase 4 hardening: serving-player-identity and correction-mode columns on `games`, plus a primary-key rebuild of `idempotency_keys` (scoped per game+command, not globally). |
| `0009_performance_snapshots.sql` | Phase 5: `player_performance_snapshots`, aggregated OPI snapshots fully rebuildable from `player_game_stats`. |
| `0010_audit_events.sql` | Phase 7: `audit_events`, an append-only accountability trail for admin-visible operator actions (role changes, game corrections/reopens). |

## Tables

### Identity & RBAC (§3)

#### `organizations`

*Created in `0001_foundation.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `slug` | TEXT | NOT NULL, UNIQUE |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes: none beyond the PK and the `slug` UNIQUE constraint.

#### `users`

*Created in `0001_foundation.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `google_sub` | TEXT | NOT NULL, UNIQUE |
| `email` | TEXT | NOT NULL |
| `name` | TEXT | NOT NULL |
| `avatar_url` | TEXT | |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_users_email` on `(email)`

#### `organization_memberships`

*Created in `0001_foundation.sql`.* Invite-only: an ADMIN creates a
membership row for an email before that person ever signs in; sign-in only
grants access if a matching `ACTIVE` row exists for the authenticated
Google account's email.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `organization_id` | TEXT | NOT NULL, FOREIGN KEY → `organizations(id)` ON DELETE CASCADE |
| `user_id` | TEXT | FOREIGN KEY → `users(id)` ON DELETE SET NULL |
| `invited_email` | TEXT | NOT NULL |
| `role` | TEXT | NOT NULL, CHECK (`role` IN (`'ADMIN'`, `'SESSION_FACILITATOR'`, `'SCOREKEEPER'`)) |
| `status` | TEXT | NOT NULL, DEFAULT `'ACTIVE'`, CHECK (`status` IN (`'ACTIVE'`, `'REVOKED'`)) |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_memberships_org_email` UNIQUE on `(organization_id, invited_email)`
- `idx_memberships_user` on `(user_id)`

#### `players`

*Created in `0001_foundation.sql`.* A session participant, not an
authenticated entity.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `organization_id` | TEXT | NOT NULL, FOREIGN KEY → `organizations(id)` ON DELETE CASCADE |
| `display_name` | TEXT | NOT NULL |
| `normalized_name` | TEXT | NOT NULL |
| `linked_user_id` | TEXT | FOREIGN KEY → `users(id)` ON DELETE SET NULL |
| `active` | INTEGER | NOT NULL, DEFAULT `1` |
| `public_visible` | INTEGER | NOT NULL, DEFAULT `1` |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_players_org_active` on `(organization_id, active)`
- `idx_players_org_normalized_name` on `(organization_id, normalized_name)`

### Core session/game domain (§4)

#### `venues`

*Created in `0001_foundation.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `organization_id` | TEXT | NOT NULL, FOREIGN KEY → `organizations(id)` ON DELETE CASCADE |
| `name` | TEXT | NOT NULL |
| `address` | TEXT | |
| `timezone` | TEXT | NOT NULL, DEFAULT `'UTC'` |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_venues_org` on `(organization_id)`

#### `courts`

*Created in `0001_foundation.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `venue_id` | TEXT | NOT NULL, FOREIGN KEY → `venues(id)` ON DELETE CASCADE |
| `organization_id` | TEXT | NOT NULL, FOREIGN KEY → `organizations(id)` ON DELETE CASCADE |
| `name` | TEXT | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, DEFAULT `999` |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_courts_venue_sort` on `(venue_id, sort_order)`

#### `scoring_rulesets`

*Created in `0001_foundation.sql`; seeded with one global default row by
`0002_default_ruleset.sql` (`id = 'usap-2026-sideout-11-doubles'`,
`organization_id` NULL).*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `organization_id` | TEXT | FOREIGN KEY → `organizations(id)` ON DELETE CASCADE (nullable — NULL means a global default ruleset) |
| `name` | TEXT | NOT NULL |
| `rules_version` | TEXT | NOT NULL |
| `scoring_method` | TEXT | NOT NULL, DEFAULT `'SIDE_OUT'`, CHECK (`scoring_method` IN (`'SIDE_OUT'`)) |
| `target_score` | INTEGER | NOT NULL |
| `win_by` | INTEGER | NOT NULL, DEFAULT `2` |
| `format` | TEXT | NOT NULL, CHECK (`format` IN (`'SINGLES'`, `'DOUBLES'`)) |
| `active` | INTEGER | NOT NULL, DEFAULT `1` |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_rulesets_org_active` on `(organization_id, active)`

#### `pickleball_sessions`

*Created in `0001_foundation.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `organization_id` | TEXT | NOT NULL, FOREIGN KEY → `organizations(id)` ON DELETE CASCADE |
| `venue_id` | TEXT | NOT NULL, FOREIGN KEY → `venues(id)` ON DELETE CASCADE |
| `name` | TEXT | NOT NULL |
| `session_type` | TEXT | NOT NULL, CHECK (`session_type` IN (`'OPEN_PLAY'`, `'FIXED_PAIRS'`)) |
| `status` | TEXT | NOT NULL, DEFAULT `'DRAFT'`, CHECK (`status` IN (`'DRAFT'`, `'OPEN_FOR_CHECKIN'`, `'LIVE'`, `'PAUSED'`, `'COMPLETED'`, `'CANCELLED'`)) |
| `scoring_ruleset_id` | TEXT | NOT NULL, FOREIGN KEY → `scoring_rulesets(id)` |
| `scheduled_start` | TEXT | NOT NULL |
| `scheduled_end` | TEXT | NOT NULL |
| `actual_start` | TEXT | |
| `actual_end` | TEXT | |
| `post_game_rotation_policy` | TEXT | NOT NULL, DEFAULT `'AUTO_REQUEUE_ALL'`, CHECK (`post_game_rotation_policy` IN (`'AUTO_REQUEUE_ALL'`, `'MANUAL_REQUEUE'`)) |
| `leaderboard_min_games` | INTEGER | NOT NULL, DEFAULT `3` |
| `public_view_enabled` | INTEGER | NOT NULL, DEFAULT `1` |
| `public_leaderboard_enabled` | INTEGER | NOT NULL, DEFAULT `1` |
| `created_by_user_id` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_sessions_org_status` on `(organization_id, status)`

#### `session_courts`

*Created in `0001_foundation.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `court_id` | TEXT | NOT NULL, FOREIGN KEY → `courts(id)` ON DELETE CASCADE |
| `enabled` | INTEGER | NOT NULL, DEFAULT `1` |
| `status` | TEXT | NOT NULL, DEFAULT `'AVAILABLE'`, CHECK (`status` IN (`'AVAILABLE'`, `'ASSIGNED'`, `'WARMUP'`, `'PLAYING'`, `'FINISHING'`, `'OUT_OF_SERVICE'`)) |
| `current_game_id` | TEXT | |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_session_courts_session_court` UNIQUE on `(session_id, court_id)`

#### `public_session_tokens`

*Created in `0001_foundation.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `public_code` | TEXT | NOT NULL, UNIQUE |
| `created_at` | TEXT | NOT NULL |
| `revoked_at` | TEXT | |

Indexes:
- `idx_public_tokens_session` on `(session_id)`

#### `session_operator_grants`

*Created in `0001_foundation.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `user_id` | TEXT | NOT NULL, FOREIGN KEY → `users(id)` ON DELETE CASCADE |
| `granted_by_user_id` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL |

Indexes:
- `idx_operator_grants_session_user` UNIQUE on `(session_id, user_id)`

#### `session_players`

*Created in `0003_session_players.sql`.* No `organization_id` column:
tenancy is scoped transitively through `session_id` →
`pickleball_sessions.organization_id`, checked at the API layer.
Registration, attendance, and availability are three independent columns
by design.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `player_id` | TEXT | NOT NULL, FOREIGN KEY → `players(id)` ON DELETE CASCADE |
| `registration_status` | TEXT | NOT NULL, DEFAULT `'REGISTERED'`, CHECK (`registration_status` IN (`'REGISTERED'`, `'CANCELLED'`)) |
| `attendance_status` | TEXT | NOT NULL, DEFAULT `'NOT_CHECKED_IN'`, CHECK (`attendance_status` IN (`'NOT_CHECKED_IN'`, `'CHECKED_IN'`, `'LEFT_SESSION'`)) |
| `availability_status` | TEXT | NOT NULL, DEFAULT `'AVAILABLE'`, CHECK (`availability_status` IN (`'AVAILABLE'`, `'TEMPORARILY_UNAVAILABLE'`, `'RESTING'`)) |
| `checked_in_at` | TEXT | |
| `games_played` | INTEGER | NOT NULL, DEFAULT `0` |
| `registered_at` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_session_players_session_player` UNIQUE on `(session_id, player_id)`
- `idx_session_players_session_attendance` on `(session_id, attendance_status)`

#### `queue_entries`

*Created in `0004_queue_and_teams.sql`; hardened by
`0006_queue_entries_unique_open.sql`.* No `organization_id` column;
tenancy scoped transitively through `session_id`.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `session_player_id` | TEXT | NOT NULL, FOREIGN KEY → `session_players(id)` ON DELETE CASCADE |
| `status` | TEXT | NOT NULL, DEFAULT `'QUEUED'`, CHECK (`status` IN (`'QUEUED'`, `'ASSIGNED'`, `'PLAYING'`)) |
| `queued_at` | TEXT | NOT NULL |
| `assigned_at` | TEXT | |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_queue_entries_session_player` on `(session_player_id, status)`
- `idx_queue_entries_session_status` on `(session_id, status)`
- `idx_queue_entries_one_open_per_player` UNIQUE on `(session_id, session_player_id)` WHERE `status IN ('QUEUED', 'ASSIGNED', 'PLAYING')` — added by `0006`; this partial index is the real enforcement of "at most one open queue entry per session player" (the `0004` comment claiming application-layer-only enforcement was incorrect for the direct `joinQueue` path, which never goes through the serializing DO)

#### `teams`

*Created in `0004_queue_and_teams.sql`; `session_court_id` added by
`0005_teams_session_court.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `kind` | TEXT | NOT NULL, DEFAULT `'AD_HOC'`, CHECK (`kind` IN (`'AD_HOC'`, `'FIXED_PAIR'`)) |
| `created_at` | TEXT | NOT NULL |
| `session_court_id` | TEXT | FOREIGN KEY → `session_courts(id)` ON DELETE SET NULL (added `0005`; means "the court this team CURRENTLY occupies" — cleared to NULL when the court is released, not a historical field) |

Indexes:
- `idx_teams_session` on `(session_id)`
- `idx_teams_session_court` on `(session_court_id)` — added by `0005`

#### `team_members`

*Created in `0004_queue_and_teams.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `team_id` | TEXT | NOT NULL, FOREIGN KEY → `teams(id)` ON DELETE CASCADE |
| `session_player_id` | TEXT | NOT NULL, FOREIGN KEY → `session_players(id)` ON DELETE CASCADE |

Indexes:
- `idx_team_members_team` on `(team_id)`
- `idx_team_members_session_player` on `(session_player_id)`

#### `games`

*Created in `0007_games_and_scoring.sql`; five columns added by
`0008_phase4_hardening.sql`.* Carries four score/serving columns beyond the
finished-game record to hold the live `GameState` projection — a
materialized projection kept in sync for fast reads, distinct from
`final_score_a`/`final_score_b` (frozen only once `FINISHED`).

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `session_court_id` | TEXT | NOT NULL, FOREIGN KEY → `session_courts(id)` ON DELETE CASCADE |
| `scoring_ruleset_id` | TEXT | NOT NULL, FOREIGN KEY → `scoring_rulesets(id)` |
| `format` | TEXT | NOT NULL, CHECK (`format` IN (`'SINGLES'`, `'DOUBLES'`)) |
| `status` | TEXT | NOT NULL, DEFAULT `'IN_PROGRESS'`, CHECK (`status` IN (`'SCHEDULED'`, `'IN_PROGRESS'`, `'FINISHED'`, `'ABANDONED'`, `'CANCELLED'`)) |
| `team_a_id` | TEXT | NOT NULL, FOREIGN KEY → `teams(id)` |
| `team_b_id` | TEXT | NOT NULL, FOREIGN KEY → `teams(id)` |
| `revision` | INTEGER | NOT NULL, DEFAULT `0` |
| `score_a` | INTEGER | NOT NULL, DEFAULT `0` |
| `score_b` | INTEGER | NOT NULL, DEFAULT `0` |
| `serving_team` | TEXT | NOT NULL, CHECK (`serving_team` IN (`'A'`, `'B'`)) |
| `server_number` | INTEGER | NOT NULL, DEFAULT `2`, CHECK (`server_number` IN (`1`, `2`)) |
| `winning_team_id` | TEXT | |
| `final_score_a` | INTEGER | |
| `final_score_b` | INTEGER | |
| `started_at` | TEXT | NOT NULL |
| `finished_at` | TEXT | |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `team_a_starting_server_session_player_id` | TEXT | added by `0008` |
| `team_b_starting_server_session_player_id` | TEXT | added by `0008` |
| `team_a_current_server_session_player_id` | TEXT | added by `0008` |
| `team_b_current_server_session_player_id` | TEXT | added by `0008` |
| `correction_pending` | INTEGER | NOT NULL, DEFAULT `0` — added by `0008` |

Indexes:
- `idx_games_session_status` on `(session_id, status)`
- `idx_games_session_court` on `(session_court_id)`

#### `game_participants`

*Created in `0007_games_and_scoring.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `game_id` | TEXT | NOT NULL, FOREIGN KEY → `games(id)` ON DELETE CASCADE |
| `session_player_id` | TEXT | NOT NULL, FOREIGN KEY → `session_players(id)` ON DELETE CASCADE |
| `team_id` | TEXT | NOT NULL, FOREIGN KEY → `teams(id)` ON DELETE CASCADE |

Indexes:
- `idx_game_participants_game` on `(game_id)`
- `idx_game_participants_session_player` on `(session_player_id)`

#### `score_events`

*Created in `0007_games_and_scoring.sql`.* Append-only event log; the
game-engine analog of `audit_events` for in-game scoring.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `game_id` | TEXT | NOT NULL, FOREIGN KEY → `games(id)` ON DELETE CASCADE |
| `sequence` | INTEGER | NOT NULL |
| `event_type` | TEXT | NOT NULL, CHECK (`event_type` IN (`'GAME_STARTED'`, `'POINT_AWARDED'`, `'POINT_REVERSED'`, `'SERVE_CHANGED'`, `'SIDE_OUT'`, `'SCORE_CORRECTED'`, `'GAME_FINISHED'`, `'GAME_REOPENED'`, `'GAME_ABANDONED'`)) |
| `actor_user_id` | TEXT | NOT NULL |
| `payload_json` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL |

Indexes:
- `idx_score_events_game_sequence` UNIQUE on `(game_id, sequence)`

#### `idempotency_keys`

*Created in `0007_games_and_scoring.sql`; rebuilt in
`0008_phase4_hardening.sql` (rename-recreate-copy-drop, since SQLite
`ALTER TABLE` cannot change a PRIMARY KEY in place). The original `0007`
schema (`key TEXT PRIMARY KEY`, globally unique across every game and
command) is superseded — this is the schema as it exists today, scoped per
game + command.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `game_id` | TEXT | NOT NULL, FOREIGN KEY → `games(id)` ON DELETE CASCADE |
| `command_type` | TEXT | NOT NULL, CHECK (`command_type` IN (`'RECORD_RALLY'`, `'UNDO_LAST_RALLY'`, `'FINISH_GAME'`, `'ABANDON_GAME'`, `'REOPEN_GAME'`, `'CORRECT_GAME'`)) |
| `key` | TEXT | NOT NULL |
| `result_json` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL |

Indexes:
- `idx_idempotency_keys_game_command_key` UNIQUE on `(game_id, command_type, key)`

#### `matchmaking_history`

*Created in `0007_games_and_scoring.sql`.* Repeat-avoidance input for the
queue engine's court-assignment tiebreak.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `player_id` | TEXT | NOT NULL, FOREIGN KEY → `players(id)` ON DELETE CASCADE |
| `other_player_id` | TEXT | NOT NULL, FOREIGN KEY → `players(id)` ON DELETE CASCADE |
| `relation` | TEXT | NOT NULL, CHECK (`relation` IN (`'PARTNER'`, `'OPPONENT'`)) |
| `pairing_count` | INTEGER | NOT NULL, DEFAULT `1` |
| `last_game_at` | TEXT | NOT NULL |

Indexes:
- `idx_matchmaking_history_pair` UNIQUE on `(session_id, player_id, other_player_id, relation)`

### Statistics (§4.8)

#### `player_game_stats`

*Created in `0007_games_and_scoring.sql`.* Per-player, per-game OPI input,
rebuildable from the `score_events` log via `rebuildGameProjection`.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `game_id` | TEXT | NOT NULL, FOREIGN KEY → `games(id)` ON DELETE CASCADE |
| `player_id` | TEXT | NOT NULL, FOREIGN KEY → `players(id)` ON DELETE CASCADE |
| `points_for` | INTEGER | NOT NULL |
| `points_against` | INTEGER | NOT NULL |
| `game_performance` | REAL | NOT NULL |
| `is_win` | INTEGER | NOT NULL |
| `eligible_for_opi` | INTEGER | NOT NULL |
| `created_at` | TEXT | NOT NULL |

Indexes:
- `idx_player_game_stats_game_player` UNIQUE on `(game_id, player_id)`
- `idx_player_game_stats_player` on `(player_id)`

#### `player_performance_snapshots`

*Created in `0009_performance_snapshots.sql`.* Aggregated OPI snapshots,
fully rebuildable from `player_game_stats`; see `opi-methodology.md` for
why `scope_id` is always a non-NULL string (including the literal
`'ALL_TIME'`) rather than NULL.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `player_id` | TEXT | NOT NULL, FOREIGN KEY → `players(id)` ON DELETE CASCADE |
| `scope_type` | TEXT | NOT NULL, CHECK (`scope_type` IN (`'SESSION'`, `'ALL_TIME'`)) |
| `scope_id` | TEXT | NOT NULL |
| `opi_version` | TEXT | NOT NULL, DEFAULT `'OPI_V1_SCORE_SHARE'` |
| `eligible_games_count` | INTEGER | NOT NULL |
| `performance_sum` | REAL | NOT NULL |
| `opi` | REAL | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_player_performance_snapshots_player_scope` UNIQUE on `(player_id, scope_type, scope_id)`
- `idx_player_performance_snapshots_scope_opi` on `(scope_type, scope_id, opi DESC)`

### Audit (§4.9)

#### `audit_events`

*Created in `0010_audit_events.sql`.* Append-only accountability trail for
admin-visible operator actions. Deliberately not wired into every mutating
command in the system — covers operator/role changes and game
corrections/reopens, the two areas the design spec's permission matrix
(§3.4) and edge-case table (§57 #20-21) single out as
accountability-sensitive. Other domains already have their own append-only
trail (`score_events` for in-game scoring).

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `organization_id` | TEXT | NOT NULL, FOREIGN KEY → `organizations(id)` ON DELETE CASCADE |
| `session_id` | TEXT | |
| `actor_user_id` | TEXT | NOT NULL, FOREIGN KEY → `users(id)` ON DELETE CASCADE |
| `action` | TEXT | NOT NULL |
| `entity_type` | TEXT | NOT NULL |
| `entity_id` | TEXT | NOT NULL |
| `previous_state_json` | TEXT | |
| `new_state_json` | TEXT | |
| `metadata_json` | TEXT | |
| `created_at` | TEXT | NOT NULL |

Indexes:
- `idx_audit_events_org_created` on `(organization_id, created_at DESC)`
- `idx_audit_events_entity` on `(entity_type, entity_id)`
