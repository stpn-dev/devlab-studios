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

// Doubles opens on server 2 -- the traditional "0-0-2" start, where the very
// first serving side effectively gets only one server's turn before an
// immediate side out on a lost rally (see recordRally.ts's own comment).
// Singles has no server-1/server-2 distinction at all, so it must never
// carry a semantically meaningless serverNumber: 2 -- it opens (and stays)
// on 1 until the concept becomes relevant, which for singles is never.
export function initialGameState(servingTeam: 'A' | 'B', format: 'SINGLES' | 'DOUBLES'): GameState {
  return { scoreA: 0, scoreB: 0, servingTeam, serverNumber: format === 'DOUBLES' ? 2 : 1 }
}
