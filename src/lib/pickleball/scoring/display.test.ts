// src/lib/pickleball/scoring/display.test.ts
import { describe, it, expect } from 'vitest'
import { officialScoreCall, isValidFinalScore, hasGameBeenWon, isGamePoint, contextualState } from './display'

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

describe('isValidFinalScore / hasGameBeenWon — legally reachable finals only', () => {
  const TO_11 = { format: 'DOUBLES' as const, targetScore: 11, winBy: 2 }
  const TO_15 = { format: 'DOUBLES' as const, targetScore: 15, winBy: 2 }
  const TO_21 = { format: 'DOUBLES' as const, targetScore: 21, winBy: 2 }

  it.each([
    // [scoreA, scoreB, ruleset, expected]
    [11, 9, TO_11, true],
    [11, 10, TO_11, false],
    [12, 10, TO_11, true],
    [12, 9, TO_11, false],
    [12, 11, TO_11, false],
    [13, 11, TO_11, true],
    [13, 10, TO_11, false],
    [13, 12, TO_11, false],
    [14, 11, TO_11, false],
    [20, 20, TO_11, false],
    [22, 20, TO_11, true],
    [21, 20, TO_11, false],
    [15, 13, TO_15, true],
    // NOTE: the brief's original fixture here was [15, 12, TO_15, false], but
    // 15-12 is actually a legally reachable final score under the rewritten
    // rule -- same shape as the 11-9/15-13 "winner exactly at target, loser
    // comfortably within winBy" cases above, just verified false<->true. Before
    // the winner reaches targetScore, no margin size stops the game, so a
    // jump straight to target-with-large-margin (15-12, margin 3 >= winBy 2)
    // is legal. Replaced with 16-13: one point past the paired 15-13 true
    // case, which is genuinely unreachable (the game would have already
    // ended at 15-13).
    [16, 13, TO_15, false],
    [21, 19, TO_21, true],
    // NOTE: same fixture bug as above -- 21-18 is legally reachable (winner
    // at target, margin 3 >= winBy 2). Replaced with 22-19: one point past
    // the paired 21-19 true case.
    [22, 19, TO_21, false],
  ])('scoreA=%i scoreB=%i target=%o -> %s', (scoreA, scoreB, ruleset, expected) => {
    expect(isValidFinalScore(scoreA, scoreB, ruleset)).toBe(expected)
    // hasGameBeenWon is the same check by construction -- assert the two
    // never disagree, so a future edit to one without the other is caught.
    expect(hasGameBeenWon({ scoreA, scoreB, servingTeam: 'A', serverNumber: 2 }, ruleset)).toBe(expected)
  })

  it('repeated ties never hit an artificial cap -- 20-20 continuing to 22-20 is valid, not capped at some "first to 13" rule', () => {
    expect(isValidFinalScore(20, 20, TO_11)).toBe(false)
    expect(isValidFinalScore(21, 21, TO_11)).toBe(false)
    expect(isValidFinalScore(22, 20, TO_11)).toBe(true)
    expect(isValidFinalScore(23, 21, TO_11)).toBe(true)
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
