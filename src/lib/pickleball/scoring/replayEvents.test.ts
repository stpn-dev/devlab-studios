import { describe, it, expect } from 'vitest'
import { replayEvents } from './replayEvents'
import { initialGameState } from './gameState'

const RULESET = { format: 'DOUBLES' as const, targetScore: 11, winBy: 2 }
const SINGLES_RULESET = { format: 'SINGLES' as const, targetScore: 11, winBy: 2 }

function event(sequence: number, eventType: string, payload: unknown) {
  return { sequence, eventType, payload }
}

describe('replayEvents', () => {
  it('replays GAME_STARTED into the canonical opening state', () => {
    const result = replayEvents([event(1, 'GAME_STARTED', { servingTeam: 'A' })], RULESET)
    expect(result.state).toEqual({ scoreA: 0, scoreB: 0, servingTeam: 'A', serverNumber: 2 })
    expect(result.status).toBe('IN_PROGRESS')
  })

  // Regression test for the replay-vs-live-command disagreement: replay used
  // to construct GAME_STARTED's state inline with a hardcoded serverNumber 2,
  // which is wrong for SINGLES (no server-1/server-2 distinction exists, so it
  // opens and stays on 1). `initialGameState` is now the single source of truth
  // for BOTH sides -- replay here, and the games-row INSERT that startGame
  // performs (SessionCoordinatorDO.startGame passes
  // `initialGameState(servingTeam, ruleset.format).serverNumber` straight into
  // buildCreateGameStatement, which no longer derives it itself). Asserting
  // against initialGameState rather than a literal is the point: these two
  // paths can no longer drift apart.
  it('replays a SINGLES GAME_STARTED to serverNumber 1, exactly matching what startGame persists', () => {
    const result = replayEvents([event(1, 'GAME_STARTED', { servingTeam: 'A' })], SINGLES_RULESET)
    expect(result.state.serverNumber).toBe(1)
    expect(result.state).toEqual(initialGameState('A', 'SINGLES'))
  })

  it('replays a DOUBLES GAME_STARTED to serverNumber 2, exactly matching what startGame persists', () => {
    const result = replayEvents([event(1, 'GAME_STARTED', { servingTeam: 'B' })], RULESET)
    expect(result.state.serverNumber).toBe(2)
    expect(result.state).toEqual(initialGameState('B', 'DOUBLES'))
  })

  it('replays a sequence of rallies deterministically, same as calling recordRally directly', () => {
    const events = [
      event(1, 'GAME_STARTED', { servingTeam: 'A' }),
      event(2, 'SIDE_OUT', { winningTeam: 'B' }), // 0-0-2, B wins -> side out to B, server 1
      event(3, 'POINT_AWARDED', { winningTeam: 'B' }), // B serves, B wins -> 0-1
      event(4, 'SERVE_CHANGED', { winningTeam: 'A' }), // B serves (server 1), A wins -> server 2, no point
    ]
    const result = replayEvents(events, RULESET)
    expect(result.state).toEqual({ scoreA: 0, scoreB: 1, servingTeam: 'B', serverNumber: 2 })
  })

  it('a POINT_REVERSED event excludes the referenced sequence from the replay, not just the last one', () => {
    const events = [
      event(1, 'GAME_STARTED', { servingTeam: 'A' }),
      event(2, 'POINT_AWARDED', { winningTeam: 'A' }), // 1-0
      event(3, 'POINT_AWARDED', { winningTeam: 'A' }), // 2-0
      event(4, 'POINT_REVERSED', { reversedSequence: 3 }),
    ]
    const result = replayEvents(events, RULESET)
    expect(result.state).toEqual({ scoreA: 1, scoreB: 0, servingTeam: 'A', serverNumber: 2 })
  })

  it('SCORE_CORRECTED overrides the state outright and later events replay forward from it', () => {
    const events = [
      event(1, 'GAME_STARTED', { servingTeam: 'A' }),
      event(2, 'POINT_AWARDED', { winningTeam: 'A' }), // 1-0
      event(3, 'SCORE_CORRECTED', { scoreA: 8, scoreB: 6, servingTeam: 'A', serverNumber: 2 }),
      event(4, 'POINT_AWARDED', { winningTeam: 'A' }), // 9-6
    ]
    const result = replayEvents(events, RULESET)
    expect(result.state).toEqual({ scoreA: 9, scoreB: 6, servingTeam: 'A', serverNumber: 2 })
  })

  it('GAME_FINISHED sets status FINISHED and freezes the final score/winner', () => {
    const events = [
      event(1, 'GAME_STARTED', { servingTeam: 'A' }),
      event(2, 'SCORE_CORRECTED', { scoreA: 10, scoreB: 8, servingTeam: 'A', serverNumber: 2 }),
      event(3, 'POINT_AWARDED', { winningTeam: 'A' }), // 11-8
      event(4, 'GAME_FINISHED', { finalScoreA: 11, finalScoreB: 8, winningTeamId: 'team-a' }),
    ]
    const result = replayEvents(events, RULESET)
    expect(result.status).toBe('FINISHED')
    expect(result.winningTeamId).toBe('team-a')
    expect(result.finalScoreA).toBe(11)
    expect(result.finalScoreB).toBe(8)
  })

  it('GAME_REOPENED after GAME_FINISHED clears finished status and final score', () => {
    const events = [
      event(1, 'GAME_STARTED', { servingTeam: 'A' }),
      event(2, 'SCORE_CORRECTED', { scoreA: 11, scoreB: 8, servingTeam: 'A', serverNumber: 2 }),
      event(3, 'GAME_FINISHED', { finalScoreA: 11, finalScoreB: 8, winningTeamId: 'team-a' }),
      event(4, 'GAME_REOPENED', {}),
    ]
    const result = replayEvents(events, RULESET)
    expect(result.status).toBe('IN_PROGRESS')
    expect(result.winningTeamId).toBe(null)
    expect(result.finalScoreA).toBe(null)
    expect(result.finalScoreB).toBe(null)
  })

  it('GAME_ABANDONED sets status ABANDONED with no winner', () => {
    const events = [
      event(1, 'GAME_STARTED', { servingTeam: 'A' }),
      event(2, 'POINT_AWARDED', { winningTeam: 'A' }),
      event(3, 'GAME_ABANDONED', {}),
    ]
    const result = replayEvents(events, RULESET)
    expect(result.status).toBe('ABANDONED')
    expect(result.winningTeamId).toBe(null)
  })
})
