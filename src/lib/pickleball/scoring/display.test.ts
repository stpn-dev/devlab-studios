// src/lib/pickleball/scoring/display.test.ts
import { describe, it, expect } from 'vitest'
import { officialScoreCall, isValidFinalScore, isGamePoint, contextualState } from './display'

const RULESET = { format: 'DOUBLES' as const, targetScore: 11, winBy: 2 }
const SINGLES = { format: 'SINGLES' as const, targetScore: 11, winBy: 2 }

describe('officialScoreCall', () => {
  it('doubles: calls the server\'s own score first, then the third server-number digit', () => {
    expect(officialScoreCall({ scoreA: 7, scoreB: 5, servingTeam: 'A', serverNumber: 2 }, 'DOUBLES')).toBe('7-5-2')
  })

  it('doubles: server\'s score is called first even when Team B is serving', () => {
    expect(officialScoreCall({ scoreA: 7, scoreB: 5, servingTeam: 'B', serverNumber: 1 }, 'DOUBLES')).toBe('5-7-1')
  })

  it('the digit order flips on a side out while scoreA/scoreB themselves never swap', () => {
    const beforeSideOut = { scoreA: 7, scoreB: 5, servingTeam: 'A' as const, serverNumber: 2 as const }
    const afterSideOut = { scoreA: 7, scoreB: 5, servingTeam: 'B' as const, serverNumber: 1 as const }
    expect(officialScoreCall(beforeSideOut, 'DOUBLES')).toBe('7-5-2')
    expect(officialScoreCall(afterSideOut, 'DOUBLES')).toBe('5-7-1')
    expect(afterSideOut.scoreA).toBe(beforeSideOut.scoreA)
    expect(afterSideOut.scoreB).toBe(beforeSideOut.scoreB)
  })

  it('singles: no third digit, no server-number concept', () => {
    expect(officialScoreCall({ scoreA: 7, scoreB: 5, servingTeam: 'A', serverNumber: 1 }, 'SINGLES')).toBe('7-5')
  })
})

describe('isValidFinalScore', () => {
  it.each([
    [11, 7, true],
    [11, 9, true],
    [11, 10, false],
    [12, 10, true],
    [13, 11, true],
    [10, 8, false],
  ])('scoreA=%i scoreB=%i -> %s', (scoreA, scoreB, expected) => {
    expect(isValidFinalScore(scoreA, scoreB, RULESET)).toBe(expected)
  })

  it('never hardcodes 11 -- respects a different targetScore', () => {
    const to15 = { format: 'DOUBLES' as const, targetScore: 15, winBy: 2 }
    expect(isValidFinalScore(11, 7, to15)).toBe(false)
    expect(isValidFinalScore(15, 13, to15)).toBe(true)
  })
})

describe('isGamePoint', () => {
  it('true when the serving team winning one more rally would end the game', () => {
    expect(isGamePoint({ scoreA: 10, scoreB: 6, servingTeam: 'A', serverNumber: 2 }, RULESET)).toBe(true)
  })

  it('false when one more point for the server would not yet be a valid final score', () => {
    expect(isGamePoint({ scoreA: 9, scoreB: 6, servingTeam: 'A', serverNumber: 2 }, RULESET)).toBe(false)
  })

  it('false when the RECEIVING team is one point from ending it -- only the server\'s next point counts', () => {
    expect(isGamePoint({ scoreA: 6, scoreB: 10, servingTeam: 'A', serverNumber: 2 }, RULESET)).toBe(false)
  })
})

describe('contextualState', () => {
  it('SIDE_OUT takes priority when the last rally was a side out, even at game point', () => {
    expect(contextualState({ scoreA: 10, scoreB: 6, servingTeam: 'A', serverNumber: 1 }, RULESET, 'SIDE_OUT')).toBe('SIDE_OUT')
  })

  it('GAME_POINT when the server is one rally from winning and the last rally was not a side out', () => {
    expect(contextualState({ scoreA: 10, scoreB: 6, servingTeam: 'A', serverNumber: 2 }, RULESET, 'POINT_AWARDED')).toBe('GAME_POINT')
  })

  it('TIED_WIN_BY_TWO when scores are tied at or above targetScore - 1', () => {
    expect(contextualState({ scoreA: 10, scoreB: 10, servingTeam: 'A', serverNumber: 2 }, RULESET, 'POINT_AWARDED')).toBe('TIED_WIN_BY_TWO')
  })

  it('null when nothing special applies', () => {
    expect(contextualState({ scoreA: 3, scoreB: 2, servingTeam: 'A', serverNumber: 2 }, RULESET, 'POINT_AWARDED')).toBe(null)
  })

  it('null lastOutcome is treated the same as no special transient state', () => {
    expect(contextualState({ scoreA: 3, scoreB: 2, servingTeam: 'A', serverNumber: 2 }, RULESET, null)).toBe(null)
  })

  it('singles behaves identically -- no server-1 concept changes the logic here', () => {
    expect(contextualState({ scoreA: 10, scoreB: 6, servingTeam: 'A', serverNumber: 1 }, SINGLES, 'POINT_AWARDED')).toBe('GAME_POINT')
  })
})
