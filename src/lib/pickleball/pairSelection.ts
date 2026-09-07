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

// One candidate's most recently-faced OTHER candidate, player-level (this is
// exactly the shape assignCourt's OPEN_PLAY path already builds as
// `lastPairedWith` from matchmaking_history, restricted to relation =
// 'OPPONENT' for the pairs case -- see buildLastOpponentPairId below).
// `lastGameAt` travels alongside the id so buildLastOpponentPairId can pick
// whichever of a pair's two members has the MORE RECENT record once the two
// can disagree (see that function's comment).
export interface LastOpponentSessionPlayer {
  sessionPlayerId: string
  lastGameAt: string
}

// Bridges a player-level "who did each session player most recently oppose"
// map (built from matchmaking_history by the caller) down to the pair-level
// `lastOpponentPairId` selectNextPairs actually consumes. Pure: no DB, no DO
// -- everything it needs is in its two arguments, which is what makes it
// unit-testable without a full game lifecycle (see pairSelection.test.ts).
//
// SELF-REFERENCE: a pair whose members were re-paired after their previous
// partnership dissolved can have its OWN id as the "resolved opponent" --
// e.g. A/B beat C/D, both pairs dissolve, A and C form a NEW pair P3;
// P3's member A's last opponent (C) now maps back to P3 itself, since C is
// now P3's own other member. `formPair`/`dissolvePair` already allow this
// re-pairing today, and `startGame` has no FIXED_PAIRS gate, so this is not
// a hypothetical: it is live the instant one fixed-pairs game finishes.
// Passing that self-reference through unchanged would make selectNextPairs
// believe P3 conflicts with itself (its own id is trivially "selected"),
// causing it to swap P3 out of a slot it fairly earned AND discard its real
// last-opponent signal. A self-reference is therefore resolved to `null`
// here, at the source, rather than left for every caller to filter.
export function buildLastOpponentPairId(
  candidates: PairCandidate[],
  lastOpponentSessionPlayer: Record<string, LastOpponentSessionPlayer | undefined>,
): Record<string, string | null> {
  const memberToPairId: Record<string, string> = {}
  for (const pair of candidates) {
    memberToPairId[pair.memberSessionPlayerIds[0]] = pair.sessionPairId
    memberToPairId[pair.memberSessionPlayerIds[1]] = pair.sessionPairId
  }

  const lastOpponentPairId: Record<string, string | null> = {}
  for (const pair of candidates) {
    const [memberA, memberB] = pair.memberSessionPlayerIds
    const viaA = lastOpponentSessionPlayer[memberA]
    const viaB = lastOpponentSessionPlayer[memberB]

    // Once the two members' histories can diverge (the re-pairing case
    // above), preferring member A unconditionally is arbitrary -- take
    // whichever record is actually more recent instead.
    let chosen: LastOpponentSessionPlayer | undefined
    if (viaA && viaB) {
      chosen = Date.parse(viaA.lastGameAt) >= Date.parse(viaB.lastGameAt) ? viaA : viaB
    } else {
      chosen = viaA ?? viaB
    }

    const opponentPairId = chosen ? memberToPairId[chosen.sessionPlayerId] : undefined
    lastOpponentPairId[pair.sessionPairId] = opponentPairId && opponentPairId !== pair.sessionPairId ? opponentPairId : null
  }

  return lastOpponentPairId
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

    // Defense-in-depth: a self-referencing entry (lastOpponentPairId[x] ===
    // x) must never register as a conflict. buildLastOpponentPairId
    // (pairSelection.ts's own bridge from matchmaking_history) already
    // resolves that case to null at the source, but this function is
    // exported and callable with a hand-built map, so it must not misbehave
    // if a future caller hands it a self-reference anyway -- a pair can
    // never truly be its own "last opponent".
    const resolvedOpponent = (pairId: string): string | null | undefined => {
      const opponent = lastOpponentPairId[pairId]
      return opponent === pairId ? null : opponent
    }

    for (let index = selected.length - 1; index >= 1; index -= 1) {
      const current = selected[index]
      const lastOpponent = resolvedOpponent(current.sessionPairId)
      if (!lastOpponent || !selectedIds.has(lastOpponent)) continue

      const remainingSelectedIds = new Set([...selectedIds].filter((id) => id !== current.sessionPairId))
      const replacement = sorted.find((candidate) => {
        if (selectedIds.has(candidate.sessionPairId) || candidate.gamesPlayed !== current.gamesPlayed) return false
        const candidateOpponent = resolvedOpponent(candidate.sessionPairId)
        return !(candidateOpponent && remainingSelectedIds.has(candidateOpponent))
      })
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
