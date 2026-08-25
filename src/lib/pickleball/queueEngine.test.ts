import { describe, it, expect } from 'vitest'
import { selectNextPlayers } from './queueEngine'

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
