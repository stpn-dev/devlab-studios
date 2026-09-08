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
| `0011_platform_pilot.sql` | Platform admin & self-serve pilot orgs: `users.is_platform_admin`; `organizations.status`, `.max_admins`, `.max_facilitators`, `.max_scorekeepers`; and the new `organization_invites` table. |
| `0012_session_pairs.sql` | Fixed pairs (spec Part B): the new `session_pairs` table, a `BEFORE INSERT` trigger enforcing one `ACTIVE` pair per session player, and `queue_entries.session_pair_id`. |
| `0013_teams_session_pair.sql` | Fixed pairs statistics fix: `teams.session_pair_id`, recording which pair a team actually was at the moment it was seated. |
| `0014_tournaments.sql` | Phase C1: `pickleball_sessions.tournament_format` and `.bracket_locked_at`, plus `tournament_entrants` and `tournament_fixtures`. |

## Tables

### Identity & RBAC (§3)

#### `organizations`

*Created in `0001_foundation.sql`; `status`, `max_admins`, `max_facilitators`,
`max_scorekeepers` added by `0011_platform_pilot.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `slug` | TEXT | NOT NULL, UNIQUE |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL, DEFAULT `'ACTIVE'`, CHECK (`status` IN (`'ACTIVE'`, `'SUSPENDED'`)) — added by `0011`; a platform admin suspending an org 403s every org-scoped request against it (`requirePickleballSession`) and blocks its public spectator route |
| `max_admins` | INTEGER | added by `0011`; nullable seat cap for the ADMIN role. NULL means unlimited |
| `max_facilitators` | INTEGER | added by `0011`; nullable seat cap for the SESSION_FACILITATOR role. NULL means unlimited |
| `max_scorekeepers` | INTEGER | added by `0011`; nullable seat cap for the SCOREKEEPER role. NULL means unlimited |

Indexes: none beyond the PK and the `slug` UNIQUE constraint.

#### `users`

*Created in `0001_foundation.sql`; `is_platform_admin` added by
`0011_platform_pilot.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `google_sub` | TEXT | NOT NULL, UNIQUE |
| `email` | TEXT | NOT NULL |
| `name` | TEXT | NOT NULL |
| `avatar_url` | TEXT | |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `is_platform_admin` | INTEGER | NOT NULL, DEFAULT `0`, CHECK (`is_platform_admin` IN (`0`, `1`)) — added by `0011`; grants cross-org access to the `platform/` API surface. No API sets this flag by design (spec Decision 1) — see the runbook's "Platform admin" section for the one-time SQL promotion. |

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

#### `organization_invites`

*Created in `0011_platform_pilot.sql`.* A platform admin's invitation for a
pilot organization to self-serve create itself; distinct from
`organization_memberships`, which invites a person INTO an org that already
exists. `organization_id` is nullable because the row is created before any
organization exists — it's populated once the invitee accepts and creates
their org.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `token` | TEXT | NOT NULL, UNIQUE |
| `invited_email` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL, DEFAULT `'PENDING'`, CHECK (`status` IN (`'PENDING'`, `'ACCEPTED'`, `'EXPIRED'`, `'REVOKED'`)) |
| `max_admins` | INTEGER | nullable seat cap carried onto the organization created from this invite |
| `max_facilitators` | INTEGER | nullable seat cap carried onto the organization created from this invite |
| `max_scorekeepers` | INTEGER | nullable seat cap carried onto the organization created from this invite |
| `created_by_user_id` | TEXT | NOT NULL, FOREIGN KEY → `users(id)` |
| `organization_id` | TEXT | FOREIGN KEY → `organizations(id)` ON DELETE SET NULL (nullable — NULL until the invite is accepted and its organization is created) |
| `created_at` | TEXT | NOT NULL |
| `expires_at` | TEXT | NOT NULL |
| `accepted_at` | TEXT | |

Indexes:
- `idx_organization_invites_email` on `(invited_email)`

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

*Created in `0001_foundation.sql`; `tournament_format` and
`bracket_locked_at` added by `0014_tournaments.sql`.*

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
| `tournament_format` | TEXT | added by `0014`; nullable, CHECK (`tournament_format` IN (`'ROUND_ROBIN'`, `'SINGLE_ELIMINATION'`, `'POOL_TO_BRACKET'`, `'DOUBLE_ELIMINATION'`)) — NULL means an ordinary `FIXED_PAIRS` session with no tournament. **A tournament is not a third `session_type`**: it is a `FIXED_PAIRS` session with this column set. See "Schema constraint: CHECK clauses cannot be widened" in `architecture.md` for why — in short, `session_type`'s CHECK cannot grow another value without a table rebuild, and rebuilding `pickleball_sessions` is unsafe on D1 (nine foreign keys reference it; the rebuild's `ON DELETE CASCADE` would delete all of them, and `PRAGMA foreign_keys=OFF` is a no-op inside D1's single-transaction migration batch). Only `ROUND_ROBIN` ships in C1; the other three values are accepted by the CHECK now so C2–C4 need no further column-level migration, but nothing in this codebase generates their fixtures yet. |
| `bracket_locked_at` | TEXT | added by `0014`; NULL until the operator locks the bracket (fixtures generated, seeds frozen). Regenerating a bracket after lock is out of scope for C1 — the column is a one-way gate, not a re-lockable flag. |

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

#### `session_pairs`

*Created in `0012_session_pairs.sql`.* Fixed pairs (spec Part B): in a
`FIXED_PAIRS` session the queue's unit of work is a pair, not a player. A
`session_pair` is deliberately **not** the same thing as a `team`: a team is
per-game and per-court (`SessionCoordinatorDO.releaseCourt` clears its
`session_court_id` the moment the court is released — see `0005`'s header),
while a pair persists across every game for the whole session. Conflating the
two would resurrect the stale-binding bug `0005` documents.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `session_player_a_id` | TEXT | NOT NULL, FOREIGN KEY → `session_players(id)` ON DELETE CASCADE |
| `session_player_b_id` | TEXT | NOT NULL, FOREIGN KEY → `session_players(id)` ON DELETE CASCADE, CHECK (`session_player_a_id != session_player_b_id`) |
| `status` | TEXT | NOT NULL, DEFAULT `'ACTIVE'`, CHECK (`status` IN (`'ACTIVE'`, `'DISSOLVED'`)) |
| `games_played` | INTEGER | NOT NULL, DEFAULT `0` — the pair's own count, distinct from either member's `session_players.games_played` |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_session_pairs_session_status` on `(session_id, status)`
- A `BEFORE INSERT` trigger, `trg_session_pairs_one_active_pair_per_player`,
  enforces "a session player belongs to at most one `ACTIVE` pair per
  session" across **both** columns of every existing row. A same-column
  partial unique index cannot express that invariant — see the migration's
  own fix-round-1 comment for why the first version of this file shipped two
  such indexes and each one silently missed half the cases.

`queue_entries` gains a nullable `session_pair_id` rather than `session_pairs`
growing its own queue-membership columns — see that column's entry under
`queue_entries` below for why a queued pair produces two rows, not one.

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
- `idx_queue_entries_session_pair` on `(session_pair_id)` — added by `0012`

`session_pair_id` (nullable, added by `0012_session_pairs.sql`, FOREIGN KEY →
`session_pairs(id)` ON DELETE CASCADE): **a queued fixed pair inserts two
`queue_entries` rows — one per member — sharing one `session_pair_id` and one
`queued_at`, rather than one row for the pair.** This is deliberate, not an
oversight: `session_player_id` stays `NOT NULL` and migration 0006's "at most
one open entry per session_player" partial unique index keeps working
unmodified, because every row — pair or not — still has exactly one
`session_player_id` of its own. A single pair-level row would have needed a
nullable `session_player_id` or a junction table, both of which would have
touched every existing `OPEN_PLAY` query. The queue engine instead groups the
two rows by `session_pair_id` wherever it needs to treat them as one entrant
(`listEligiblePairs`, the queue-page grouping into one `PairRow`).

#### `teams`

*Created in `0004_queue_and_teams.sql`; `session_court_id` added by
`0005_teams_session_court.sql`; `session_pair_id` added by
`0013_teams_session_pair.sql`.*

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `kind` | TEXT | NOT NULL, DEFAULT `'AD_HOC'`, CHECK (`kind` IN (`'AD_HOC'`, `'FIXED_PAIR'`)) |
| `created_at` | TEXT | NOT NULL |
| `session_court_id` | TEXT | FOREIGN KEY → `session_courts(id)` ON DELETE SET NULL (added `0005`; means "the court this team CURRENTLY occupies" — cleared to NULL when the court is released, not a historical field) |
| `session_pair_id` | TEXT | FOREIGN KEY → `session_pairs(id)` ON DELETE SET NULL (added `0013`; nullable — `NULL` for every `AD_HOC`/`OPEN_PLAY` team, which has no pair) |

Indexes:
- `idx_teams_session` on `(session_id)`
- `idx_teams_session_court` on `(session_court_id)` — added by `0005`
- `idx_teams_session_pair` on `(session_pair_id)` — added by `0013`

`teams.session_pair_id` records **which fixed pair a team actually was, at
the moment it was seated** — it is not derivable from "look up each member's
current pair" once anyone re-pairs. If player A dissolves from B and re-pairs
with C, a member's *current* active pair no longer identifies which pair
played an earlier, already-finished game: reopening and re-finishing that game
would credit the wrong pair (A+C, who never played it) instead of the right
one (A+B, who did). Two `session_pairs` rows can even share an identical
membership after a dissolve-and-reform, with no way to disambiguate them by
member set alone. Recording the pair directly on the team at creation time is
the only unambiguous answer, and it is what
`buildRecomputePairGamesPlayedStatement` and the fixed-pairs statistics path
join through — never a member's current pairing.

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

### Tournaments (Phase C1, §3)

A tournament does not introduce a fourth participant shape: its entrant is a
`session_pairs` row (see above), and the tournament itself is a `FIXED_PAIRS`
session with `pickleball_sessions.tournament_format` set. These two tables
add only what a bracket needs beyond an ordinary fixed-pairs session: who is
entered (with a seed and a withdraw state independent of the pair itself),
and the fixture list that entrant plays through.

#### `tournament_entrants`

*Created in `0014_tournaments.sql`.* An entrant is deliberately a separate
row from `session_pairs`, not a column on it: a pair can exist in a
`FIXED_PAIRS` session without ever being entered into its tournament, and
seeding/withdrawal are tournament concerns, not pair concerns. A pair can
have at most one entrant row (`idx_tournament_entrants_pair` is UNIQUE on
`session_pair_id`), and only ever in one tournament, because C1 does not
support a pair being entered in more than one tournament session
simultaneously.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `session_pair_id` | TEXT | NOT NULL, FOREIGN KEY → `session_pairs(id)` ON DELETE CASCADE |
| `seed` | INTEGER | nullable — assigned by `seedEntrants()` at generation time; only meaningful for formats that seed (bracket formats in C2+); round robin seeds only to order fixture generation deterministically |
| `status` | TEXT | NOT NULL, DEFAULT `'ACTIVE'`, CHECK (`status` IN (`'ACTIVE'`, `'WITHDRAWN'`)) |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_tournament_entrants_pair` UNIQUE on `(session_pair_id)`
- `idx_tournament_entrants_session` on `(session_id, status)`

#### `tournament_fixtures`

*Created in `0014_tournaments.sql`.* The whole fixture list is generated up
front as slots (by `generateFixtures()`), one row per match, and advancement
fills the slots that were not already known. For `ROUND_ROBIN` (the only
format C1 ships) both entrants of every fixture are known at generation time,
so `entrant_a_id`/`entrant_b_id` are populated immediately and
`source_a`/`source_b` stay NULL for every row this branch's UI can create.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `session_id` | TEXT | NOT NULL, FOREIGN KEY → `pickleball_sessions(id)` ON DELETE CASCADE |
| `bracket` | TEXT | NOT NULL, DEFAULT `'MAIN'`, CHECK (`bracket` IN (`'POOL'`, `'MAIN'`, `'LOSERS'`)) — round robin only ever writes `'MAIN'` |
| `pool_label` | TEXT | nullable; NULL for every format C1 ships, including `ROUND_ROBIN`. Reserved for `POOL_TO_BRACKET` (C3), where concurrent pools each need their own round/position numbering — see the fixture-slot indexes below for why this column being nullable is exactly the problem they exist to solve |
| `round_number` | INTEGER | NOT NULL |
| `position` | INTEGER | NOT NULL |
| `entrant_a_id` | TEXT | FOREIGN KEY → `tournament_entrants(id)` ON DELETE SET NULL (nullable) |
| `entrant_b_id` | TEXT | FOREIGN KEY → `tournament_entrants(id)` ON DELETE SET NULL (nullable) |
| `source_a` | TEXT | nullable; a tagged string — `WINNER_OF:<fixture_id>`, `LOSER_OF:<fixture_id>`, or `POOL_RANK:<pool>:<n>` — recording where this slot's entrant will come from before it exists. **Unused by every format C1 ships** (round robin knows both entrants at generation time); the column exists now, ahead of any consumer, so that C2's single-elimination bracket, C3's pool-to-bracket crossover, and C4's double-elimination losers bracket — all of which fill a fixture from a previous fixture's result rather than from the entrant list — need no schema migration when they land. Adding it later would mean another `ALTER TABLE` against a table that, by then, other fixtures already reference. |
| `source_b` | TEXT | nullable; same shape and same rationale as `source_a` |
| `game_id` | TEXT | FOREIGN KEY → `games(id)` ON DELETE SET NULL (nullable) — set once the fixture's game is created; a tournament fixture's game is an ordinary `games` row, scored by the same engine as any other game, so finishing it goes through the normal `FINISH_GAME` command (see `architecture.md` for how that command is told not to feed this game into OPI) |
| `winner_entrant_id` | TEXT | nullable; set once the fixture finishes |
| `status` | TEXT | NOT NULL, DEFAULT `'PENDING'`, CHECK (`status` IN (`'PENDING'`, `'READY'`, `'IN_PROGRESS'`, `'FINISHED'`, `'BYE'`)) |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes:
- `idx_tournament_fixtures_slot_nopool` UNIQUE on `(session_id, bracket, round_number, position)` WHERE `pool_label IS NULL`
- `idx_tournament_fixtures_slot_pool` UNIQUE on `(session_id, bracket, pool_label, round_number, position)` WHERE `pool_label IS NOT NULL`
- `idx_tournament_fixtures_status` on `(session_id, status)`
- `idx_tournament_fixtures_game` on `(game_id)`

**Why the slot-uniqueness constraint is two partial indexes, not one.** The
first version of this migration used a single composite UNIQUE index over
`(session_id, bracket, pool_label, round_number, position)`. SQLite treats
NULL as distinct from any other value — including another NULL — inside a
unique index, so two rows with the same `session_id`/`bracket`/`round_number`/
`position` and `pool_label IS NULL` were never seen as duplicates by that
index. Since `pool_label` is NULL for every format C1 ships (round robin
included), that single index enforced **nothing** for this branch's own
fixture generation. This was not a hypothetical read of the SQLite docs:
mutation testing flipped the uniqueness check, no test failed, and by the
time that was investigated real duplicate fixture rows for the same slot had
already been inserted against a dev database. The fix is the two indexes
above: one covering the "no pool" case with a `WHERE pool_label IS NULL`
partial index (equal NULLs excluded from the index's own comparison because
the row simply isn't indexed by it, so uniqueness is enforced by the other
three columns instead), and one covering the pool case where `pool_label` is
always non-NULL and therefore comparable normally.

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
