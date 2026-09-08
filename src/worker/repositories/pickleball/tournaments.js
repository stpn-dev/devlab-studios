// Tournament repository (spec Part C1, migration 0014_tournaments.sql).
//
// A tournament is NOT a third session_type -- it is a FIXED_PAIRS session
// carrying a `tournament_format` (see 0014's header). This file owns the
// three tables/columns that model it: tournament_entrants (a session_pair
// entered into the bracket), tournament_fixtures (the generated match slots),
// and pickleball_sessions.bracket_locked_at (the freeze marker).
//
// Follows sessionPairs.js's idiom throughout: a `toX` row mapper per shape,
// db.prepare().bind() for single statements, `buildXStatement` builders for
// anything a caller (SessionCoordinatorDO.lockBracket) batches together.

import { nowIso } from '../../utils/responses.js'

function toEntrant(row) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionPairId: row.session_pair_id,
    seed: row.seed,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// True when an INSERT into tournament_entrants failed because
// idx_tournament_entrants_pair (migration 0014) already has a row for this
// session_pair_id -- "this pair is already entered", a domain error, not a
// 500. Same string-match approach as sessionPairs.js's
// isPairConflictViolation: D1 doesn't expose a typed error code for a unique
// violation.
function isEntrantConflictViolation(error) {
  const message = String((error && error.message) || error || '')
  return message.includes('UNIQUE constraint failed')
}

/**
 * Returns the new entrant, or null if this session_pair is already entered
 * (idx_tournament_entrants_pair). Always attempts the INSERT and translates
 * the violation into null rather than letting it throw -- callers treat null
 * as a domain error (409), exactly as sessionPairs.js's createPair does for
 * session_pairs.
 */
export async function enterPair(db, { sessionId, sessionPairId }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  try {
    await db
      .prepare(
        `INSERT INTO tournament_entrants (id, session_id, session_pair_id, seed, status, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'ACTIVE', ?, ?)`,
      )
      .bind(id, sessionId, sessionPairId, timestamp, timestamp)
      .run()
  } catch (error) {
    if (isEntrantConflictViolation(error)) return null
    throw error
  }

  return getEntrant(db, sessionId, id)
}

export async function getEntrant(db, sessionId, entrantId) {
  const row = await db
    .prepare(`SELECT * FROM tournament_entrants WHERE id = ? AND session_id = ?`)
    .bind(entrantId, sessionId)
    .first()
  return toEntrant(row)
}

/**
 * True when `sessionPairId` is a currently-ACTIVE tournament entrant.
 *
 * The guard `dissolvePair`/`leaveSession` consult (alongside
 * `hasOpenAssignmentForPair`, queueEntries.js's "single predicate every
 * pair-mutating command consults") once a bracket is locked: entrants are
 * frozen at lock (spec §3.2) and this phase has no bracket-advancement or
 * withdrawal path, so a pair that is still an active entrant of a LOCKED
 * bracket must never be dissolved -- doing so would leave finished/in-flight
 * fixtures referencing a session_pair the roster no longer recognizes as
 * paired, and (via C3) a court could seat half of it against a departed
 * player. A pair may still be dissolved freely BEFORE the bracket locks
 * (entering the tournament does not itself freeze anything) -- callers gate
 * this check on `session.bracketLockedAt`, not on `session.tournamentFormat`
 * alone.
 *
 * @returns {Promise<boolean>}
 */
export async function hasActiveEntrantForPair(db, sessionId, sessionPairId) {
  const row = await db
    .prepare(`SELECT id FROM tournament_entrants WHERE session_id = ? AND session_pair_id = ? AND status = 'ACTIVE'`)
    .bind(sessionId, sessionPairId)
    .first()
  return Boolean(row)
}

// Active entrants with both pair members' display names and the pair's own
// session_pair_id, ordered by seed then created_at -- the ordering
// lockBracket's caller and the entrants list page both rely on. Seed is
// nullable (unseeded until the bracket locks), so `seed IS NULL` sorts last
// rather than relying on SQLite version-specific NULLS LAST syntax.
//
// Also exposes each member's raw player_id (not just their session_player_id)
// -- lockBracket needs it to read ALL_TIME OPI via getPlayerSnapshot, which is
// keyed by player_id, not session_player_id.
export async function listEntrants(db, sessionId) {
  const result = await db
    .prepare(
      `SELECT te.id, te.session_id, te.session_pair_id, te.seed, te.status, te.created_at, te.updated_at,
              pa.display_name AS player_a_display_name, pb.display_name AS player_b_display_name,
              spa.player_id AS player_a_id, spb.player_id AS player_b_id
       FROM tournament_entrants te
       JOIN session_pairs sp ON sp.id = te.session_pair_id
       JOIN session_players spa ON spa.id = sp.session_player_a_id
       JOIN players pa ON pa.id = spa.player_id
       JOIN session_players spb ON spb.id = sp.session_player_b_id
       JOIN players pb ON pb.id = spb.player_id
       WHERE te.session_id = ? AND te.status = 'ACTIVE'
       ORDER BY (te.seed IS NULL) ASC, te.seed ASC, te.created_at ASC`,
    )
    .bind(sessionId)
    .all()

  return (result.results || []).map((row) => ({
    ...toEntrant(row),
    playerADisplayName: row.player_a_display_name,
    playerBDisplayName: row.player_b_display_name,
    displayName: `${row.player_a_display_name} / ${row.player_b_display_name}`,
    memberPlayerIds: [row.player_a_id, row.player_b_id],
  }))
}

export function buildSetSeedStatement(db, sessionId, entrantId, seed) {
  return db
    .prepare(`UPDATE tournament_entrants SET seed = ?, updated_at = ? WHERE id = ? AND session_id = ?`)
    .bind(seed, nowIso(), entrantId, sessionId)
}

// One INSERT per GeneratedFixture (generateFixtures.ts), for lockBracket to
// batch alongside the seed statements and the bracket-lock UPDATE in ONE
// db.batch() -- a half-locked bracket (seeds without fixtures, or fixtures
// without the lock) is the exact class of state Part B kept having to fix.
// All fixtures from one lock share a single `nowIso()` call rather than one
// per row, since they are conceptually one atomic write.
export function insertFixturesStatements(db, sessionId, fixtures) {
  const timestamp = nowIso()
  return fixtures.map((fixture) =>
    db
      .prepare(
        `INSERT INTO tournament_fixtures
           (id, session_id, bracket, pool_label, round_number, position, entrant_a_id, entrant_b_id,
            source_a, source_b, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        sessionId,
        fixture.bracket,
        fixture.poolLabel,
        fixture.roundNumber,
        fixture.position,
        fixture.entrantAId,
        fixture.entrantBId,
        fixture.sourceA,
        fixture.sourceB,
        fixture.status,
        timestamp,
        timestamp,
      ),
  )
}

function toFixture(row, displayNameByEntrantId) {
  const names = displayNameByEntrantId || new Map()
  return {
    id: row.id,
    sessionId: row.session_id,
    bracket: row.bracket,
    poolLabel: row.pool_label,
    roundNumber: row.round_number,
    position: row.position,
    entrantAId: row.entrant_a_id,
    entrantBId: row.entrant_b_id,
    entrantADisplayName: row.entrant_a_id ? names.get(row.entrant_a_id) ?? null : null,
    entrantBDisplayName: row.entrant_b_id ? names.get(row.entrant_b_id) ?? null : null,
    sourceA: row.source_a,
    sourceB: row.source_b,
    gameId: row.game_id,
    winnerEntrantId: row.winner_entrant_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Fixtures with both entrants' display names, ordered by bracket, round then
// position -- the fixture list's natural reading order. Display names are
// resolved via listEntrants (a plain JS Map lookup) rather than a second pair
// of session_pairs/session_players/players joins inline here: round robin's
// fixtures reference every ACTIVE entrant already covered by listEntrants, and
// composing two already-correct queries is far less error-prone than a
// six-way join repeated in this file.
export async function listFixtures(db, sessionId) {
  const [fixturesResult, entrants] = await Promise.all([
    db
      .prepare(`SELECT * FROM tournament_fixtures WHERE session_id = ? ORDER BY bracket ASC, round_number ASC, position ASC`)
      .bind(sessionId)
      .all(),
    listEntrants(db, sessionId),
  ])

  const displayNameByEntrantId = new Map(entrants.map((entrant) => [entrant.id, entrant.displayName]))
  return (fixturesResult.results || []).map((row) => toFixture(row, displayNameByEntrantId))
}

// How finishGame (Task 7) finds the fixture a just-finished game belongs to.
// No display-name join -- callers of this one only need the fixture's own
// columns (entrant ids, status) to progress the bracket.
export async function getFixtureByGameId(db, sessionId, gameId) {
  const row = await db
    .prepare(`SELECT * FROM tournament_fixtures WHERE session_id = ? AND game_id = ?`)
    .bind(sessionId, gameId)
    .first()
  return row ? toFixture(row) : null
}

// Unexecuted UPDATE binding a fixture to the game just started for it, for
// Task 6/7 to batch alongside the game-creation statements.
export function buildSetFixtureGameStatement(db, sessionId, fixtureId, gameId) {
  return db
    .prepare(`UPDATE tournament_fixtures SET game_id = ?, status = 'IN_PROGRESS', updated_at = ? WHERE id = ? AND session_id = ?`)
    .bind(gameId, nowIso(), fixtureId, sessionId)
}

// Unexecuted UPDATE recording a fixture's result, for Task 7's finishGame to
// batch alongside its own game-finishing statements.
export function buildFinishFixtureStatement(db, sessionId, fixtureId, winnerEntrantId) {
  return db
    .prepare(`UPDATE tournament_fixtures SET winner_entrant_id = ?, status = 'FINISHED', updated_at = ? WHERE id = ? AND session_id = ?`)
    .bind(winnerEntrantId, nowIso(), fixtureId, sessionId)
}

// Unexecuted UPDATE undoing buildSetFixtureGameStatement's effect, for
// abandonGame (Task C1 hardening) to batch alongside its own court-release
// statements. Without this, an abandoned game's fixture was left
// IN_PROGRESS with `game_id` still set: `nextPlayableFixture` only ever
// admits READY fixtures, so it could never be selected again, and
// `listTournamentStandings` only counts FINISHED fixtures, so it silently
// vanished from standings -- wedging that round robin permanently, with
// nothing telling the operator why. Scoped to `status = 'IN_PROGRESS'` so it
// can never clobber a fixture some other path has already moved on from
// (e.g. one that finished through a different, later game).
export function buildResetFixtureStatement(db, sessionId, fixtureId) {
  return db
    .prepare(`UPDATE tournament_fixtures SET game_id = NULL, status = 'READY', updated_at = ? WHERE id = ? AND session_id = ? AND status = 'IN_PROGRESS'`)
    .bind(nowIso(), fixtureId, sessionId)
}

// Unexecuted UPDATE freezing the bracket, for lockBracket to batch alongside
// the seed statements and insertFixturesStatements above -- see that method's
// comment for why all three must commit or fail together. The
// `bracket_locked_at IS NULL` guard is a compare-and-swap in the same spirit
// as sessions.js's updateSessionStatus: belt-and-suspenders against locking
// twice, on top of lockBracket's own pre-check.
export function buildLockBracketStatement(db, sessionId, timestamp) {
  return db
    .prepare(`UPDATE pickleball_sessions SET bracket_locked_at = ?, updated_at = ? WHERE id = ? AND bracket_locked_at IS NULL`)
    .bind(timestamp, timestamp, sessionId)
}

// Per-entrant wins, losses, points for/against, computed directly from
// tournament_fixtures + games rather than player_game_stats.
//
// Deliberately NOT `agg.eligible_for_opi = 1` (sessionStandings.js's filter):
// finishGame writes every tournament game's player_game_stats rows with
// eligible_for_opi = 0 (tournament games must never feed OPI -- spec §3.2,
// Task 7), so that filter would silently report every entrant 0-0 here. This
// query never touches player_game_stats at all, so that flag can't apply to
// it either way -- see task-8-brief.md for the trap this avoids and why
// sessionStandings.js itself needs a separate fix for the player-level view.
//
// `participations` flattens each finished fixture into one row per entrant
// (the entrant's own score first) so a single GROUP BY can aggregate wins,
// losses and points without a self-join.
//
// I4 fix: this used to read `points_for`/`points_against` straight off
// `g.final_score_a`/`g.final_score_b` by ASSUMING entrant_a's score is
// final_score_a. That is false in general -- `startGame` resolves "team A"
// from the operator-supplied starting-server id (see that method's own
// comment: it "need not match the fixture's own entrant_a/entrant_b
// labeling"), so a game can easily finish with the fixture's entrant A
// seated as the game's team B. `finishGame` already gets this right for
// `winner_entrant_id` by resolving through `teams.session_pair_id`
// (`getTeamSessionPairId`), never through team-A/B labels; this query now
// does the same via the `game_teams` CTE below, matching each entrant's OWN
// session_pair_id (via tournament_entrants -> session_pairs) against
// whichever of the game's two teams actually carries that pair id, and
// reading THAT team's score. Getting this wrong silently inverted both
// pointsFor/pointsAgainst and the point differential -- spec §3.7's #2
// ranking key -- for any fixture where team-A labeling happened to disagree
// with entrant-A labeling.
//
// This ORDER BY is only a stable base order (seed) for readability when
// called on its own -- it is NOT the competitive ranking. Spec §3.7's real
// ordering ("wins, losses, point differential, then head-to-head") is
// computed by the pure, unit-tested rankTournamentStandings()
// (src/lib/pickleball/tournament/rankTournamentStandings.ts), the same
// SQL-supplies-aggregates/JS-does-the-sort split sessionStandings.js already
// established for rankStandings(). The standings API route composes this
// function's output with listFixtures' (for head-to-head) through that pure
// function.
export async function listTournamentStandings(db, sessionId) {
  const result = await db
    .prepare(
      `WITH game_teams AS (
         SELECT g.id AS game_id, g.final_score_a, g.final_score_b,
                ta.session_pair_id AS team_a_pair_id, tb.session_pair_id AS team_b_pair_id
         FROM games g
         JOIN teams ta ON ta.id = g.team_a_id
         JOIN teams tb ON tb.id = g.team_b_id
       ),
       participations AS (
         SELECT f.entrant_a_id AS entrant_id,
                CASE WHEN gt.team_a_pair_id = ea.session_pair_id THEN gt.final_score_a ELSE gt.final_score_b END AS points_for,
                CASE WHEN gt.team_a_pair_id = ea.session_pair_id THEN gt.final_score_b ELSE gt.final_score_a END AS points_against,
                CASE WHEN f.winner_entrant_id = f.entrant_a_id THEN 1 ELSE 0 END AS win
         FROM tournament_fixtures f
         JOIN game_teams gt ON gt.game_id = f.game_id
         JOIN tournament_entrants ea ON ea.id = f.entrant_a_id
         WHERE f.session_id = ? AND f.status = 'FINISHED' AND f.entrant_a_id IS NOT NULL
         UNION ALL
         SELECT f.entrant_b_id AS entrant_id,
                CASE WHEN gt.team_b_pair_id = eb.session_pair_id THEN gt.final_score_b ELSE gt.final_score_a END AS points_for,
                CASE WHEN gt.team_b_pair_id = eb.session_pair_id THEN gt.final_score_a ELSE gt.final_score_b END AS points_against,
                CASE WHEN f.winner_entrant_id = f.entrant_b_id THEN 1 ELSE 0 END AS win
         FROM tournament_fixtures f
         JOIN game_teams gt ON gt.game_id = f.game_id
         JOIN tournament_entrants eb ON eb.id = f.entrant_b_id
         WHERE f.session_id = ? AND f.status = 'FINISHED' AND f.entrant_b_id IS NOT NULL
       )
       SELECT te.id, te.seed,
              pa.display_name AS player_a_display_name, pb.display_name AS player_b_display_name,
              COALESCE(SUM(p.win), 0) AS wins,
              COALESCE(SUM(CASE WHEN p.win = 0 THEN 1 ELSE 0 END), 0) AS losses,
              COALESCE(SUM(p.points_for), 0) AS points_for,
              COALESCE(SUM(p.points_against), 0) AS points_against
       FROM tournament_entrants te
       JOIN session_pairs sp ON sp.id = te.session_pair_id
       JOIN session_players spa ON spa.id = sp.session_player_a_id
       JOIN players pa ON pa.id = spa.player_id
       JOIN session_players spb ON spb.id = sp.session_player_b_id
       JOIN players pb ON pb.id = spb.player_id
       LEFT JOIN participations p ON p.entrant_id = te.id
       WHERE te.session_id = ? AND te.status = 'ACTIVE'
       GROUP BY te.id
       ORDER BY (te.seed IS NULL) ASC, te.seed ASC`,
    )
    .bind(sessionId, sessionId, sessionId)
    .all()

  return (result.results || []).map((row) => ({
    entrantId: row.id,
    seed: row.seed,
    displayName: `${row.player_a_display_name} / ${row.player_b_display_name}`,
    wins: row.wins,
    losses: row.losses,
    pointsFor: row.points_for,
    pointsAgainst: row.points_against,
  }))
}
