import { describe, it, expect } from 'vitest'
import { generateFixtures, type SeededEntrant, type GeneratedFixture } from './generateFixtures'

function entrants(n: number): SeededEntrant[] {
  return Array.from({ length: n }, (_, i) => ({ entrantId: `e${i + 1}`, seed: i + 1 }))
}

function bracket(n: number): GeneratedFixture[] {
  return generateFixtures('SINGLE_ELIMINATION', entrants(n))
}

function byKey(fixtures: GeneratedFixture[]): Map<string, GeneratedFixture> {
  return new Map(fixtures.map((f) => [f.key, f]))
}

// Plays the bracket through by always advancing the LOWER-numbered entrant
// (e2 beats e10), which for these seedings means the favourite always wins --
// so the champion is predictable and a mis-wired bracket shows up as the
// wrong winner rather than as a crash.
function playOut(fixtures: GeneratedFixture[]): string {
  const state = fixtures.map((f) => ({ ...f }))
  const index = byKey(state as GeneratedFixture[])
  const seedOf = (id: string) => Number(id.slice(1))

  let champion: string | null = null
  // Rounds ascend, so a single forward pass resolves every dependency: a
  // fixture's feeders are always in an earlier round.
  const rounds = [...new Set(state.map((f) => f.roundNumber))].sort((a, b) => a - b)
  for (const round of rounds) {
    for (const fixture of state.filter((f) => f.roundNumber === round)) {
      if (!fixture.entrantAId || !fixture.entrantBId) {
        throw new Error(`fixture ${fixture.key} had an empty side when its round came up`)
      }
      const winner = seedOf(fixture.entrantAId) < seedOf(fixture.entrantBId) ? fixture.entrantAId : fixture.entrantBId
      champion = winner

      const token = `WINNER_OF:${fixture.key}`
      for (const downstream of state) {
        if (downstream.sourceA === token) downstream.entrantAId = winner
        if (downstream.sourceB === token) downstream.entrantBId = winner
      }
      void index
    }
  }
  return champion as string
}

describe('generateFixtures — SINGLE_ELIMINATION', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 17, 31, 32])('n=%i produces exactly n-1 fixtures', (n) => {
    expect(bracket(n)).toHaveLength(n - 1)
  })

  it('emits no BYE-status fixtures — a bye is advanced, never listed as a match', () => {
    for (const n of [3, 5, 6, 7, 9, 12, 17]) {
      expect(bracket(n).some((f) => f.status === 'BYE')).toBe(false)
    }
  })

  it('a power-of-two bracket has no pre-filled later-round slots (nobody gets a bye)', () => {
    for (const n of [2, 4, 8, 16]) {
      const later = bracket(n).filter((f) => f.roundNumber > 1)
      expect(later.every((f) => f.entrantAId === null && f.entrantBId === null)).toBe(true)
    }
  })

  it('byes go to the TOP seeds: with n=5, seeds 1-3 skip round one and seeds 4-5 play it', () => {
    const fixtures = bracket(5)
    const roundOne = fixtures.filter((f) => f.roundNumber === 1)
    expect(roundOne).toHaveLength(1)

    const playing = [roundOne[0].entrantAId, roundOne[0].entrantBId].sort()
    expect(playing).toEqual(['e4', 'e5'])

    // The three byes appear pre-filled in round two, not as fixtures.
    const preFilled = fixtures
      .filter((f) => f.roundNumber === 2)
      .flatMap((f) => [f.entrantAId, f.entrantBId])
      .filter((id): id is string => id !== null)
      .sort()
    expect(preFilled).toEqual(['e1', 'e2', 'e3'])
  })

  it('the top two seeds are in opposite halves, so they can only meet in the final', () => {
    // With n=8 the bracket is 8 wide: positions 0-1 are the top half, 2-3 the
    // bottom. Seeds 1 and 2 must not share a half.
    const roundOne = bracket(8).filter((f) => f.roundNumber === 1)
    const halfOf = (entrantId: string) => {
      const fixture = roundOne.find((f) => f.entrantAId === entrantId || f.entrantBId === entrantId)!
      return fixture.position < roundOne.length / 2 ? 'top' : 'bottom'
    }
    expect(halfOf('e1')).not.toBe(halfOf('e2'))
  })

  it('seed 1 is paired against the weakest opponent in round one', () => {
    const roundOne = bracket(8).filter((f) => f.roundNumber === 1)
    const seedOnesMatch = roundOne.find((f) => f.entrantAId === 'e1' || f.entrantBId === 'e1')!
    const opponent = seedOnesMatch.entrantAId === 'e1' ? seedOnesMatch.entrantBId : seedOnesMatch.entrantAId
    expect(opponent).toBe('e8')
  })

  it('every entrant appears exactly once across the whole first round plus the byes', () => {
    for (const n of [5, 6, 7, 9, 12]) {
      const fixtures = bracket(n)
      const appearances = fixtures
        .filter((f) => f.entrantAId !== null || f.entrantBId !== null)
        .flatMap((f) => [f.entrantAId, f.entrantBId])
        .filter((id): id is string => id !== null)

      expect(appearances.slice().sort()).toEqual(entrants(n).map((e) => e.entrantId).sort())
    }
  })

  it('every non-final fixture feeds exactly one later slot, and the final feeds none', () => {
    for (const n of [4, 5, 8, 12]) {
      const fixtures = bracket(n)
      const maxRound = Math.max(...fixtures.map((f) => f.roundNumber))
      const finals = fixtures.filter((f) => f.roundNumber === maxRound)
      expect(finals).toHaveLength(1)

      for (const fixture of fixtures) {
        const consumers = fixtures.filter(
          (other) => other.sourceA === `WINNER_OF:${fixture.key}` || other.sourceB === `WINNER_OF:${fixture.key}`,
        )
        expect(consumers).toHaveLength(fixture.key === finals[0].key ? 0 : 1)
      }
    }
  })

  it('every source points at a fixture that actually exists', () => {
    for (const n of [3, 5, 7, 9, 12, 17]) {
      const fixtures = bracket(n)
      const keys = new Set(fixtures.map((f) => f.key))
      for (const fixture of fixtures) {
        for (const source of [fixture.sourceA, fixture.sourceB]) {
          if (source === null) continue
          expect(keys.has(source.replace('WINNER_OF:', ''))).toBe(true)
        }
      }
    }
  })

  it('a fixture is READY exactly when both its sides are known, PENDING otherwise', () => {
    for (const n of [3, 5, 6, 8, 12]) {
      for (const fixture of bracket(n)) {
        const bothKnown = fixture.entrantAId !== null && fixture.entrantBId !== null
        expect(fixture.status).toBe(bothKnown ? 'READY' : 'PENDING')
      }
    }
  })

  it('two byes meeting in round two is READY from the start, not left waiting', () => {
    // n=5 in an 8 bracket: seeds 2 and 3 both get byes and meet each other.
    const readyRoundTwo = bracket(5).filter((f) => f.roundNumber === 2 && f.status === 'READY')
    expect(readyRoundTwo).toHaveLength(1)
    expect([readyRoundTwo[0].entrantAId, readyRoundTwo[0].entrantBId].sort()).toEqual(['e2', 'e3'])
  })

  it('slot keys are unique, so persistence cannot collapse two fixtures into one', () => {
    for (const n of [2, 3, 5, 7, 9, 16, 17]) {
      const keys = bracket(n).map((f) => f.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('playing the bracket out never reaches a fixture with an empty side, and the top seed wins', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 17]) {
      expect(playOut(bracket(n))).toBe('e1')
    }
  })

  it('is insensitive to the order entrants are supplied in', () => {
    const forward = bracket(6)
    const shuffled = generateFixtures('SINGLE_ELIMINATION', [...entrants(6)].reverse())
    expect(shuffled).toEqual(forward)
  })

  it('fewer than two entrants produces no bracket rather than a one-sided fixture', () => {
    expect(generateFixtures('SINGLE_ELIMINATION', entrants(1))).toEqual([])
    expect(generateFixtures('SINGLE_ELIMINATION', [])).toEqual([])
  })

})
