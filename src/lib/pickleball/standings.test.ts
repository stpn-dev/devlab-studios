import { describe, expect, it } from 'vitest'
import { rankStandings, type StandingsInput } from './standings'

function row(overrides: Partial<StandingsInput> & { playerId: string; displayName: string }): StandingsInput {
  return {
    eligibleGamesCount: 0,
    opi: null,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    onCourt: false,
    ...overrides,
  }
}

describe('rankStandings', () => {
  it('ranks every attendee from the first moment of a session, before any game finishes', () => {
    const result = rankStandings(
      [row({ playerId: 'p2', displayName: 'Bea' }), row({ playerId: 'p1', displayName: 'Ana' })],
      3,
    )

    expect(result).toHaveLength(2)
    expect(result.map((entry) => entry.displayName)).toEqual(['Ana', 'Bea'])
    expect(result.every((entry) => entry.rank === null)).toBe(true)
    expect(result.every((entry) => entry.qualified === false)).toBe(true)
  })

  it('ranks qualified players by opi descending, breaking ties by display name only', () => {
    const result = rankStandings(
      [
        row({ playerId: 'p1', displayName: 'Zoe', eligibleGamesCount: 3, opi: 58.29 }),
        row({ playerId: 'p2', displayName: 'Ana', eligibleGamesCount: 9, opi: 58.29 }),
        row({ playerId: 'p3', displayName: 'Cy', eligibleGamesCount: 4, opi: 70 }),
      ],
      3,
    )

    expect(result.map((entry) => [entry.displayName, entry.rank])).toEqual([
      ['Cy', 1],
      ['Ana', 2],
      ['Zoe', 3],
    ])
  })

  it('places players below the minimum-games threshold after every ranked player, unranked', () => {
    const result = rankStandings(
      [
        row({ playerId: 'p1', displayName: 'Ana', eligibleGamesCount: 1, opi: 99 }),
        row({ playerId: 'p2', displayName: 'Bea', eligibleGamesCount: 3, opi: 20 }),
        row({ playerId: 'p3', displayName: 'Cy' }),
      ],
      3,
    )

    expect(result.map((entry) => [entry.displayName, entry.rank, entry.qualified])).toEqual([
      ['Bea', 1, true],
      ['Ana', null, false],
      ['Cy', null, false],
    ])
  })

  it('orders unranked players by games played, then opi, then name, so 0-game players sit last', () => {
    const result = rankStandings(
      [
        row({ playerId: 'p1', displayName: 'Ana' }),
        row({ playerId: 'p2', displayName: 'Bea', eligibleGamesCount: 2, opi: 40 }),
        row({ playerId: 'p3', displayName: 'Cy', eligibleGamesCount: 2, opi: 80 }),
        row({ playerId: 'p4', displayName: 'Dee' }),
      ],
      5,
    )

    expect(result.map((entry) => entry.displayName)).toEqual(['Cy', 'Bea', 'Ana', 'Dee'])
  })

  it('never ranks a zero-game player even when the threshold is zero', () => {
    const result = rankStandings(
      [
        row({ playerId: 'p1', displayName: 'Ana' }),
        row({ playerId: 'p2', displayName: 'Bea', eligibleGamesCount: 1, opi: 45 }),
      ],
      0,
    )

    expect(result.map((entry) => [entry.displayName, entry.rank])).toEqual([
      ['Bea', 1],
      ['Ana', null],
    ])
  })

  it('derives point differential and confidence tier from the real per-game totals', () => {
    const [entry] = rankStandings(
      [row({ playerId: 'p1', displayName: 'Ana', eligibleGamesCount: 3, opi: 58.29, wins: 2, losses: 1, pointsFor: 31, pointsAgainst: 23 })],
      3,
    )

    expect(entry.pointDifferential).toBe(8)
    expect(entry.confidenceTier).toBe('DEVELOPING')
  })

  it('keeps a negative differential negative rather than clamping it', () => {
    const [entry] = rankStandings(
      [row({ playerId: 'p1', displayName: 'Ana', eligibleGamesCount: 1, opi: 30, pointsFor: 5, pointsAgainst: 11 })],
      1,
    )

    expect(entry.pointDifferential).toBe(-6)
  })

  it('returns an empty list unchanged', () => {
    expect(rankStandings([], 3)).toEqual([])
  })

  it('does not mutate the input rows', () => {
    const input = [row({ playerId: 'p1', displayName: 'Ana', eligibleGamesCount: 3, opi: 60 })]
    const snapshot = JSON.parse(JSON.stringify(input))

    rankStandings(input, 3)

    expect(input).toEqual(snapshot)
  })
})
