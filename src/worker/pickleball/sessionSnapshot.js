import { getSessionById } from '../repositories/pickleball/sessions.js'
import { listSessionCourts } from '../repositories/pickleball/sessionCourts.js'
import { listQueueForSession } from '../repositories/pickleball/queueEntries.js'
import { listGamesForSession } from '../repositories/pickleball/games.js'
import { getTeamWithMembers } from '../repositories/pickleball/teams.js'
import { listLeaderboard } from '../repositories/pickleball/playerPerformanceSnapshots.js'
import { confidenceTier } from '../../lib/pickleball/opi'

// The one place that assembles "everything a connected operator/public
// client needs to render the current session" — reused by both the
// WebSocket accept/broadcast path (SessionCoordinatorDO.ts) and the public
// REST polling fallback (Task 7), so there is exactly one query shape to
// keep correct rather than two that could drift.
export async function buildSessionSnapshot(db, sessionId) {
  const [session, courts, queue, games] = await Promise.all([
    getSessionById(db, sessionId),
    listSessionCourts(db, sessionId),
    listQueueForSession(db, sessionId),
    listGamesForSession(db, sessionId),
  ])
  return { session, courts, queue, games }
}

function teamDisplayName(team) {
  if (!team) return null
  return team.members.map((member) => member.displayName).join(' / ')
}

// The two extra pieces of state the PUBLIC channel needs beyond
// buildSessionSnapshot's shared shape (spec §9/§10): team display names (a
// join the operator path doesn't need duplicated, since the operator SPA
// already has its own authenticated team/roster reads) and the sanitized
// session leaderboard, gated by the session's own `public_leaderboard_enabled`
// flag. Kept as one function so both realtime transports
// (SessionCoordinatorDO's WS broadcast/accept and the public REST polling
// fallback) build it exactly the same way rather than two that could drift.
export async function buildPublicSnapshotExtras(db, session, games) {
  const teamIds = [...new Set(games.flatMap((game) => [game.teamAId, game.teamBId]).filter(Boolean))]
  const teams = await Promise.all(teamIds.map((teamId) => getTeamWithMembers(db, teamId)))
  const teamNames = Object.fromEntries(teams.filter(Boolean).map((team) => [team.id, teamDisplayName(team)]))

  let leaderboard = null
  if (session.publicLeaderboardEnabled) {
    const rows = await listLeaderboard(db, session.organizationId, 'SESSION', session.id, session.leaderboardMinGames)
    // Rounded here, at the public display boundary, per spec §8 ("only
    // rounded to 2 decimals at display time") -- listLeaderboard's own rows
    // (and the authenticated leaderboard route) keep full precision.
    leaderboard = rows.map((row, index) => ({
      displayName: row.displayName,
      opi: Math.round(row.opi * 100) / 100,
      rank: index + 1,
      confidenceTier: confidenceTier(row.eligibleGamesCount),
    }))
  }

  return { teamNames, leaderboard }
}
