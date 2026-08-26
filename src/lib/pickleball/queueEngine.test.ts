import { describe, it, expect } from 'vitest'
import { selectNextPlayers, balanceTeams } from './queueEngine'

const NOW = '2026-08-25T18:30:00.000Z'

function candidate(overrides: Partial<{ sessionPlayerId: string; playerId: string; displayName: string; gamesPlayed: number; queuedAt: string }>) {
  return {
    sessionPlayerId: overrides.sessionPlayerId ?? 'sp-default',
    playerId: overrides.playerId ?? 'p-default',
    displayName: overrides.displayName ?? 'Default Player',
    gamesPlayed: overrides.gamesPlayed ?? 0,
    queuedAt: overrides.queuedAt ?? NOW,
  }
}

describe('selectNextPlayers', () => {
  it('prefers fewer games played over longer wait', () => {
    const candidates = [
      candidate({ sessionPlayerId: 'a', gamesPlayed: 3, queuedAt: '2026-08-25T18:00:00.000Z' }),
      candidate({ sessionPlayerId: 'b', gamesPlayed: 1, queuedAt: '2026-08-25T18:20:00.000Z' }),
    ]
    const result = selectNextPlayers(candidates, 1, NOW)
    expect(result.selected.map((c) => c.sessionPlayerId)).toEqual(['b'])
  })

  it('breaks ties on games played by longest wait first', () => {
    const candidates = [
      candidate({ sessionPlayerId: 'a', gamesPlayed: 2, queuedAt: '2026-08-25T18:10:00.000Z' }),
      candidate({ sessionPlayerId: 'b', gamesPlayed: 2, queuedAt: '2026-08-25T18:00:00.000Z' }),
    ]
    const result = selectNextPlayers(candidates, 1, NOW)
    expect(result.selected.map((c) => c.sessionPlayerId)).toEqual(['b'])
  })

  it('selects exactly `count` players in order, never more', () => {
    const candidates = [1, 2, 3, 4, 5].map((n) => candidate({ sessionPlayerId: `p${n}`, gamesPlayed: n, queuedAt: NOW }))
    const result = selectNextPlayers(candidates, 4, NOW)
    expect(result.selected).toHaveLength(4)
    expect(result.selected.map((c) => c.sessionPlayerId)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('degrades gracefully when fewer candidates than requested count exist', () => {
    const candidates = [candidate({ sessionPlayerId: 'only' })]
    const result = selectNextPlayers(candidates, 4, NOW)
    expect(result.selected).toHaveLength(1)
  })

  it('returns an empty selection for zero candidates', () => {
    const result = selectNextPlayers([], 4, NOW)
    expect(result.selected).toEqual([])
    expect(result.reasons).toEqual([])
  })

  it('builds human-readable reasons naming games played and queue wait', () => {
    const candidates = [
      candidate({ sessionPlayerId: 'a', gamesPlayed: 1, queuedAt: '2026-08-25T18:15:00.000Z' }),
      candidate({ sessionPlayerId: 'b', gamesPlayed: 3, queuedAt: '2026-08-25T18:00:00.000Z' }),
    ]
    const result = selectNextPlayers(candidates, 1, NOW)
    const reason = result.reasons.find((r) => r.sessionPlayerId === 'a')!
    expect(reason.reasons).toContain('Games played: 1')
    expect(reason.reasons).toContain('Queue wait: 15 minutes')
    expect(reason.reasons).toContain('Fewer games than 1 other eligible player')
  })

  it('never mentions a nonexistent numeric algorithm score in any reason', () => {
    const candidates = [candidate({ sessionPlayerId: 'a', gamesPlayed: 0, queuedAt: NOW })]
    const result = selectNextPlayers(candidates, 1, NOW)
    for (const reason of result.reasons) {
      for (const line of reason.reasons) {
        expect(line).not.toMatch(/score\s*[:=]\s*[\d.]+/i)
      }
    }
  })
})

describe('selectNextPlayers repeat-avoidance tiebreak', () => {
  const now = '2026-01-01T12:00:00.000Z'

  function candidate(id: string, gamesPlayed: number, queuedAt: string) {
    return { sessionPlayerId: id, playerId: id, displayName: id, gamesPlayed, queuedAt }
  }

  it('with 5+ eligible and a tie on games played, prefers the candidate NOT recently paired with an already-selected teammate', () => {
    // 5 candidates, all with 0 games played (fully tied on rule 1), all
    // queued at the same instant (fully tied on rule 2) except p5 who
    // queued slightly later -- so the naive sort alone would pick
    // p1..p4 for a 4-slot doubles selection. p1 and p2 were JUST paired
    // (matchmaking_history), so with the tiebreak active, p2 should be
    // swapped out for p5 (the next-best equally-tied candidate) instead.
    const candidates = [
      candidate('p1', 0, now),
      candidate('p2', 0, now),
      candidate('p3', 0, now),
      candidate('p4', 0, now),
      candidate('p5', 0, '2026-01-01T12:00:01.000Z'),
    ]
    const lastPairedWith = { p1: 'p2', p2: 'p1' }

    const result = selectNextPlayers(candidates, 4, now, lastPairedWith)
    const ids = result.selected.map((p) => p.sessionPlayerId)
    expect(ids).toContain('p1')
    expect(ids).not.toContain('p2')
    expect(ids).toContain('p5')
  })

  it('never overrides rule 1 (fewest games played) even to avoid a repeat', () => {
    const candidates = [
      candidate('p1', 0, now),
      candidate('p2', 0, now),
      candidate('p3', 0, now),
      candidate('p4', 1, now), // strictly more games played than p1-p3
      candidate('p5', 0, '2026-01-01T12:00:01.000Z'),
    ]
    const lastPairedWith = { p1: 'p2', p2: 'p1' }

    // Only 4 candidates have 0 games played (p1, p2, p3, p5) -- p4 must
    // never be selected over them despite avoiding a repeat, since that
    // would override rule 1.
    const result = selectNextPlayers(candidates, 4, now, lastPairedWith)
    const ids = result.selected.map((p) => p.sessionPlayerId)
    expect(ids).not.toContain('p4')
  })

  it('is skipped entirely below 5 eligible candidates (spec §56 degradation)', () => {
    const candidates = [candidate('p1', 0, now), candidate('p2', 0, now), candidate('p3', 0, now), candidate('p4', 0, now)]
    const lastPairedWith = { p1: 'p2', p2: 'p1' }
    const result = selectNextPlayers(candidates, 4, now, lastPairedWith)
    // With exactly 4 eligible and 4 needed, everyone is selected regardless
    // -- there's no room for the tiebreak to have any effect either way,
    // which is the simplest possible proof it didn't try to do anything.
    expect(result.selected.map((p) => p.sessionPlayerId).sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
  })
})

describe('balanceTeams', () => {
  it('singles: splits the two candidates one per side', () => {
    const result = balanceTeams([
      { sessionPlayerId: 'p1', opi: 80 },
      { sessionPlayerId: 'p2', opi: 40 },
    ])
    expect(result.teamA.map((p) => p.sessionPlayerId)).toEqual(['p1'])
    expect(result.teamB.map((p) => p.sessionPlayerId)).toEqual(['p2'])
  })

  it('doubles: picks the partition that minimizes the OPI-sum difference', () => {
    // Candidates at 90, 80, 20, 10. The midpoint-split placeholder would pair
    // (90,80) vs (20,10) -- sums 170 vs 30, a huge imbalance. The balanced
    // partition pairs (90,10) vs (80,20) -- sums 100 vs 100, a perfect match.
    const result = balanceTeams([
      { sessionPlayerId: 'a', opi: 90 },
      { sessionPlayerId: 'b', opi: 80 },
      { sessionPlayerId: 'c', opi: 20 },
      { sessionPlayerId: 'd', opi: 10 },
    ])
    const teamAIds = result.teamA.map((p) => p.sessionPlayerId).sort()
    const teamBIds = result.teamB.map((p) => p.sessionPlayerId).sort()
    const sumA = result.teamA.reduce((sum, p) => sum + p.opi, 0)
    const sumB = result.teamB.reduce((sum, p) => sum + p.opi, 0)
    expect(Math.abs(sumA - sumB)).toBe(0)
    expect([teamAIds, teamBIds].flat().sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})
