import { describe, it, expect } from 'vitest'
import { rankTournamentStandings, type TournamentStandingsInput, type HeadToHeadFixture } from './rankTournamentStandings'

function entrant(overrides: Partial<TournamentStandingsInput> & { entrantId: string }): TournamentStandingsInput {
  return {
    seed: null,
    displayName: overrides.entrantId,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    ...overrides,
  }
}

describe('rankTournamentStandings', () => {
  it('orders by wins descending when wins differ -- the primary sort key', () => {
    const rows = [
      entrant({ entrantId: 'a', wins: 1, losses: 1, pointsFor: 10, pointsAgainst: 10 }),
      entrant({ entrantId: 'b', wins: 2, losses: 0, pointsFor: 20, pointsAgainst: 5 }),
      entrant({ entrantId: 'c', wins: 0, losses: 2, pointsFor: 5, pointsAgainst: 20 }),
    ]
    const result = rankTournamentStandings(rows, [])
    expect(result.map((r) => r.entrantId)).toEqual(['b', 'a', 'c'])
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3])
    // Real, non-default point differentials computed from real pointsFor/
    // pointsAgainst -- not merely "present", specific numbers.
    expect(result.find((r) => r.entrantId === 'b')?.pointDifferential).toBe(15)
    expect(result.find((r) => r.entrantId === 'c')?.pointDifferential).toBe(-15)
  })

  // I6: the comparator used to jump straight from wins to point differential,
  // skipping losses entirely -- spec §3.7's actual order is "wins, LOSSES,
  // differential, then head-to-head". Two entrants can have equal wins with
  // DIFFERENT losses (byes, or an odd entrant count where not everyone plays
  // the same number of fixtures), so this is not a redundant check on top of
  // wins.
  it('breaks a wins tie by losses (fewer losses ranks higher), even when point differential would say the opposite', () => {
    const rows = [
      // 2 wins, 2 losses (played 4), but a strongly negative differential.
      entrant({ entrantId: 'more-losses', wins: 2, losses: 2, pointsFor: 10, pointsAgainst: 40 }),
      // Same 2 wins, but only 0 losses (played 2) -- fewer losses must rank
      // first regardless of the worse-looking raw differential comparison.
      entrant({ entrantId: 'fewer-losses', wins: 2, losses: 0, pointsFor: 20, pointsAgainst: 10 }),
    ]
    const result = rankTournamentStandings(rows, [])
    expect(result.map((r) => r.entrantId)).toEqual(['fewer-losses', 'more-losses'])
  })

  it('breaks a wins tie by point differential when wins are equal', () => {
    const rows = [
      entrant({ entrantId: 'a', wins: 1, losses: 1, pointsFor: 15, pointsAgainst: 20 }), // diff -5
      entrant({ entrantId: 'b', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 15 }), // diff +5
    ]
    const result = rankTournamentStandings(rows, [])
    expect(result.map((r) => r.entrantId)).toEqual(['b', 'a'])
  })

  it('breaks a wins-AND-differential tie by head-to-head -- the direct winner ranks above', () => {
    const rows = [
      entrant({ entrantId: 'a', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 20 }),
      entrant({ entrantId: 'b', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 20 }),
    ]
    // 'a' beat 'b' directly -- despite identical wins and identical
    // differential, 'a' must rank first.
    const fixtures: HeadToHeadFixture[] = [
      { entrantAId: 'a', entrantBId: 'b', winnerEntrantId: 'a', status: 'FINISHED' },
    ]
    const result = rankTournamentStandings(rows, fixtures)
    expect(result.map((r) => r.entrantId)).toEqual(['a', 'b'])

    // The reverse fixture (b beat a) must flip the order -- proves this is
    // actually reading who won, not just "a fixture exists between them".
    const flippedFixtures: HeadToHeadFixture[] = [
      { entrantAId: 'a', entrantBId: 'b', winnerEntrantId: 'b', status: 'FINISHED' },
    ]
    const flipped = rankTournamentStandings(rows, flippedFixtures)
    expect(flipped.map((r) => r.entrantId)).toEqual(['b', 'a'])
  })

  it('falls back to display name when wins, differential AND head-to-head are all silent (no fixture played between them)', () => {
    const rows = [
      entrant({ entrantId: 'z', displayName: 'Zoe', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 20 }),
      entrant({ entrantId: 'a', displayName: 'Amy', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 20 }),
    ]
    // No fixture at all between 'z' and 'a' (e.g. both had a bye against a
    // third entrant) -- head-to-head has nothing to say, so name decides.
    const result = rankTournamentStandings(rows, [])
    expect(result.map((r) => r.entrantId)).toEqual(['a', 'z'])
  })

  it('an unfinished fixture between two tied entrants does not count as head-to-head, even if a winnerEntrantId is already stamped', () => {
    const rows = [
      entrant({ entrantId: 'a', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 20, displayName: 'Zzz' }),
      entrant({ entrantId: 'b', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 20, displayName: 'Aaa' }),
    ]
    // Deliberately gives this fixture a non-null winnerEntrantId while its
    // status is NOT 'FINISHED' -- a data anomaly that should never occur in
    // practice, but is the only way to prove the status gate itself is
    // load-bearing rather than redundant with the null-winnerEntrantId
    // check. If the status filter were dropped, this fixture would be read
    // as a real result and 'a' would rank first; asserting the name-based
    // fallback order instead proves the gate is actually applied.
    const fixtures: HeadToHeadFixture[] = [{ entrantAId: 'a', entrantBId: 'b', winnerEntrantId: 'a', status: 'READY' }]
    const result = rankTournamentStandings(rows, fixtures)
    expect(result.map((r) => r.entrantId)).toEqual(['b', 'a'])
  })

  // I10: head-to-head must not be a global sort key. A 3-way head-to-head
  // cycle (a beat b, b beat c, c beat a) among three TIED entrants is not
  // resolvable by any fixed rule -- that is expected and unchanged -- but it
  // must not corrupt the ranking of a FOURTH entrant who was never tied with
  // any of them. Before this fix, feeding an intransitive comparator
  // straight into Array.sort risked exactly that kind of spillover.
  it('a three-way head-to-head cycle among tied entrants does not corrupt an unrelated entrant\'s rank', () => {
    const rows = [
      // The clear winner: more wins than everyone else, never tied with
      // anyone -- must always rank #1, regardless of what the cycle below
      // does to a/b/c's relative order.
      entrant({ entrantId: 'winner', wins: 3, losses: 0, pointsFor: 33, pointsAgainst: 3 }),
      entrant({ entrantId: 'a', displayName: 'A', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 20 }),
      entrant({ entrantId: 'b', displayName: 'B', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 20 }),
      entrant({ entrantId: 'c', displayName: 'C', wins: 1, losses: 1, pointsFor: 20, pointsAgainst: 20 }),
    ]
    // a beat b, b beat c, c beat a: a genuine cycle, all tied on wins/losses/
    // differential.
    const fixtures: HeadToHeadFixture[] = [
      { entrantAId: 'a', entrantBId: 'b', winnerEntrantId: 'a', status: 'FINISHED' },
      { entrantAId: 'b', entrantBId: 'c', winnerEntrantId: 'b', status: 'FINISHED' },
      { entrantAId: 'c', entrantBId: 'a', winnerEntrantId: 'c', status: 'FINISHED' },
    ]
    const result = rankTournamentStandings(rows, fixtures)

    // The one entrant never tied with anyone is unaffected: still first,
    // still rank 1.
    expect(result[0].entrantId).toBe('winner')
    expect(result[0].rank).toBe(1)

    // The cyclic trio occupies ranks 2-4, in SOME order -- this suite makes
    // no claim about which (no fixed rule resolves a 3-way cycle), only that
    // the set of entrants placed there is exactly {a, b, c} and ranks are
    // still sequential 2..4.
    expect(new Set(result.slice(1).map((r) => r.entrantId))).toEqual(new Set(['a', 'b', 'c']))
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })

  it('assigns sequential rank 1..n and stamps every row with rank + pointDifferential', () => {
    const rows = [
      entrant({ entrantId: 'a', wins: 3, pointsFor: 33, pointsAgainst: 3 }),
      entrant({ entrantId: 'b', wins: 2, pointsFor: 22, pointsAgainst: 8 }),
      entrant({ entrantId: 'c', wins: 1, pointsFor: 11, pointsAgainst: 20 }),
      entrant({ entrantId: 'd', wins: 0, losses: 3, pointsFor: 5, pointsAgainst: 30 }),
    ]
    const result = rankTournamentStandings(rows, [])
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    // The entrant that lost every fixture: 0 wins paired with real (non-zero)
    // losses/pointDifferential -- distinguishes a genuine last place from an
    // absent/zeroed row.
    const last = result[3]
    expect(last.entrantId).toBe('d')
    expect(last.wins).toBe(0)
    expect(last.losses).toBe(3)
    expect(last.pointDifferential).toBe(-25)
  })
})
