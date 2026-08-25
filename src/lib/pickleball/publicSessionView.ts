import type { GameState } from './scoring/gameState'

interface PublicSessionView {
  session: { id: string; name: string; sessionType: string; status: string }
  courts: Array<{ id: string; courtName: string; status: string; currentGameId: string | null }>
  games: Array<{
    id: string; sessionCourtId: string | null; format: string; status: string
    scoreA: number; scoreB: number; servingTeam: GameState['servingTeam']; serverNumber: GameState['serverNumber']
    winningTeamId: string | null; finalScoreA: number | null; finalScoreB: number | null
  }>
}

// Explicit allowlist mapper (spec's realtime design, §10 of the parent
// spec): a newly added internal field on session/courts/games can never
// leak through here by omission, because every field below is named
// individually rather than "everything except X". `queue` is intentionally
// absent from the return value -- see this plan's Ruling B: the public
// channel was never meant to expose the internal admissions queue, only
// court/game state, and no allowlisted field here identifies a specific
// player (no session_player ids, no display names -- those require a join
// this plan doesn't build; deferred to whichever UI sub-project renders the
// public view).
export function toPublicSessionView(snapshot: {
  session: { id: string; name: string; sessionType: string; status: string }
  courts: Array<{ id: string; courtName: string; status: string; currentGameId: string | null }>
  games: Array<{
    id: string; sessionCourtId: string | null; format: string; status: string
    scoreA: number; scoreB: number; servingTeam: GameState['servingTeam']; serverNumber: GameState['serverNumber']
    winningTeamId: string | null; finalScoreA: number | null; finalScoreB: number | null
  }>
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
    })),
  }
}
