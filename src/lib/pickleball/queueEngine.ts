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
