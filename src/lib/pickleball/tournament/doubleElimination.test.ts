import { describe, it, expect } from 'vitest'
import { generateFixtures, minimumEntrants, type SeededEntrant, type GeneratedFixture } from './generateFixtures'

function entrants(n: number): SeededEntrant[] {
  return Array.from({ length: n }, (_, i) => ({ entrantId: `e${i + 1}`, seed: i + 1 }))
}

const draw = (n: number) => generateFixtures('DOUBLE_ELIMINATION', entrants(n))
const winners = (f: GeneratedFixture[]) => f.filter((x) => x.bracket === 'MAIN')
const losers = (f: GeneratedFixture[]) => f.filter((x) => x.bracket === 'LOSERS')

// Plays the whole draw through, always advancing the lower-numbered entrant,
// and returns the champion. Throws if any fixture is ever reached with a side
// that nothing can fill -- which is the failure mode that matters here: a
// losers bracket wired wrongly does not crash, it just strands a match.
function playOut(all: GeneratedFixture[]): string {
  const state = all.map((f) => ({ ...f, entrantAId: f.entrantAId, entrantBId: f.entrantBId, winner: null as string | null }))
  const seedOf = (id: string) => Number(id.slice(1))

  let progressed = true
  while (progressed) {
    progressed = false
    for (const fixture of state) {
      if (fixture.winner) continue
      if (!fixture.entrantAId || !fixture.entrantBId) continue

      const winner = seedOf(fixture.entrantAId) < seedOf(fixture.entrantBId) ? fixture.entrantAId : fixture.entrantBId
      const loser = winner === fixture.entrantAId ? fixture.entrantBId : fixture.entrantAId
      fixture.winner = winner
      progressed = true

      for (const downstream of state) {
        if (downstream.sourceA === `WINNER_OF:${fixture.key}`) downstream.entrantAId = winner
        if (downstream.sourceB === `WINNER_OF:${fixture.key}`) downstream.entrantBId = winner
        if (downstream.sourceA === `LOSER_OF:${fixture.key}`) downstream.entrantAId = loser
        if (downstream.sourceB === `LOSER_OF:${fixture.key}`) downstream.entrantBId = loser
      }
    }
  }

  const unplayed = state.filter((f) => !f.winner)
  if (unplayed.length > 0) {
    throw new Error(`stranded fixtures: ${unplayed.map((f) => f.key).join(', ')}`)
  }

  // The last match played is the grand final: the highest MAIN round.
  const maxRound = Math.max(...state.filter((f) => f.bracket === 'MAIN').map((f) => f.roundNumber))
  return state.find((f) => f.bracket === 'MAIN' && f.roundNumber === maxRound)!.winner as string
}

describe('generateFixtures — DOUBLE_ELIMINATION', () => {
  it('produces nothing below the format minimum rather than a one-match "double" elimination', () => {
    expect(minimumEntrants('DOUBLE_ELIMINATION')).toBe(3)
    expect(draw(2)).toEqual([])
  })

  it('produces about 2n fixtures — every entrant but one loses exactly twice', () => {
    // A power-of-two field needs 2n-2: n-1 winners-bracket matches, n-2 in the
    // losers bracket, and the grand final.
    for (const n of [4, 8, 16]) {
      expect(draw(n)).toHaveLength(2 * n - 2)
    }
  })

  it('has a losers bracket and a grand final beyond the winners final', () => {
    const fixtures = draw(8)
    expect(losers(fixtures).length).toBeGreaterThan(0)

    const mainRounds = [...new Set(winners(fixtures).map((f) => f.roundNumber))].sort((a, b) => a - b)
    // 3 winners rounds for 8, plus the grand final as a fourth MAIN round.
    expect(mainRounds).toEqual([1, 2, 3, 4])
    expect(winners(fixtures).filter((f) => f.roundNumber === 4)).toHaveLength(1)
  })

  it('feeds the losers bracket from LOSER_OF sources, and the winners bracket never does', () => {
    const fixtures = draw(8)
    for (const fixture of winners(fixtures)) {
      for (const source of [fixture.sourceA, fixture.sourceB]) {
        expect(source?.startsWith('LOSER_OF:') ?? false).toBe(false)
      }
    }
    const losersSources = losers(fixtures).flatMap((f) => [f.sourceA, f.sourceB])
    expect(losersSources.some((s) => s?.startsWith('LOSER_OF:'))).toBe(true)
  })

  it('sends the grand final the winners-bracket champion and the losers-bracket survivor', () => {
    const fixtures = draw(8)
    const grandFinal = winners(fixtures).find((f) => f.roundNumber === 4)!
    const winnersFinal = winners(fixtures).find((f) => f.roundNumber === 3)!

    const sources = [grandFinal.sourceA, grandFinal.sourceB]
    expect(sources).toContain(`WINNER_OF:${winnersFinal.key}`)

    const other = sources.find((s) => s !== `WINNER_OF:${winnersFinal.key}`) as string
    const feeder = fixtures.find((f) => `WINNER_OF:${f.key}` === other)
    expect(feeder?.bracket).toBe('LOSERS')
  })

  it('every source points at a fixture that actually exists', () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9, 12, 16, 17]) {
      const fixtures = draw(n)
      const keys = new Set(fixtures.map((f) => f.key))
      for (const fixture of fixtures) {
        for (const source of [fixture.sourceA, fixture.sourceB]) {
          if (!source) continue
          expect(keys.has(source.replace(/^(WINNER_OF|LOSER_OF):/, ''))).toBe(true)
        }
      }
    }
  })

  it('never emits a match that has only one possible occupant', () => {
    // A collapsed slot (from a bye) must be folded away at generation, not
    // left as a fixture waiting on a loser who will never exist.
    for (const n of [3, 5, 6, 7, 9, 12, 17]) {
      for (const fixture of draw(n)) {
        const sides = [
          fixture.entrantAId ?? fixture.sourceA,
          fixture.entrantBId ?? fixture.sourceB,
        ]
        expect(sides.every(Boolean)).toBe(true)
      }
    }
  })

  it('gives every fixture a unique key across both brackets', () => {
    for (const n of [3, 4, 5, 8, 9, 16, 17]) {
      const keys = draw(n).map((f) => f.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('plays through to a single champion for every field size, stranding nothing', () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9, 12, 16, 17]) {
      expect(playOut(draw(n))).toBe('e1')
    }
  })

  it('gives every entrant a route to the losers bracket after ONE loss, not elimination', () => {
    // The defining property of the format: with 4 entrants, the two who lose
    // in round one must both still appear somewhere in the losers bracket.
    const fixtures = draw(4)
    const roundOneKeys = winners(fixtures)
      .filter((f) => f.roundNumber === 1)
      .map((f) => `LOSER_OF:${f.key}`)

    const losersSources = losers(fixtures).flatMap((f) => [f.sourceA, f.sourceB])
    for (const key of roundOneKeys) {
      expect(losersSources).toContain(key)
    }
  })

  it('drops each winners-bracket loser into the losers bracket exactly once', () => {
    for (const n of [4, 8, 16]) {
      const fixtures = draw(n)
      const allSources = fixtures.flatMap((f) => [f.sourceA, f.sourceB]).filter(Boolean) as string[]
      for (const fixture of winners(fixtures)) {
        const drops = allSources.filter((s) => s === `LOSER_OF:${fixture.key}`)
        // Every winners match drops its loser once -- except the grand final,
        // which drops nobody.
        const isGrandFinal = fixture.roundNumber === Math.log2(nextPow2(n)) + 1
        expect(drops).toHaveLength(isGrandFinal ? 0 : 1)
      }
    }
  })

  it('is insensitive to the order entrants are supplied in', () => {
    expect(generateFixtures('DOUBLE_ELIMINATION', [...entrants(8)].reverse())).toEqual(draw(8))
  })
})

function nextPow2(n: number): number {
  let size = 1
  while (size < n) size *= 2
  return size
}
