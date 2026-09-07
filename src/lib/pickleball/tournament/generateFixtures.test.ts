import { describe, it, expect } from 'vitest'
import { generateFixtures, type SeededEntrant, type GeneratedFixture, type TournamentFormat } from './generateFixtures'

function entrants(n: number): SeededEntrant[] {
  return Array.from({ length: n }, (_, i) => ({ entrantId: `e${i + 1}`, seed: i + 1 }))
}

// Every unordered pair of entrant ids across the whole fixture set, as a
// sorted-key string, so duplicates and omissions both show up as count
// mismatches rather than needing eyeballing.
function pairKeys(fixtures: GeneratedFixture[]): string[] {
  return fixtures.map((f) => [f.entrantAId, f.entrantBId].sort().join('|'))
}

describe('generateFixtures — ROUND_ROBIN', () => {
  it('n=4 produces exactly 6 fixtures (n(n-1)/2)', () => {
    const fixtures = generateFixtures('ROUND_ROBIN', entrants(4))
    expect(fixtures).toHaveLength(6)
  })

  it('every pair of entrants meets exactly once, checked over the full set', () => {
    const n = 6
    const fixtures = generateFixtures('ROUND_ROBIN', entrants(n))
    const keys = pairKeys(fixtures)

    // Full expected combination set, independent of generation order.
    const expectedKeys: string[] = []
    for (let i = 1; i <= n; i++) {
      for (let j = i + 1; j <= n; j++) {
        expectedKeys.push([`e${i}`, `e${j}`].sort().join('|'))
      }
    }

    expect(keys.slice().sort()).toEqual(expectedKeys.sort())
    // No pair repeated: a naive cross-product generator would emit each
    // ordered pair (including both A-vs-B and B-vs-A) and this catches it.
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('no fixture has an entrant playing itself', () => {
    const fixtures = generateFixtures('ROUND_ROBIN', entrants(5))
    for (const f of fixtures) {
      expect(f.entrantAId).not.toBe(f.entrantBId)
    }
  })

  it('no entrant appears twice in the same round', () => {
    const fixtures = generateFixtures('ROUND_ROBIN', entrants(8))
    const byRound = new Map<number, string[]>()
    for (const f of fixtures) {
      const list = byRound.get(f.roundNumber) ?? []
      list.push(f.entrantAId as string, f.entrantBId as string)
      byRound.set(f.roundNumber, list)
    }
    for (const [, ids] of byRound) {
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('round count is n-1 for even n', () => {
    const fixtures = generateFixtures('ROUND_ROBIN', entrants(6))
    const rounds = new Set(fixtures.map((f) => f.roundNumber))
    expect(rounds.size).toBe(5)
    expect(Math.max(...rounds)).toBe(5)
  })

  it('round count is n for odd n', () => {
    const fixtures = generateFixtures('ROUND_ROBIN', entrants(5))
    const rounds = new Set(fixtures.map((f) => f.roundNumber))
    expect(rounds.size).toBe(5)
    expect(Math.max(...rounds)).toBe(5)
  })

  it('n=5 (odd): every entrant sits out exactly once, and total is still n(n-1)/2', () => {
    const n = 5
    const fixtures = generateFixtures('ROUND_ROBIN', entrants(n))
    expect(fixtures).toHaveLength((n * (n - 1)) / 2)

    const rounds = new Set(fixtures.map((f) => f.roundNumber))
    const playedCount: Record<string, number> = {}
    for (let i = 1; i <= n; i++) playedCount[`e${i}`] = 0
    for (const f of fixtures) {
      playedCount[f.entrantAId as string] += 1
      playedCount[f.entrantBId as string] += 1
    }
    for (let i = 1; i <= n; i++) {
      const sitsOut = rounds.size - playedCount[`e${i}`]
      expect(sitsOut).toBe(1)
    }
  })

  it('n=2 produces exactly 1 fixture', () => {
    const fixtures = generateFixtures('ROUND_ROBIN', entrants(2))
    expect(fixtures).toHaveLength(1)
  })

  it('n=1 and n=0 produce no fixtures rather than throwing', () => {
    expect(generateFixtures('ROUND_ROBIN', entrants(1))).toEqual([])
    expect(generateFixtures('ROUND_ROBIN', entrants(0))).toEqual([])
  })

  it('all fixtures carry the round-robin-known-up-front shape', () => {
    const fixtures = generateFixtures('ROUND_ROBIN', entrants(4))
    for (const f of fixtures) {
      expect(f.bracket).toBe('MAIN')
      expect(f.poolLabel).toBeNull()
      expect(f.sourceA).toBeNull()
      expect(f.sourceB).toBeNull()
      expect(f.status).toBe('READY')
    }
  })

  it('is deterministic and position is unique within each round', () => {
    const input = entrants(6)
    const first = generateFixtures('ROUND_ROBIN', input)
    const second = generateFixtures('ROUND_ROBIN', input)
    expect(second).toEqual(first)

    const byRound = new Map<number, number[]>()
    for (const f of first) {
      const list = byRound.get(f.roundNumber) ?? []
      list.push(f.position)
      byRound.set(f.roundNumber, list)
    }
    for (const [, positions] of byRound) {
      expect(new Set(positions).size).toBe(positions.length)
    }
  })

  it('throws for each unsupported format, naming it', () => {
    const unsupported: TournamentFormat[] = ['SINGLE_ELIMINATION', 'POOL_TO_BRACKET', 'DOUBLE_ELIMINATION']
    for (const format of unsupported) {
      expect(() => generateFixtures(format, entrants(4))).toThrow(format)
    }
  })

  it('does not mutate the input entrants array', () => {
    const input = entrants(4)
    const snapshot = JSON.parse(JSON.stringify(input))
    generateFixtures('ROUND_ROBIN', input)
    expect(input).toEqual(snapshot)
  })
})
