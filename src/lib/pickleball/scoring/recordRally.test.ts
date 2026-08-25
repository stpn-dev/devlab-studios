// src/lib/pickleball/scoring/recordRally.test.ts
import { describe, it, expect } from 'vitest'
import { recordRally, classifyRallyOutcome } from './recordRally'
import { initialGameState } from './gameState'

const DOUBLES = { format: 'DOUBLES' as const, targetScore: 11, winBy: 2 }
const SINGLES = { format: 'SINGLES' as const, targetScore: 11, winBy: 2 }

describe('recordRally', () => {
  it('awards a point when the serving team wins the rally', () => {
    const state = { scoreA: 3, scoreB: 5, servingTeam: 'A' as const, serverNumber: 2 as const }
    const next = recordRally(state, DOUBLES, 'A')
    expect(next).toEqual({ scoreA: 4, scoreB: 5, servingTeam: 'A', serverNumber: 2 })
  })

  it('serving team B wins increments only scoreB', () => {
    const state = { scoreA: 3, scoreB: 5, servingTeam: 'B' as const, serverNumber: 1 as const }
    const next = recordRally(state, DOUBLES, 'B')
    expect(next).toEqual({ scoreA: 3, scoreB: 6, servingTeam: 'B', serverNumber: 1 })
  })

  it('doubles: receiving team wins on server 1 -> no point, server advances to 2', () => {
    const state = { scoreA: 3, scoreB: 5, servingTeam: 'A' as const, serverNumber: 1 as const }
    const next = recordRally(state, DOUBLES, 'B')
    expect(next).toEqual({ scoreA: 3, scoreB: 5, servingTeam: 'A', serverNumber: 2 })
  })

  it('doubles: receiving team wins on server 2 -> side out, service transfers, new server is 1', () => {
    const state = { scoreA: 3, scoreB: 5, servingTeam: 'A' as const, serverNumber: 2 as const }
    const next = recordRally(state, DOUBLES, 'B')
    expect(next).toEqual({ scoreA: 3, scoreB: 5, servingTeam: 'B', serverNumber: 1 })
  })

  it('the opening 0-0-2 loses immediately to one lost rally (side out, no point)', () => {
    const opening = initialGameState('A', 'DOUBLES')
    expect(opening).toEqual({ scoreA: 0, scoreB: 0, servingTeam: 'A', serverNumber: 2 })
    const next = recordRally(opening, DOUBLES, 'B')
    expect(next).toEqual({ scoreA: 0, scoreB: 0, servingTeam: 'B', serverNumber: 1 })
  })

  it('singles: receiving team win is always an immediate side out, never exposes server 1', () => {
    const state = { scoreA: 3, scoreB: 5, servingTeam: 'A' as const, serverNumber: 1 as const }
    const next = recordRally(state, SINGLES, 'B')
    expect(next).toEqual({ scoreA: 3, scoreB: 5, servingTeam: 'B', serverNumber: 1 })
  })

  it('singles: serving team win only ever increments the score, serverNumber stays 1', () => {
    const state = { scoreA: 3, scoreB: 5, servingTeam: 'A' as const, serverNumber: 1 as const }
    const next = recordRally(state, SINGLES, 'A')
    expect(next).toEqual({ scoreA: 4, scoreB: 5, servingTeam: 'A', serverNumber: 1 })
  })
})

describe('classifyRallyOutcome', () => {
  it('labels a same-server score increase as POINT_AWARDED', () => {
    const before = { scoreA: 3, scoreB: 5, servingTeam: 'A' as const, serverNumber: 2 as const }
    const after = { scoreA: 4, scoreB: 5, servingTeam: 'A' as const, serverNumber: 2 as const }
    expect(classifyRallyOutcome(before, after)).toBe('POINT_AWARDED')
  })

  it('labels a server-1-to-2 doubles transition as SERVE_CHANGED', () => {
    const before = { scoreA: 3, scoreB: 5, servingTeam: 'A' as const, serverNumber: 1 as const }
    const after = { scoreA: 3, scoreB: 5, servingTeam: 'A' as const, serverNumber: 2 as const }
    expect(classifyRallyOutcome(before, after)).toBe('SERVE_CHANGED')
  })

  it('labels a serving-team flip as SIDE_OUT', () => {
    const before = { scoreA: 3, scoreB: 5, servingTeam: 'A' as const, serverNumber: 2 as const }
    const after = { scoreA: 3, scoreB: 5, servingTeam: 'B' as const, serverNumber: 1 as const }
    expect(classifyRallyOutcome(before, after)).toBe('SIDE_OUT')
  })
})
