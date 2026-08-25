import type { GameState, ScoringRulesetLike, RallyOutcome } from './gameState'

export function officialScoreCall(state: GameState, format: 'SINGLES' | 'DOUBLES'): string {
  const servingScore = state.servingTeam === 'A' ? state.scoreA : state.scoreB
  const receivingScore = state.servingTeam === 'A' ? state.scoreB : state.scoreA
  if (format === 'SINGLES') return `${servingScore}-${receivingScore}`
  return `${servingScore}-${receivingScore}-${state.serverNumber}`
}

// A LEGALLY REACHABLE final score, not merely "the win condition is
// mathematically satisfied." The naive `max >= target && diff >= winBy` rule
// also accepts scores the game should never have reached under normal
// sequential play (e.g. 12-9 in a game to 11 win-by-2: the game would have
// already ended at 11-9). Two cases:
//  - the winner finished EXACTLY at targetScore: the loser must be at or
//    below targetScore - winBy (the game couldn't have gone further once the
//    winner hit target with a sufficient margin already in hand).
//  - the winner finished ABOVE targetScore (a deuce game that kept extending
//    on repeated ties): the margin over the loser must be EXACTLY winBy --
//    any wider margin means the game should have already ended earlier.
export function isValidFinalScore(scoreA: number, scoreB: number, ruleset: ScoringRulesetLike): boolean {
  const winner = Math.max(scoreA, scoreB)
  const loser = Math.min(scoreA, scoreB)
  if (winner < ruleset.targetScore) return false
  if (winner === ruleset.targetScore) return loser <= ruleset.targetScore - ruleset.winBy
  return winner - loser === ruleset.winBy
}

export function isGamePoint(state: GameState, ruleset: ScoringRulesetLike): boolean {
  const hypotheticalScoreA = state.servingTeam === 'A' ? state.scoreA + 1 : state.scoreA
  const hypotheticalScoreB = state.servingTeam === 'B' ? state.scoreB + 1 : state.scoreB
  return isValidFinalScore(hypotheticalScoreA, hypotheticalScoreB, ruleset)
}

// True once the CURRENT score already satisfies isValidFinalScore -- i.e.
// the game is already over and no further rally should be accepted. This is
// deliberately the same check as isValidFinalScore (a final score IS a
// state where the game has been won), exposed under its own name so DO
// command handlers can guard "reject a new rally" with a name that reads
// as intent, not as a score-validation call reused for an unrelated purpose.
export function hasGameBeenWon(state: GameState, ruleset: ScoringRulesetLike): boolean {
  return isValidFinalScore(state.scoreA, state.scoreB, ruleset)
}

export function contextualState(
  state: GameState,
  ruleset: ScoringRulesetLike,
  lastOutcome: RallyOutcome | null,
): 'SIDE_OUT' | 'GAME_POINT' | 'TIED_WIN_BY_TWO' | null {
  if (lastOutcome === 'SIDE_OUT') return 'SIDE_OUT'
  if (isGamePoint(state, ruleset)) return 'GAME_POINT'
  if (state.scoreA === state.scoreB && state.scoreA >= ruleset.targetScore - 1) return 'TIED_WIN_BY_TWO'
  return null
}
