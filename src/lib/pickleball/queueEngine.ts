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

export function selectNextPlayers(candidates: QueueCandidate[], count: number, nowIso: string): QueueSelectionResult {
  // Sorts by fewest games played first (primary fairness key, spec §5 rule
  // 1), then by longest queue wait as the tiebreak (rule 2). Rule 3 --
  // repeat-avoidance (avoid re-pairing players/opponents from
  // matchmaking_history) -- remains out of scope here (base plan's Ruling 4).
  //
  // TODO(Phase 5 or 7): wire matchmaking_history's repeat-avoidance tiebreak
  // here once a phase actually owns this read side. Phase 4 owns the WRITE
  // side: finishGame upserts a game's PARTNER/OPPONENT pairs (both relations,
  // both directions) as it finishes, and every transition that invalidates or
  // restores a game's contribution -- reopenGame, and finishGame's re-finish
  // after a correction -- rebuilds the whole session's rows from the currently
  // FINISHED games instead (recomputeMatchmakingHistoryStatements). So the
  // table reflects finished games as of the last such transition; only the
  // read/tiebreak logic is missing.
  const sorted = [...candidates].sort((a, b) => {
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed
    return Date.parse(a.queuedAt) - Date.parse(b.queuedAt)
  })

  const selected = sorted.slice(0, Math.max(0, count))
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
