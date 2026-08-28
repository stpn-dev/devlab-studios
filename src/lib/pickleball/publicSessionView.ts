import type { GameState } from './scoring/gameState'

export interface PublicLeaderboardRow {
  displayName: string
  opi: number
  rank: number
  confidenceTier: string
}

interface PublicSessionView {
  session: { id: string; name: string; sessionType: string; status: string }
  courts: Array<{ id: string; courtName: string; status: string; currentGameId: string | null }>
  games: Array<{
    id: string; sessionCourtId: string | null; format: string; status: string
    scoreA: number; scoreB: number; servingTeam: GameState['servingTeam']; serverNumber: GameState['serverNumber']
    winningTeamId: string | null; finalScoreA: number | null; finalScoreB: number | null
    teamAName: string | null; teamBName: string | null
  }>
  leaderboard: PublicLeaderboardRow[] | null
}

// Explicit allowlist mapper (spec's realtime design, §9/§10 of the parent
// spec): a newly added internal field on session/courts/games can never
// leak through here by omission, because every field below is named
// individually rather than "everything except X". `queue` is intentionally
// absent from the return value -- see this plan's Ruling B: the public
// channel was never meant to expose the internal admissions queue, only
// court/game state. Team names and the leaderboard are the two allowlisted
// exceptions to "no field here identifies a specific player" -- the spec
// explicitly calls for both ("team display names", "sanitized leaderboard
// (display name, opi, rank, confidence tier only)"), so `teamNames` and
// `leaderboard` are pre-sanitized by buildPublicSnapshotExtras (never raw
// session_player/queue rows) before ever reaching this mapper.
export function toPublicSessionView(snapshot: {
  session: { id: string; name: string; sessionType: string; status: string }
  courts: Array<{ id: string; courtName: string; status: string; currentGameId: string | null }>
  games: Array<{
    id: string; sessionCourtId: string | null; format: string; status: string
    scoreA: number; scoreB: number; servingTeam: GameState['servingTeam']; serverNumber: GameState['serverNumber']
    winningTeamId: string | null; finalScoreA: number | null; finalScoreB: number | null
    teamAId: string; teamBId: string
  }>
  teamNames?: Record<string, string | null>
  leaderboard?: PublicLeaderboardRow[] | null
}): PublicSessionView {
  return {
    session: {
      id: snapshot.session.id,
      name: snapshot.session.name,
      sessionType: snapshot.session.sessionType,
      status: snapshot.session.status,
    },
    courts: snapshot.courts.map((court) => ({
      id: court.id,
      courtName: court.courtName,
      status: court.status,
      currentGameId: court.currentGameId,
    })),
    games: snapshot.games.map((game) => ({
      id: game.id,
      sessionCourtId: game.sessionCourtId,
      format: game.format,
      status: game.status,
      scoreA: game.scoreA,
      scoreB: game.scoreB,
      servingTeam: game.servingTeam,
      serverNumber: game.serverNumber,
      winningTeamId: game.winningTeamId,
      finalScoreA: game.finalScoreA,
      finalScoreB: game.finalScoreB,
      teamAName: snapshot.teamNames?.[game.teamAId] ?? null,
      teamBName: snapshot.teamNames?.[game.teamBId] ?? null,
    })),
    leaderboard: snapshot.leaderboard ?? null,
  }
}
