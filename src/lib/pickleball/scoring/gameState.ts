export interface GameState {
  scoreA: number
  scoreB: number
  servingTeam: 'A' | 'B'
  serverNumber: 1 | 2
}

export interface ScoringRulesetLike {
  format: 'SINGLES' | 'DOUBLES'
  targetScore: number
  winBy: number
}

export type RallyOutcome = 'POINT_AWARDED' | 'SERVE_CHANGED' | 'SIDE_OUT'

export function initialGameState(servingTeam: 'A' | 'B'): GameState {
  return { scoreA: 0, scoreB: 0, servingTeam, serverNumber: 2 }
}
