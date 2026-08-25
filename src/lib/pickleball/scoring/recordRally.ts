import type { GameState, ScoringRulesetLike, RallyOutcome } from './gameState'

export function recordRally(state: GameState, ruleset: ScoringRulesetLike, winningTeam: 'A' | 'B'): GameState {
  const servingTeamWon = winningTeam === state.servingTeam

  if (servingTeamWon) {
    return {
      ...state,
      scoreA: state.servingTeam === 'A' ? state.scoreA + 1 : state.scoreA,
      scoreB: state.servingTeam === 'B' ? state.scoreB + 1 : state.scoreB,
    }
  }

  // Receiving team won. Doubles has an intermediate "server 1 to server 2"
  // step with no point and no side out; singles has no server-1 concept at
  // all, so a receiving-team win there is always an immediate side out.
  if (ruleset.format === 'DOUBLES' && state.serverNumber === 1) {
    return { ...state, serverNumber: 2 }
  }

  return { ...state, servingTeam: winningTeam, serverNumber: 1 }
}

export function classifyRallyOutcome(before: GameState, after: GameState): RallyOutcome {
  if (before.servingTeam !== after.servingTeam) return 'SIDE_OUT'
  if (before.serverNumber !== after.serverNumber) return 'SERVE_CHANGED'
  return 'POINT_AWARDED'
}
