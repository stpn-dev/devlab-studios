// PHASE 5 SEAM: this file holds only the per-game formula, the one piece
// Phase 4's finishGame needs to populate player_game_stats.game_performance.
// Phase 5 adds opi(games) (the mean-aggregation function) and
// recomputePlayerSnapshots to this SAME file -- do not reimplement the
// formula anywhere else (spec §38's single-source-of-truth requirement).
export function gamePerformance(pointsFor: number, pointsAgainst: number): number {
  return (pointsFor / (pointsFor + pointsAgainst)) * 100
}
