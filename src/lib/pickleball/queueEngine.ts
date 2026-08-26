export interface QueueCandidate {
  sessionPlayerId: string
  playerId: string
  displayName: string
  gamesPlayed: number
  queuedAt: string
}

export interface SelectionReason {
  sessionPlayerId: string
  reasons: string[]
}

export interface QueueSelectionResult {
  selected: QueueCandidate[]
  reasons: SelectionReason[]
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

export function selectNextPlayers(
  candidates: QueueCandidate[],
  count: number,
  nowIso: string,
  lastPairedWith?: Record<string, string | null | undefined>,
): QueueSelectionResult {
  // Sorts by fewest games played first (primary fairness key, spec §5 rule
  // 1), then by longest queue wait as the tiebreak (rule 2). Rule 3 --
  // repeat-avoidance -- is applied below as a swap-in tiebreak: it only ever
  // trades a selected candidate for another one tied on the EXACT same
  // gamesPlayed value, so it can never override rule 1, and it only kicks in
  // once there are enough eligible candidates for a real alternative to
  // exist (spec §56's 5-candidate degradation threshold).
  const sorted = [...candidates].sort((a, b) => {
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed
    return Date.parse(a.queuedAt) - Date.parse(b.queuedAt)
  })

  let selected = sorted.slice(0, Math.max(0, count))
  let repeatAvoidanceReplacementId: string | null = null

  // Repeat-avoidance tiebreak (spec §5 rule 3): only among candidates tied
  // on rule 1 (identical gamesPlayed) at the selection boundary, and only
  // once at least 5 candidates are eligible (spec §56's degradation
  // threshold -- below that there usually isn't a real alternative to swap
  // in anyway). Never touches rule 1 itself: a replacement candidate is only
  // ever drawn from the pool sharing the EXACT gamesPlayed value of the
  // selected candidate being replaced.
  if (lastPairedWith && candidates.length >= 5 && selected.length === count) {
    const selectedIds = new Set(selected.map((p) => p.sessionPlayerId))
    // Scan from the back of the selection: within a tied pair, both members
    // flag each other as a conflict, so scanning from the end swaps out
    // whichever of the two was ranked LATER by rules 1/2 (the weaker of the
    // tied pair) and keeps the one ranked earlier.
    let repeatIndex = -1
    for (let index = selected.length - 1; index >= 0; index -= 1) {
      const pairedWith = lastPairedWith[selected[index].sessionPlayerId]
      if (pairedWith && selectedIds.has(pairedWith)) {
        repeatIndex = index
        break
      }
    }

    if (repeatIndex !== -1) {
      const repeatCandidate = selected[repeatIndex]
      // The candidate about to be removed no longer counts as "selected" for
      // conflict-checking purposes -- a replacement whose own lastPairedWith
      // happens to BE repeatCandidate is not actually a conflict once
      // repeatCandidate is gone. It still counts for "not already in the
      // group" purposes (the first condition below), since it hasn't been
      // removed yet at evaluation time.
      const remainingSelectedIds = new Set([...selectedIds].filter((id) => id !== repeatCandidate.sessionPlayerId))
      const replacement = sorted.find(
        (candidate) =>
          !selectedIds.has(candidate.sessionPlayerId) &&
          candidate.gamesPlayed === repeatCandidate.gamesPlayed &&
          !(lastPairedWith[candidate.sessionPlayerId] && remainingSelectedIds.has(lastPairedWith[candidate.sessionPlayerId]!)),
      )
      if (replacement) {
        selected = selected.map((candidate, index) => (index === repeatIndex ? replacement : candidate))
        repeatAvoidanceReplacementId = replacement.sessionPlayerId
      }
    }
  }

  const now = Date.parse(nowIso)

  const reasons: SelectionReason[] = selected.map((candidate) => {
    const fewerGamesThan = candidates.filter((other) => other.gamesPlayed > candidate.gamesPlayed).length
    const waitMinutes = Math.max(0, Math.round((now - Date.parse(candidate.queuedAt)) / 60000))

    const lines = [
      `Games played: ${candidate.gamesPlayed}`,
      `Queue wait: ${waitMinutes} ${pluralize(waitMinutes, 'minute', 'minutes')}`,
    ]

    if (fewerGamesThan > 0) {
      lines.push(`Fewer games than ${fewerGamesThan} other eligible ${pluralize(fewerGamesThan, 'player', 'players')}`)
    }

    if (candidate.sessionPlayerId === repeatAvoidanceReplacementId) {
      lines.push('Selected instead of a recently paired player to avoid an immediate repeat')
    }

    return { sessionPlayerId: candidate.sessionPlayerId, reasons: lines }
  })

  return { selected, reasons }
}

export interface OpiCandidate {
  sessionPlayerId: string
  opi: number
}

// PHASE 5 SEAM (now filled): replaces assignCourt's placeholder midpoint
// split (SessionCoordinatorDO.ts, marked "PHASE 5 SEAM -- placeholder
// pairing, NOT a finished feature"). `candidates.length` is always exactly 2
// (singles) or 4 (doubles) -- requiredPlayerCount() never returns any other
// value -- so brute-forcing every into-two-sides partition is cheap and
// exact; no combinatorial explosion risk. This is intentionally separate
// from selectNextPlayers (spec §5 point 4): fairness selection decides WHO
// plays, this decides how the selected group splits into two competitive
// sides.
export function balanceTeams(candidates: OpiCandidate[]): { teamA: OpiCandidate[]; teamB: OpiCandidate[] } {
  if (candidates.length === 2) {
    return { teamA: [candidates[0]], teamB: [candidates[1]] }
  }

  const [a, b, c, d] = candidates
  const partitions: [OpiCandidate[], OpiCandidate[]][] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ]

  let best = partitions[0]
  let bestDiff = Infinity
  for (const [teamA, teamB] of partitions) {
    const sumA = teamA.reduce((sum, p) => sum + p.opi, 0)
    const sumB = teamB.reduce((sum, p) => sum + p.opi, 0)
    const diff = Math.abs(sumA - sumB)
    if (diff < bestDiff) {
      bestDiff = diff
      best = [teamA, teamB]
    }
  }

  return { teamA: best[0], teamB: best[1] }
}
