// src/lib/pickleball/scoring/serverRotation.test.ts
import { describe, it, expect } from 'vitest'
import { nextServerIdentity, deriveServingPlayer } from './serverRotation'
import type { GameState } from './gameState'

const P_A1 = 'sp-a1'
const P_A2 = 'sp-a2'
const P_B1 = 'sp-b1'
const P_B2 = 'sp-b2'

function state(overrides: Partial<GameState>): GameState {
  return { scoreA: 0, scoreB: 0, servingTeam: 'A', serverNumber: 2, ...overrides }
}

describe('nextServerIdentity', () => {
  it('a point awarded (serving team keeps serving) never changes identity', () => {
    const identity = { teamACurrentServerId: P_A1, teamBCurrentServerId: P_B1 }
    const before = state({ servingTeam: 'A', serverNumber: 2 })
    const after = state({ servingTeam: 'A', serverNumber: 2, scoreA: 1 })
    expect(nextServerIdentity(identity, before, after, P_A2, P_B2)).toEqual(identity)
  })

  it('doubles SERVE_CHANGED (server1 -> server2, same team) flips that team\'s OWN current server to their partner', () => {
    const identity = { teamACurrentServerId: P_A1, teamBCurrentServerId: P_B1 }
    const before = state({ servingTeam: 'A', serverNumber: 1 })
    const after = state({ servingTeam: 'A', serverNumber: 2 })
    expect(nextServerIdentity(identity, before, after, P_A2, P_B2)).toEqual({ teamACurrentServerId: P_A2, teamBCurrentServerId: P_B1 })
  })

  it('side out flips the NEWLY-serving team\'s own current server to their partner; the team that just lost serve is untouched', () => {
    const identity = { teamACurrentServerId: P_A1, teamBCurrentServerId: P_B1 }
    const before = state({ servingTeam: 'A', serverNumber: 2 })
    const after = state({ servingTeam: 'B', serverNumber: 1 })
    expect(nextServerIdentity(identity, before, after, P_A2, P_B2)).toEqual({ teamACurrentServerId: P_A1, teamBCurrentServerId: P_B2 })
  })

  it('singles never flips -- the "other player" is null, so identity is a no-op regardless of outcome', () => {
    const identity = { teamACurrentServerId: P_A1, teamBCurrentServerId: P_B1 }
    const before = state({ servingTeam: 'A', serverNumber: 1 })
    const after = state({ servingTeam: 'B', serverNumber: 1 })
    expect(nextServerIdentity(identity, before, after, null, null)).toEqual(identity)
  })

  it('a second side-out back to team A continues rotation from where team A left off, not back to the original starting server', () => {
    // Team A already rotated to P_A2 (from the earlier side-out test). Team A
    // regains serve again -- rotation must continue to swap AGAIN, landing
    // back on P_A1, not staying on P_A2 or resetting to the original starter
    // in some other way.
    const identity = { teamACurrentServerId: P_A2, teamBCurrentServerId: P_B2 }
    const before = state({ servingTeam: 'B', serverNumber: 2 })
    const after = state({ servingTeam: 'A', serverNumber: 1 })
    expect(nextServerIdentity(identity, before, after, P_A1, P_B1)).toEqual({ teamACurrentServerId: P_A1, teamBCurrentServerId: P_B2 })
  })
})

describe('deriveServingPlayer', () => {
  it('returns team A\'s current server when A is serving', () => {
    const identity = { teamACurrentServerId: P_A1, teamBCurrentServerId: P_B1 }
    expect(deriveServingPlayer(state({ servingTeam: 'A' }), identity)).toBe(P_A1)
  })

  it('returns team B\'s current server when B is serving', () => {
    const identity = { teamACurrentServerId: P_A1, teamBCurrentServerId: P_B1 }
    expect(deriveServingPlayer(state({ servingTeam: 'B' }), identity)).toBe(P_B1)
  })
})
