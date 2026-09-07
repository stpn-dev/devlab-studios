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

  it('is a no-op when there are too few candidates for a repeat-avoidance swap to have anything to draw from', () => {
    // With exactly 2 eligible pairs and count=2, both are already selected --
    // there is no candidate left outside the selection for the swap loop to
    // draw a replacement from, so a mutual "just played" conflict is left as
    // is. This is not gated by an explicit threshold constant (see the
    // comment above selectNextPairs): a hand proof plus a 2,000,000-case
    // randomised brute-force check (both done before writing this file)
    // showed an explicit "too few pairs" gate could never independently
    // change the outcome once the swap loop resolves every conflict, because
    // the shortfall check above already guarantees sorted.length >= count,
    // so "too few pairs" can only mean sorted.length === count here -- i.e.
    // zero pairs left over regardless of any gate. This test instead pins
    // the real invariant: the swap loop's own `!selectedIds.has(...)`
    // exclusion is what keeps a pair from being "replaced" by itself. Delete
    // that exclusion and this test catches it: the search would then accept
    // p1 as its own replacement (nothing else stops it), producing a
    // duplicate ['p1', 'p1'] instead of ['p1', 'p2'].
    const candidates = [pair({ sessionPairId: 'p1', gamesPlayed: 0 }), pair({ sessionPairId: 'p2', gamesPlayed: 0 })]
    const lastOpponentPairId = { p1: 'p2', p2: 'p1' }
    const result = selectNextPairs(candidates, 2, NOW, lastOpponentPairId)
    expect(result.selected.map((p) => p.sessionPairId).sort()).toEqual(['p1', 'p2'])
  })

  it('resolves every conflicting slot in a larger selection, never introducing a fresh repeat against a different selected pair', () => {
    // Selected = [p0, p1, p2, p3] (count=4). Two INDEPENDENT conflicts:
    // p0<->p1 and p2<->p3. p4 is a trap: it did NOT just play p0 (the
    // top-ranked pair), so a guard that (incorrectly) compares a candidate's
    // last opponent only against `selected[0]` would wrongly accept it as
    // p3's replacement -- even though p4's real last opponent is p2, who
    // stays selected, which would silently swap one repeat for a new one.
    // p5 and p6 are clean (no recent-opponent conflicts) and are the only
    // valid replacements once the trap is correctly rejected.
    const candidates = [
      pair({ sessionPairId: 'p0', gamesPlayed: 0, queuedAt: '2026-08-25T18:00:00.000Z' }),
      pair({ sessionPairId: 'p1', gamesPlayed: 0, queuedAt: '2026-08-25T18:00:01.000Z' }),
      pair({ sessionPairId: 'p2', gamesPlayed: 0, queuedAt: '2026-08-25T18:00:02.000Z' }),
      pair({ sessionPairId: 'p3', gamesPlayed: 0, queuedAt: '2026-08-25T18:00:03.000Z' }),
      pair({ sessionPairId: 'p4', gamesPlayed: 0, queuedAt: '2026-08-25T18:00:04.000Z' }),
      pair({ sessionPairId: 'p5', gamesPlayed: 0, queuedAt: '2026-08-25T18:00:05.000Z' }),
      pair({ sessionPairId: 'p6', gamesPlayed: 0, queuedAt: '2026-08-25T18:00:06.000Z' }),
    ]
    const lastOpponentPairId: Record<string, string> = {
      p0: 'p1',
      p1: 'p0',
      p2: 'p3',
      p3: 'p2',
      p4: 'p2', // trap: conflicts with p2 (still selected), not with selected[0]
    }
    const result = selectNextPairs(candidates, 4, NOW, lastOpponentPairId)
    const ids = result.selected.map((p) => p.sessionPairId)
    const idSet = new Set(ids)

    // Both original conflicts are gone from the selection.
    expect(ids).not.toContain('p1')
    expect(ids).not.toContain('p3')
    // The trap was rejected: p4 must not have been drawn in, since it would
    // introduce a fresh repeat against p2 (still selected).
    expect(ids).not.toContain('p4')
    expect(ids.sort()).toEqual(['p0', 'p2', 'p5', 'p6'])

    // General invariant: no selected pair's last opponent is also selected.
    for (const id of ids) {
      const opponent = lastOpponentPairId[id]
      if (opponent) expect(idSet.has(opponent)).toBe(false)
    }
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
