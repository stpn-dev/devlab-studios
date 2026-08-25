import type { GameState, ScoringRulesetLike, RallyOutcome } from './gameState'

export function officialScoreCall(state: GameState, format: 'SINGLES' | 'DOUBLES'): string {
  const servingScore = state.servingTeam === 'A' ? state.scoreA : state.scoreB
  const receivingScore = state.servingTeam === 'A' ? state.scoreB : state.scoreA
  if (format === 'SINGLES') return `${servingScore}-${receivingScore}`
  return `${servingScore}-${receivingScore}-${state.serverNumber}`
}

export function isValidFinalScore(scoreA: number, scoreB: number, ruleset: ScoringRulesetLike): boolean {
  return Math.max(scoreA, scoreB) >= ruleset.targetScore && Math.abs(scoreA - scoreB) >= ruleset.winBy
}

export function isGamePoint(state: GameState, ruleset: ScoringRulesetLike): boolean {
  const hypotheticalScoreA = state.servingTeam === 'A' ? state.scoreA + 1 : state.scoreA
  const hypotheticalScoreB = state.servingTeam === 'B' ? state.scoreB + 1 : state.scoreB
  return isValidFinalScore(hypotheticalScoreA, hypotheticalScoreB, ruleset)
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
