// Fixed-pairs repository (spec Part B, migration 0012_session_pairs).
//
// A session_pair is NOT a team: a team is per-game and per-court, and
// SessionCoordinatorDO.releaseCourt clears its session_court_id the moment
// the court is released (see migration 0005's header). A pair persists for
// the whole session -- created once, dissolved at most once, its
// games_played counter accumulating across every game it plays. Never
// conflate the two tables.
//
// `listEligiblePairs`'s return shape is a hard contract: Task 5 passes these
// rows straight into `selectNextPairs` (src/lib/pickleball/pairSelection.ts),
// so the mapped fields must match its `PairCandidate` interface exactly --
// sessionPairId, memberSessionPlayerIds, displayName, gamesPlayed, queuedAt.

import { nowIso } from '../../utils/responses.js'

function toPair(row) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionPlayerAId: row.session_player_a_id,
    sessionPlayerBId: row.session_player_b_id,
    status: row.status,
    gamesPlayed: row.games_played,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// True when an INSERT into session_pairs failed because of a domain rule
// createPair's caller should see as "can't form this pair", not a 500:
//
//  - trg_session_pairs_one_active_pair_per_player (migration 0012, fix round
//    1): a BEFORE INSERT trigger, since "a session_player belongs to at most
//    one ACTIVE pair" spans both columns of every existing row and no
//    same-column partial unique index can express that. Its RAISE(ABORT,...)
//    message deliberately starts with "UNIQUE constraint failed" so it reads
//    the same as a real unique-index violation here.
//  - the table's `CHECK (session_player_a_id != session_player_b_id)`
//    (also migration 0012): SQLite reports this as "CHECK constraint
//    failed: ...", a distinct message shape from the trigger's, so both
//    substrings must be checked.
//
// D1 doesn't expose a typed error code for either, so this is a string match
// against the driver's SQLITE_CONSTRAINT message, same approach
// queueEntries.js's joinQueue uses for idx_queue_entries_one_open_per_player.
function isPairConflictViolation(error) {
  const message = String((error && error.message) || error || '')
  return message.includes('UNIQUE constraint failed') || message.includes('CHECK constraint failed')
}

/**
 * Returns the new pair, or null if either member is already in an ACTIVE
 * pair, or the two member ids are the same player. The trigger and CHECK
 * constraint are the real enforcement (a read-then-write pre-check would
 * still race), so this always attempts the INSERT and translates either
 * violation into null rather than letting it throw -- callers treat null as
 * a domain error (e.g. 409), not a 500.
 */
export async function createPair(db, { sessionId, sessionPlayerAId, sessionPlayerBId }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  try {
    await db
      .prepare(
        `INSERT INTO session_pairs (id, session_id, session_player_a_id, session_player_b_id, status, games_played, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', 0, ?, ?)`,
      )
      .bind(id, sessionId, sessionPlayerAId, sessionPlayerBId, timestamp, timestamp)
      .run()
  } catch (error) {
    if (isPairConflictViolation(error)) return null
    throw error
  }

  return getPair(db, sessionId, id)
}

/**
 * Unexecuted UPDATE flipping an ACTIVE pair to DISSOLVED. Exported so
 * SessionCoordinatorDO.dissolvePair can compose it into ONE db.batch()
 * alongside queueEntries.js's buildCloseQueueEntriesForPairStatement --
 * dissolving a pair and closing its open queue_entries rows must commit
 * atomically, or an interrupted/failed second statement would leave the
 * pair DISSOLVED with its queue rows still QUEUED (a "ghost queued pair"
 * the fairness engine could still select). `dissolvePair` below is this
 * same statement run standalone, for any caller that only needs the pair
 * side (there is none today, but the single-purpose helper is kept for
 * parity with createPair/getPair).
 */
export function buildDissolvePairStatement(db, sessionId, pairId) {
  return db
    .prepare(
      `UPDATE session_pairs SET status = 'DISSOLVED', updated_at = ?
       WHERE id = ? AND session_id = ? AND status = 'ACTIVE'`,
    )
    .bind(nowIso(), pairId, sessionId)
}

export async function dissolvePair(db, sessionId, pairId) {
  const result = await buildDissolvePairStatement(db, sessionId, pairId).run()
  return Boolean(result.meta.changes)
}

export async function getPair(db, sessionId, pairId) {
  const row = await db
    .prepare(`SELECT * FROM session_pairs WHERE id = ? AND session_id = ?`)
    .bind(pairId, sessionId)
    .first()
  return toPair(row)
}

export async function getActivePairForSessionPlayer(db, sessionId, sessionPlayerId) {
  const row = await db
    .prepare(
      `SELECT * FROM session_pairs
       WHERE session_id = ? AND status = 'ACTIVE'
         AND (session_player_a_id = ? OR session_player_b_id = ?)`,
    )
    .bind(sessionId, sessionPlayerId, sessionPlayerId)
    .first()
  return toPair(row)
}

export async function listSessionPairs(db, sessionId) {
  const result = await db
    .prepare(
      `SELECT sp.id, sp.session_id, sp.session_player_a_id, sp.session_player_b_id, sp.status,
              sp.games_played, sp.created_at, sp.updated_at,
              pa.display_name AS player_a_display_name, pb.display_name AS player_b_display_name
       FROM session_pairs sp
       JOIN session_players spa ON spa.id = sp.session_player_a_id
       JOIN players pa ON pa.id = spa.player_id
       JOIN session_players spb ON spb.id = sp.session_player_b_id
       JOIN players pb ON pb.id = spb.player_id
       WHERE sp.session_id = ? AND sp.status = 'ACTIVE'
       ORDER BY sp.created_at ASC`,
    )
    .bind(sessionId)
    .all()

  return (result.results || []).map((row) => ({
    ...toPair(row),
    playerADisplayName: row.player_a_display_name,
    playerBDisplayName: row.player_b_display_name,
    displayName: `${row.player_a_display_name} / ${row.player_b_display_name}`,
  }))
}

// Eligibility mirrors queueEntries.js's listEligibleQueueCandidates, one
// level up: both members must be REGISTERED + CHECKED_IN + AVAILABLE, the
// pair itself ACTIVE, and both of the pair's queue_entries rows QUEUED.
//
// The two queue_entries joins (one per member, each pinned to
// `session_pair_id = sp.id AND status = 'QUEUED'`) rely on migration 0006's
// "at most one open entry per session_player" index: a member can hold at
// most one open row, so requiring THAT row to belong to this pair and be
// QUEUED is equivalent to, and simpler than, grouping by session_pair_id and
// counting. It also means a member currently ASSIGNED/PLAYING (whether via
// this pair or, if that ever became possible, another queue path) makes the
// whole pair ineligible, which is the correct fairness behaviour -- a pair
// can't be dispatched again while a member is still out on a game.
export async function listEligiblePairs(db, sessionId) {
  const result = await db
    .prepare(
      `SELECT sp.id, sp.session_player_a_id, sp.session_player_b_id, sp.games_played,
              pa.display_name AS player_a_display_name, pb.display_name AS player_b_display_name,
              qea.queued_at AS queued_at
       FROM session_pairs sp
       JOIN session_players spa ON spa.id = sp.session_player_a_id
       JOIN players pa ON pa.id = spa.player_id
       JOIN session_players spb ON spb.id = sp.session_player_b_id
       JOIN players pb ON pb.id = spb.player_id
       JOIN queue_entries qea ON qea.session_player_id = sp.session_player_a_id
         AND qea.session_pair_id = sp.id AND qea.status = 'QUEUED'
       JOIN queue_entries qeb ON qeb.session_player_id = sp.session_player_b_id
         AND qeb.session_pair_id = sp.id AND qeb.status = 'QUEUED'
       WHERE sp.session_id = ?
         AND sp.status = 'ACTIVE'
         AND spa.registration_status = 'REGISTERED' AND spa.attendance_status = 'CHECKED_IN' AND spa.availability_status = 'AVAILABLE'
         AND spb.registration_status = 'REGISTERED' AND spb.attendance_status = 'CHECKED_IN' AND spb.availability_status = 'AVAILABLE'
       ORDER BY sp.games_played ASC, qea.queued_at ASC`,
    )
    .bind(sessionId)
    .all()

  return (result.results || []).map((row) => ({
    sessionPairId: row.id,
    memberSessionPlayerIds: [row.session_player_a_id, row.session_player_b_id],
    displayName: `${row.player_a_display_name} / ${row.player_b_display_name}`,
    gamesPlayed: row.games_played,
    queuedAt: row.queued_at,
  }))
}

/**
 * Unexecuted UPDATE incrementing a pair's games-played counter, for batching
 * in finishGame -- the pair-level sibling of
 * sessionPlayers.js's buildIncrementGamesPlayedStatement.
 */
export function buildIncrementPairGamesPlayedStatement(db, sessionId, pairId) {
  return db
    .prepare(
      `UPDATE session_pairs SET games_played = games_played + 1, updated_at = ?
       WHERE id = ? AND session_id = ?`,
    )
    .bind(nowIso(), pairId, sessionId)
}

/**
 * Recomputes a pair's games_played from scratch: the number of FINISHED games
 * whose team A or team B WAS this pair's team.
 *
 * Resolved through `teams.session_pair_id` (migration 0013), never through the
 * members' current pairing. Those diverge the moment anyone re-pairs, and the
 * earlier member-based version credited a finished game to whichever pair a
 * member happened to be in at recompute time -- a pair that may never have
 * played it. Because listEligiblePairs orders by games_played, that corrupted
 * the fairness order rather than only a displayed number.
 *
 * Recompute rather than increment so reopening and re-finishing a game cannot
 * double-count, mirroring buildRecomputeGamesPlayedStatement for players.
 */
export function buildRecomputePairGamesPlayedStatement(db, sessionId, pairId) {
  return db
    .prepare(
      `UPDATE session_pairs SET games_played = (
        SELECT COUNT(DISTINCT g.id)
        FROM games g
        JOIN teams t ON t.session_pair_id = ?
                    AND (g.team_a_id = t.id OR g.team_b_id = t.id)
        WHERE g.status = 'FINISHED' AND g.session_id = ?
      ), updated_at = ?
       WHERE id = ? AND session_id = ?`,
    )
    .bind(pairId, sessionId, nowIso(), pairId, sessionId)
}

