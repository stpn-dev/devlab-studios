import { describe, it, expect } from 'vitest'
import { seedEntrants, type SeedCandidate } from './seeding'

describe('seedEntrants', () => {
  it('orders by OPI descending; seed 1 is the highest OPI', () => {
    const candidates: SeedCandidate[] = [
      { entrantId: 'low', displayName: 'Low', opi: 10 },
      { entrantId: 'high', displayName: 'High', opi: 90 },
      { entrantId: 'mid', displayName: 'Mid', opi: 50 },
    ]
    const result = seedEntrants(candidates)
    expect(result).toEqual([
      { entrantId: 'high', seed: 1 },
      { entrantId: 'mid', seed: 2 },
      { entrantId: 'low', seed: 3 },
    ])
  })

  it('a null OPI (no history) sorts last, never as zero', () => {
    // If null were coerced to 0, this would sort BEFORE the real -10 OPI,
    // since -10 < 0. The correct behaviour is null always sorts last
    // regardless of how negative a real OPI is -- matching rankStandings'
    // convention that an unplayed entrant is not "worth zero".
    const candidates: SeedCandidate[] = [
      { entrantId: 'a', displayName: 'Alice', opi: -10 },
      { entrantId: 'b', displayName: 'Bob', opi: null },
    ]
    const result = seedEntrants(candidates)
    expect(result.map((r) => r.entrantId)).toEqual(['a', 'b'])
  })

  it('ties break by displayName, independent of input order', () => {
    const candidates: SeedCandidate[] = [
      { entrantId: 'z', displayName: 'Zoe', opi: 50 },
      { entrantId: 'a', displayName: 'Amy', opi: 50 },
    ]
    const result = seedEntrants(candidates)
    expect(result.map((r) => r.entrantId)).toEqual(['a', 'z'])

    const reversed = seedEntrants([...candidates].reverse())
    expect(reversed.map((r) => r.entrantId)).toEqual(['a', 'z'])
  })

  it('seeds are 1..n with no gaps or duplicates', () => {
    const candidates: SeedCandidate[] = Array.from({ length: 5 }, (_, i) => ({
      entrantId: `e${i}`,
      displayName: `Player ${i}`,
      opi: i * 10,
    }))
    const result = seedEntrants(candidates)
    expect(result.map((r) => r.seed)).toEqual([1, 2, 3, 4, 5])
  })

  it('empty input returns empty', () => {
    expect(seedEntrants([])).toEqual([])
  })
})
