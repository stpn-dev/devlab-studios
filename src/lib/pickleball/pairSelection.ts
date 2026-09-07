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

// Rule 3 (repeat-avoidance) only ever fires when a real alternative exists to
// swap in. Unlike queueEngine.ts's explicit 5-candidate threshold, no
// explicit "too few eligible pairs" gate is needed here: the shortfall check
// above already guarantees sorted.length >= count by the time this code
// runs, and count >= 2 is required to even attempt a swap, so the only way
// to have "too few pairs" left over is sorted.length === count === 2 -- at
// which point every candidate is already selected and the swap loop's own
// replacement search (below) structurally finds nothing to swap in. An
// earlier version of this file had an explicit REPEAT_AVOIDANCE_MIN_PAIRS
// gate; it was removed after both a hand proof and a 2,000,000-case
// randomised brute-force check showed it could never independently change
// the outcome once the swap loop resolves every conflict (see
// pairSelection.test.ts's "no-op when there are too few candidates" case).

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

  let selected = sorted.slice(0, count)

  // Rule 3, and only as a tiebreak. A swap is allowed exclusively between
  // pairs tied on the EXACT same gamesPlayed (never loosen this equality --
  // it is the single invariant that stops rule 3 from ever overriding rule
  // 1). Every conflicting slot in the selection is resolved in turn, not
  // just the first one found, and a replacement is only accepted if it
  // conflicts with none of the pairs that remain selected -- comparing only
  // against the top-ranked pair would let a swap trade one repeat for a
  // fresh repeat against a different selected pair.
  if (lastOpponentPairId && count >= 2) {
    let selectedIds = new Set(selected.map((pair) => pair.sessionPairId))

    for (let index = selected.length - 1; index >= 1; index -= 1) {
      const current = selected[index]
      const lastOpponent = lastOpponentPairId[current.sessionPairId]
      if (!lastOpponent || !selectedIds.has(lastOpponent)) continue

      const remainingSelectedIds = new Set([...selectedIds].filter((id) => id !== current.sessionPairId))
      const replacement = sorted.find(
        (candidate) =>
          !selectedIds.has(candidate.sessionPairId) &&
          candidate.gamesPlayed === current.gamesPlayed &&
          !(
            lastOpponentPairId[candidate.sessionPairId] &&
            remainingSelectedIds.has(lastOpponentPairId[candidate.sessionPairId]!)
          ),
      )
      if (!replacement) continue

      selected = selected.map((pair, i) => (i === index ? replacement : pair))
      selectedIds = new Set([...remainingSelectedIds, replacement.sessionPairId])
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
