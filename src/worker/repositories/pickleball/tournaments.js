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

// Unexecuted UPDATE moving an entrant off ACTIVE, for withdrawEntrant to
// batch alongside its own per-fixture walkover statements below -- see that
// method's own comment for why all of it must commit in ONE db.batch().
// Scoped to `status = 'ACTIVE'` (a compare-and-swap, same spirit as
// buildLockBracketStatement's `bracket_locked_at IS NULL`) so a second
// withdraw attempt against an already-WITHDRAWN entrant changes nothing here
// -- withdrawEntrant's own pre-check is what turns that into a clean domain
// failure rather than a silent no-op UPDATE.
//
// This is the ONLY place in the codebase that ever writes 'WITHDRAWN':
// hasActiveEntrantForPair (above) is what dissolvePair/leaveSession consult,
// so once this UPDATE lands, that predicate stops matching this pair and
// both of those commands succeed where they previously refused.
export function buildWithdrawEntrantStatement(db, sessionId, entrantId) {
  return db
    .prepare(`UPDATE tournament_entrants SET status = 'WITHDRAWN', updated_at = ? WHERE id = ? AND session_id = ? AND status = 'ACTIVE'`)
    .bind(nowIso(), entrantId, sessionId)
}

// True when `entrantId` currently holds an IN_PROGRESS fixture -- the guard
// withdrawEntrant applies before touching anything else. A live game must be
// finished or abandoned first; withdrawEntrant does not attempt to unwind
// one itself, the same lesson dissolvePair's own C3 fix already learned (see
// hasActiveEntrantForPair's header) for the identical class of mistake.
export async function hasInProgressFixtureForEntrant(db, sessionId, entrantId) {
  const row = await db
    .prepare(
      `SELECT id FROM tournament_fixtures
       WHERE session_id = ? AND status = 'IN_PROGRESS' AND (entrant_a_id = ? OR entrant_b_id = ?)`,
    )
    .bind(sessionId, entrantId, entrantId)
    .first()
  return Boolean(row)
}

// Every one of `entrantId`'s fixtures not yet played (READY or PENDING --
// PENDING never actually occurs for ROUND_ROBIN today, generateFixtures only
// ever emits READY, but withdrawEntrant handles it generically rather than
// assuming), for withdrawEntrant to resolve into either a walkover (the
// opponent is a known, still-ACTIVE entrant) or a no-decision FINISH
// (opponent absent or also withdrawn) -- see that method's own comment for
// the full rule. Already-FINISHED fixtures are deliberately excluded: results
// that happened, happened.
export async function listUnplayedFixturesForEntrant(db, sessionId, entrantId) {
  const result = await db
    .prepare(
      `SELECT * FROM tournament_fixtures
       WHERE session_id = ? AND status IN ('READY', 'PENDING') AND (entrant_a_id = ? OR entrant_b_id = ?)`,
    )
    .bind(sessionId, entrantId, entrantId)
    .all()
  return (result.results || []).map((row) => toFixture(row))
}

// Unexecuted UPDATE recording a walkover or a no-decision FINISH for a
// fixture neither side can now play, for withdrawEntrant to batch alongside
// buildWithdrawEntrantStatement above. `winnerEntrantId` is either the
// surviving opponent (a walkover win -- no game was played, so `game_id`
// stays NULL, exactly as the spec requires: "a walkover is a win with no
// points") or NULL when nobody gets credit (the opponent is absent or also
// withdrawn -- "nobody gets a walkover win from a fixture neither side could
// play").
//
// `AND status IN ('READY', 'PENDING')` makes this a compare-and-swap rather
// than a blind overwrite, in the same spirit as buildLockBracketStatement's
// `bracket_locked_at IS NULL` and buildWithdrawEntrantStatement's own
// `status = 'ACTIVE'`. withdrawEntrant's `listUnplayedFixturesForEntrant`
// read already selects only READY/PENDING rows, so on the ordinary path this
// clause changes nothing -- it is here so that a row which moved on between
// that read and the batch (the reads are several awaits before the single
// db.batch()) is skipped instead of having a real, already-recorded result
// overwritten by a fabricated walkover. Cheap, and the class of mistake this
// file has had to fix before.
export function buildWithdrawFixtureStatement(db, sessionId, fixtureId, winnerEntrantId) {
  return db
    .prepare(
      `UPDATE tournament_fixtures SET status = 'FINISHED', winner_entrant_id = ?, updated_at = ?
       WHERE id = ? AND session_id = ? AND status IN ('READY', 'PENDING')`,
    )
    .bind(winnerEntrantId, nowIso(), fixtureId, sessionId)
}

// Every entrant (ACTIVE or WITHDRAWN) with both pair members' display names
// and the pair's own session_pair_id, ordered by seed then created_at -- the
// ordering lockBracket's caller and the entrants list page both rely on. Seed
// is nullable (unseeded until the bracket locks), so `seed IS NULL` sorts
// last rather than relying on SQLite version-specific NULLS LAST syntax.
//
// Deliberately NOT filtered to `status = 'ACTIVE'` (it once was): a withdrawn
// entrant's completed fixtures are real results, and hiding the entrant
// itself would make a surviving opponent's win count unexplainable in the
// UI ("a win against nobody") -- withdrawEntrant's own header has the full
// reasoning. Callers that need only the currently-competing set (lockBracket,
// pre-lock, when no entrant can be WITHDRAWN yet; assignCourtToTournamentFixture,
// which only ever seats a fixture still READY -- a withdrawn entrant's
// fixtures are never READY, see withdrawEntrant) are unaffected by including
// withdrawn rows here, since neither reads te.status itself.
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
       WHERE te.session_id = ?
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
// Ids are minted here, BEFORE any statement runs, so that `source_a`/`source_b`
// can be rewritten from generateFixtures' local keys (`WINNER_OF:MAIN:2:0`)
// into real fixture ids (`WINNER_OF:<uuid>`). advanceBracket matches sources
// against fixture ids by exact equality, so the rewrite has to happen on the
// way in -- there is no later point where a key could still be resolved,
// since the keys are never stored.
//
// A source naming a key that is not in this batch is a generator bug, not
// something to paper over: it would be written to the database as an
// unresolvable pointer and silently strand every fixture downstream of it, so
// it throws before the INSERTs are ever handed to lockBracket's db.batch().
function resolveSource(source, idByKey) {
  if (!source) return null
  const [tag, key] = [source.slice(0, source.indexOf(':') + 1), source.slice(source.indexOf(':') + 1)]
  const id = idByKey.get(key)
  if (!id) throw new Error(`Fixture source references an unknown slot: ${source}`)
  return `${tag}${id}`
}

export function insertFixturesStatements(db, sessionId, fixtures) {
  const timestamp = nowIso()
  const idByKey = new Map(fixtures.map((fixture) => [fixture.key, crypto.randomUUID()]))

  return fixtures.map((fixture) =>
    db
      .prepare(
        `INSERT INTO tournament_fixtures
           (id, session_id, bracket, pool_label, round_number, position, entrant_a_id, entrant_b_id,
            source_a, source_b, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        idByKey.get(fixture.key),
        sessionId,
        fixture.bracket,
        fixture.poolLabel,
        fixture.roundNumber,
        fixture.position,
        fixture.entrantAId,
        fixture.entrantBId,
        resolveSource(fixture.sourceA, idByKey),
        resolveSource(fixture.sourceB, idByKey),
        fixture.status,
        timestamp,
        timestamp,
      ),
  )
}

// Unexecuted UPDATE filling one side of a downstream fixture from
// advanceBracket's own output (or clearing it, for unadvanceBracket).
//
// Scoped to `status IN ('PENDING', 'READY')` as a compare-and-swap: a fixture
// that has since been started or played must never have an entrant slot
// rewritten underneath it. unadvanceBracket already refuses in that case and
// names the blocker, so on the ordinary path this clause changes nothing --
// it is here so the two cannot disagree.
export function buildFillFixtureSlotStatement(db, sessionId, { fixtureId, side, entrantId, status }) {
  const column = side === 'A' ? 'entrant_a_id' : 'entrant_b_id'
  return db
    .prepare(
      `UPDATE tournament_fixtures SET ${column} = ?, status = ?, updated_at = ?
       WHERE id = ? AND session_id = ? AND status IN ('PENDING', 'READY')`,
    )
    .bind(entrantId, status, nowIso(), fixtureId, sessionId)
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
// Scoped by `game_id` rather than by status. The status check this used to
// carry (`status = 'IN_PROGRESS'`) was meant to stop a fixture some LATER game
// had already moved on from being clobbered -- but matching on the abandoned
// game's own id says that directly and more precisely, while the status check
// silently did nothing in the one case that mattered:
//
// reopenGame deliberately leaves a bracket fixture FINISHED (it keeps the
// game_id so the re-finish can find it again). If the operator then ABANDONED
// that reopened game instead of correcting and re-finishing it, this reset
// matched zero rows: the game went ABANDONED while the fixture stayed FINISHED
// with a stale winner, pointing at an abandoned game, and the downstream slot
// reopenGame had already emptied was never refilled. The bracket was stuck
// below that fixture for good, and abandonGame returned ok.
//
// winner_entrant_id is cleared too -- without it a fixture reset from FINISHED
// would go back to READY still carrying the winner of a game that no longer
// counts.
export function buildResetFixtureStatement(db, sessionId, fixtureId, gameId) {
  return db
    .prepare(
      `UPDATE tournament_fixtures
       SET game_id = NULL, winner_entrant_id = NULL, status = 'READY', updated_at = ?
       WHERE id = ? AND session_id = ? AND game_id = ?`,
    )
    .bind(nowIso(), fixtureId, sessionId, gameId)
}

// Unexecuted UPDATE emptying one side of a fixture permanently: no entrant and
// no source, so nothing can ever arrive there (advanceBracket's isDeadSide).
// Clearing the source as well as the entrant is the whole point -- an
// entrant-only clear is indistinguishable from a side still waiting on an
// unplayed match, which is exactly how a withdrawn bye entrant's fixture came
// to look playable when it never would be.
export function buildVacateFixtureSlotStatement(db, sessionId, fixtureId, side) {
  const entrantColumn = side === 'A' ? 'entrant_a_id' : 'entrant_b_id'
  const sourceColumn = side === 'A' ? 'source_a' : 'source_b'
  return db
    .prepare(
      `UPDATE tournament_fixtures
       SET ${entrantColumn} = NULL, ${sourceColumn} = NULL, status = 'PENDING', updated_at = ?
       WHERE id = ? AND session_id = ? AND status IN ('PENDING', 'READY')`,
    )
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
// Withdrawal changed two things here. Only the first fixed a live bug; the
// second is deliberate dead defence, and is labelled as such rather than
// left to read like a fix:
//
// 1. REAL BUG. `JOIN game_teams gt ON gt.game_id = f.game_id` used to be an
//    INNER JOIN. A walkover fixture (withdrawEntrant) has NO game at all --
//    `game_id` stays NULL -- so an inner join dropped that fixture from
//    `participations` entirely and the walkover win vanished from standings.
//    Now a LEFT JOIN, with every points expression wrapped in
//    `COALESCE(..., 0)`: a walkover is a win with no points, per spec, never
//    an invented score. Reverting this single word drops the surviving
//    entrant from 2 wins to 1 in the mid-tournament withdrawal test --
//    measured, not assumed.
//
// 2. NOT REACHABLE TODAY. Both UNION branches also require
//    `f.winner_entrant_id IS NOT NULL`, so a no-decision FINISH
//    (withdrawEntrant's NULL-winner branch) could not silently count as a
//    LOSS for both sides via the `win = 0` branch of the aggregate below.
//    No public API path can currently produce such a row: withdrawEntrant
//    resolves ALL of an entrant's unplayed fixtures in one batch, so a later
//    withdrawal can never meet an already-withdrawn opponent, and no fixture
//    ever carries a NULL entrant id (ROUND_ROBIN emits no byes, and
//    dissolvePair sets a pair's status rather than deleting its entrant row).
//    Removing this clause therefore fails NO test -- verified by applying
//    that mutation and watching all 35 still pass. It is kept because
//    SINGLE_ELIMINATION byes (phase C2) will make the state reachable, and a
//    silent double-loss is a bad way to discover that. Do not treat it as
//    covered.
//
// Also no longer filters `te.status = 'ACTIVE'` (see listEntrants' own
// comment for the identical reasoning): a withdrawn entrant's ALREADY-PLAYED
// fixtures are real results, and dropping the entrant would make a surviving
// opponent's win look like a win against nobody. `te.status` is exposed on
// every row so the caller (and the UI) can mark a withdrawn entrant as such.
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
                COALESCE(CASE WHEN gt.team_a_pair_id = ea.session_pair_id THEN gt.final_score_a ELSE gt.final_score_b END, 0) AS points_for,
                COALESCE(CASE WHEN gt.team_a_pair_id = ea.session_pair_id THEN gt.final_score_b ELSE gt.final_score_a END, 0) AS points_against,
                CASE WHEN f.winner_entrant_id = f.entrant_a_id THEN 1 ELSE 0 END AS win
         FROM tournament_fixtures f
         LEFT JOIN game_teams gt ON gt.game_id = f.game_id
         JOIN tournament_entrants ea ON ea.id = f.entrant_a_id
         WHERE f.session_id = ? AND f.status = 'FINISHED' AND f.entrant_a_id IS NOT NULL AND f.winner_entrant_id IS NOT NULL
         UNION ALL
         SELECT f.entrant_b_id AS entrant_id,
                COALESCE(CASE WHEN gt.team_b_pair_id = eb.session_pair_id THEN gt.final_score_b ELSE gt.final_score_a END, 0) AS points_for,
                COALESCE(CASE WHEN gt.team_b_pair_id = eb.session_pair_id THEN gt.final_score_a ELSE gt.final_score_b END, 0) AS points_against,
                CASE WHEN f.winner_entrant_id = f.entrant_b_id THEN 1 ELSE 0 END AS win
         FROM tournament_fixtures f
         LEFT JOIN game_teams gt ON gt.game_id = f.game_id
         JOIN tournament_entrants eb ON eb.id = f.entrant_b_id
         WHERE f.session_id = ? AND f.status = 'FINISHED' AND f.entrant_b_id IS NOT NULL AND f.winner_entrant_id IS NOT NULL
       )
       SELECT te.id, te.seed, te.status,
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
       WHERE te.session_id = ?
       GROUP BY te.id
       ORDER BY (te.seed IS NULL) ASC, te.seed ASC`,
    )
    .bind(sessionId, sessionId, sessionId)
    .all()

  return (result.results || []).map((row) => ({
    entrantId: row.id,
    seed: row.seed,
    status: row.status,
    displayName: `${row.player_a_display_name} / ${row.player_b_display_name}`,
    wins: row.wins,
    losses: row.losses,
    pointsFor: row.points_for,
    pointsAgainst: row.points_against,
  }))
}
