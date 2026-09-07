// The fixed-pairs sibling to queueEngine.ts's selectNextPlayers. Same three
// fairness rules, same `reasons[]` explainability contract, but the unit of
// work is a pair rather than a player — so rule 3 avoids an immediate repeat
// of the last OPPOSING PAIR rather than of a partner (partners are fixed by
// definition here, which is the whole point of the session type).
//
// Pure: no DB, no DO, no imports from src/worker. Everything it needs is in
// the candidate rows the caller passes.

export interface PairCandidate {
  sessionPairId: string
  memberSessionPlayerIds: [string, string]
  displayName: string
  gamesPlayed: number
  queuedAt: string
}

export interface PairSelectionReason {
  sessionPairId: string
  reasons: string[]
}

export interface PairSelectionResult {
  selected: PairCandidate[]
  reasons: PairSelectionReason[]
  shortfall: string | null
}

// Below this many eligible pairs there is no meaningful alternative to swap
// in, so repeat-avoidance is skipped rather than allowed to block an
// otherwise-valid match. Mirrors queueEngine.ts's 5-player threshold: one
// more than a full court's worth of entrants.
const REPEAT_AVOIDANCE_MIN_PAIRS = 3

function byFairness(a: PairCandidate, b: PairCandidate): number {
  if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed
  return Date.parse(a.queuedAt) - Date.parse(b.queuedAt)
}

function waitedMinutes(queuedAt: string, nowIso: string): number {
  return Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(queuedAt)) / 60000))
}

export function selectNextPairs(
  candidates: PairCandidate[],
  count: number,
  nowIso: string,
  lastOpponentPairId?: Record<string, string | null | undefined>,
): PairSelectionResult {
  const sorted = [...candidates].sort(byFairness)

  if (sorted.length < count) {
    return {
      selected: [],
      reasons: [],
      shortfall: `Not enough eligible pairs (need ${count}, have ${sorted.length}).`,
    }
  }

  const selected = sorted.slice(0, count)

  // Rule 3, and only as a tiebreak. A swap is allowed exclusively between
  // pairs tied on the EXACT same gamesPlayed, so it can never override rule
  // 1; and only once enough pairs are eligible for a real alternative to
  // exist.
  if (lastOpponentPairId && sorted.length >= REPEAT_AVOIDANCE_MIN_PAIRS && count >= 2) {
    const selectedIds = new Set(selected.map((pair) => pair.sessionPairId))
    for (let index = selected.length - 1; index >= 1; index -= 1) {
      const lastOpponent = lastOpponentPairId[selected[index].sessionPairId]
      if (!lastOpponent || !selectedIds.has(lastOpponent)) continue

      const replacement = sorted.find(
        (candidate) =>
          !selectedIds.has(candidate.sessionPairId) &&
          candidate.gamesPlayed === selected[index].gamesPlayed &&
          lastOpponentPairId[candidate.sessionPairId] !== selected[0].sessionPairId,
      )
      if (!replacement) continue

      selectedIds.delete(selected[index].sessionPairId)
      selectedIds.add(replacement.sessionPairId)
      selected[index] = replacement
      break
    }
  }

  const fewestGames = selected.length ? Math.min(...selected.map((pair) => pair.gamesPlayed)) : 0
  const reasons: PairSelectionReason[] = selected.map((pair) => {
    const lines = [
      `Games played: ${pair.gamesPlayed}`,
      `Waiting ${waitedMinutes(pair.queuedAt, nowIso)} min`,
    ]
    if (pair.gamesPlayed === fewestGames) lines.unshift('Fewest games played of the eligible pairs')
    return { sessionPairId: pair.sessionPairId, reasons: lines }
  })

  return { selected, reasons, shortfall: null }
}
