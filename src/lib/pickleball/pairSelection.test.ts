import { describe, it, expect } from 'vitest'
import { selectNextPairs, type PairCandidate } from './pairSelection'

const NOW = '2026-08-25T18:30:00.000Z'

function pair(overrides: Partial<PairCandidate> & { sessionPairId: string }): PairCandidate {
  return {
    sessionPairId: overrides.sessionPairId,
    memberSessionPlayerIds: overrides.memberSessionPlayerIds ?? [`${overrides.sessionPairId}-a`, `${overrides.sessionPairId}-b`],
    displayName: overrides.displayName ?? overrides.sessionPairId,
    gamesPlayed: overrides.gamesPlayed ?? 0,
    queuedAt: overrides.queuedAt ?? NOW,
  }
}

describe('selectNextPairs', () => {
  it('prefers fewer games played over longer wait', () => {
    const candidates = [
      pair({ sessionPairId: 'a', gamesPlayed: 3, queuedAt: '2026-08-25T18:00:00.000Z' }),
      pair({ sessionPairId: 'b', gamesPlayed: 1, queuedAt: '2026-08-25T18:20:00.000Z' }),
    ]
    const result = selectNextPairs(candidates, 1, NOW)
    expect(result.selected.map((p) => p.sessionPairId)).toEqual(['b'])
  })

  it('breaks ties on games played by longest wait first', () => {
    const candidates = [
      pair({ sessionPairId: 'a', gamesPlayed: 2, queuedAt: '2026-08-25T18:10:00.000Z' }),
      pair({ sessionPairId: 'b', gamesPlayed: 2, queuedAt: '2026-08-25T18:00:00.000Z' }),
    ]
    const result = selectNextPairs(candidates, 1, NOW)
    expect(result.selected.map((p) => p.sessionPairId)).toEqual(['b'])
  })

  it('returns exactly count pairs when enough are eligible, or an empty selection with a shortfall reason when not', () => {
    const enough = [
      pair({ sessionPairId: 'p1', gamesPlayed: 0 }),
      pair({ sessionPairId: 'p2', gamesPlayed: 1 }),
      pair({ sessionPairId: 'p3', gamesPlayed: 2 }),
    ]
    const enoughResult = selectNextPairs(enough, 2, NOW)
    expect(enoughResult.selected).toHaveLength(2)
    expect(enoughResult.selected.map((p) => p.sessionPairId)).toEqual(['p1', 'p2'])
    expect(enoughResult.shortfall).toBeNull()

    const short = [pair({ sessionPairId: 'only' })]
    const shortResult = selectNextPairs(short, 2, NOW)
    expect(shortResult.selected).toEqual([])
    expect(shortResult.reasons).toEqual([])
    expect(shortResult.shortfall).toBe('Not enough eligible pairs (need 2, have 1).')
  })

  it('repeat-avoidance: with 3+ eligible pairs, swaps the second pair for the next one on the same gamesPlayed when the top two just played each other', () => {
    const candidates = [
      pair({ sessionPairId: 'p1', gamesPlayed: 0 }),
      pair({ sessionPairId: 'p2', gamesPlayed: 0 }),
      pair({ sessionPairId: 'p3', gamesPlayed: 0 }),
    ]
    const lastOpponentPairId = { p1: 'p2', p2: 'p1' }
    const result = selectNextPairs(candidates, 2, NOW, lastOpponentPairId)
    const ids = result.selected.map((p) => p.sessionPairId)
    expect(ids).toContain('p1')
    expect(ids).toContain('p3')
    expect(ids).not.toContain('p2')
  })

  it('skips repeat-avoidance entirely below 3 eligible pairs, returning the top two even if they just played', () => {
    const candidates = [pair({ sessionPairId: 'p1', gamesPlayed: 0 }), pair({ sessionPairId: 'p2', gamesPlayed: 0 })]
    const lastOpponentPairId = { p1: 'p2', p2: 'p1' }
    const result = selectNextPairs(candidates, 2, NOW, lastOpponentPairId)
    expect(result.selected.map((p) => p.sessionPairId).sort()).toEqual(['p1', 'p2'])
  })

  it('never overrides rule 1: a pair on more games is never selected over one on fewer, even to avoid a repeat', () => {
    const candidates = [
      pair({ sessionPairId: 'p1', gamesPlayed: 0 }),
      pair({ sessionPairId: 'p2', gamesPlayed: 0 }),
      pair({ sessionPairId: 'p3', gamesPlayed: 1 }), // strictly more games than p1/p2
    ]
    const lastOpponentPairId = { p1: 'p2', p2: 'p1' }
    // Only p1 and p2 have the fewest games played; there is no third pair
    // tied on 0 games to swap in, so p3 (more games) must never be pulled in
    // just to dodge the repeat -- the repeat pair is kept instead.
    const result = selectNextPairs(candidates, 2, NOW, lastOpponentPairId)
    const ids = result.selected.map((p) => p.sessionPairId)
    expect(ids).not.toContain('p3')
    expect(ids.sort()).toEqual(['p1', 'p2'])
  })

  it('returns reasons per selected pair that name the real deciding field', () => {
    const candidates = [
      pair({ sessionPairId: 'a', gamesPlayed: 1, queuedAt: '2026-08-25T18:15:00.000Z' }),
      pair({ sessionPairId: 'b', gamesPlayed: 3, queuedAt: '2026-08-25T18:00:00.000Z' }),
    ]
    const result = selectNextPairs(candidates, 1, NOW)
    const reason = result.reasons.find((r) => r.sessionPairId === 'a')!
    expect(reason.reasons).toContain('Games played: 1')
    expect(reason.reasons).toContain('Waiting 15 min')
    expect(reason.reasons).toContain('Fewest games played of the eligible pairs')
  })

  it('does not mutate the input candidates array', () => {
    const candidates = [
      pair({ sessionPairId: 'b', gamesPlayed: 2, queuedAt: '2026-08-25T18:00:00.000Z' }),
      pair({ sessionPairId: 'a', gamesPlayed: 1, queuedAt: '2026-08-25T18:10:00.000Z' }),
    ]
    const snapshot = JSON.parse(JSON.stringify(candidates))
    selectNextPairs(candidates, 1, NOW)
    expect(candidates).toEqual(snapshot)
  })

  it('is deterministic: the same input produces the same output across repeated calls', () => {
    const candidates = [
      pair({ sessionPairId: 'p1', gamesPlayed: 0 }),
      pair({ sessionPairId: 'p2', gamesPlayed: 0 }),
      pair({ sessionPairId: 'p3', gamesPlayed: 0 }),
    ]
    const lastOpponentPairId = { p1: 'p2', p2: 'p1' }
    const first = selectNextPairs(candidates, 2, NOW, lastOpponentPairId)
    const second = selectNextPairs(candidates, 2, NOW, lastOpponentPairId)
    expect(second).toEqual(first)
  })
})
