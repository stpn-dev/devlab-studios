// PHASE 5 SEAM (now filled): gamePerformance is the per-game formula Phase 4
// uses to populate player_game_stats.game_performance. opi() is the
// mean-aggregation function and confidenceTier() the display-tier function --
// both live in this SAME file per spec §38's single-source-of-truth
// requirement; do not reimplement either elsewhere.
export function gamePerformance(pointsFor: number, pointsAgainst: number): number {
  return (pointsFor / (pointsFor + pointsAgainst)) * 100
}

export function opi(gamePerformances: number[]): number {
  return gamePerformances.reduce((sum, value) => sum + value, 0) / gamePerformances.length
}

export type ConfidenceTier = 'PROVISIONAL' | 'DEVELOPING' | 'ESTABLISHED'

export function confidenceTier(eligibleGamesCount: number): ConfidenceTier {
  if (eligibleGamesCount >= 10) return 'ESTABLISHED'
  if (eligibleGamesCount >= 3) return 'DEVELOPING'
  return 'PROVISIONAL'
}
