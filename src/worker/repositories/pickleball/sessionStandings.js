// Session standings read model. Deliberately a separate file from
// playerPerformanceSnapshots.js: that file owns the OPI snapshot *write* path
// (delete-then-insert-from-aggregate inside finishGame's batch) and its
// leaderboard read, which is snapshot-rows-only by design. This query starts
// from session_players instead, so the board is populated with the full
// attending roster from the first second of a session -- a player with no
// finished game yet joins with a NULL opi rather than being absent.
//
// Ranking itself is NOT done here. It lives in rankStandings()
// (src/lib/pickleball/standings.ts), pure and unit-tested; SQL only supplies
// the raw per-player aggregates.

function toStandingsRow(row) {
  return {
    playerId: row.player_id,
    displayName: row.display_name,
    attendanceStatus: row.attendance_status,
    availabilityStatus: row.availability_status,
    // A player whose session snapshot row does not exist yet has no OPI --
    // null, never 0, which would read as "played and scored nothing."
    eligibleGamesCount: row.eligible_games_count ?? 0,
    opi: row.opi === null || row.opi === undefined ? null : row.opi,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    pointsFor: row.points_for ?? 0,
    pointsAgainst: row.points_against ?? 0,
    onCourt: Boolean(row.on_court),
  }
}

// Attendance filter: REGISTERED players who actually turned up. A CANCELLED
// registration or a never-arrived NOT_CHECKED_IN player is not part of the
// session's standings (spec §15 #10 -- "registered, not arrived" never
// counts), while LEFT_SESSION is kept, because the games they played before
// leaving are real and must stay on the board.
//
// `isTournament` (task-8-brief.md's named trap, spec §3.7): finishGame writes
// EVERY tournament game's player_game_stats rows with eligible_for_opi = 0
// (tournament results must never feed OPI -- Task 7), so the `agg` subquery
// below filtering on `pgs.eligible_for_opi = 1` unchanged would silently
// report every entrant of a finished tournament as 0-0 here -- not an error,
// zeroes. The `opi` column itself is untouched by this flag either way: it
// comes from player_performance_snapshots (playerPerformanceSnapshots.js),
// which applies its OWN eligible_for_opi filter independently, so a
// tournament session's players still correctly show a null/unchanged OPI --
// only the win/loss/points aggregate needed unblocking. Passing
// `isTournament: true` drops the eligibility filter for the win/loss
// aggregate ONLY; every non-tournament game always writes eligible_for_opi=1
// today (the flag's only write site is gated on `!session.tournamentFormat`),
// so this is a no-op for every existing call site unless the caller
// explicitly says otherwise -- see pickleball-games.spec.js's regression
// coverage of the default (tournament: false) path.
export async function listSessionStandings(db, sessionId, organizationId, { isTournament = false } = {}) {
  const result = await db
    .prepare(
      `SELECT
         sp.player_id,
         p.display_name,
         sp.attendance_status,
         sp.availability_status,
         snap.eligible_games_count,
         snap.opi,
         agg.wins,
         agg.losses,
         agg.points_for,
         agg.points_against,
         CASE WHEN live.session_player_id IS NULL THEN 0 ELSE 1 END AS on_court
       FROM session_players sp
       JOIN players p ON p.id = sp.player_id
       LEFT JOIN player_performance_snapshots snap
         ON snap.player_id = sp.player_id
        AND snap.scope_type = 'SESSION'
        AND snap.scope_id = sp.session_id
       LEFT JOIN (
         SELECT pgs.player_id,
                SUM(CASE WHEN pgs.is_win = 1 THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN pgs.is_win = 1 THEN 0 ELSE 1 END) AS losses,
                SUM(pgs.points_for) AS points_for,
                SUM(pgs.points_against) AS points_against
         FROM player_game_stats pgs
         JOIN games g ON g.id = pgs.game_id
         WHERE g.session_id = ? AND (? = 1 OR pgs.eligible_for_opi = 1)
         GROUP BY pgs.player_id
       ) agg ON agg.player_id = sp.player_id
       LEFT JOIN (
         SELECT DISTINCT gp.session_player_id
         FROM game_participants gp
         JOIN games g ON g.id = gp.game_id
         WHERE g.session_id = ? AND g.status IN ('SCHEDULED', 'IN_PROGRESS')
       ) live ON live.session_player_id = sp.id
       WHERE sp.session_id = ?
         AND p.organization_id = ?
         AND sp.registration_status = 'REGISTERED'
         AND sp.attendance_status IN ('CHECKED_IN', 'LEFT_SESSION')
       ORDER BY p.display_name ASC`,
    )
    .bind(sessionId, isTournament ? 1 : 0, sessionId, sessionId, organizationId)
    .all()
  return (result.results || []).map(toStandingsRow)
}
