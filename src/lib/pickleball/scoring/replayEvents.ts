import type { GameState, ScoringRulesetLike } from './gameState'
import { recordRally } from './recordRally'

export interface ReplayableEvent {
  sequence: number
  eventType: string
  payload: unknown
}

export interface ReplayResult {
  state: GameState
  status: 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED'
  winningTeamId: string | null
  finalScoreA: number | null
  finalScoreB: number | null
}

const SCORING_EVENT_TYPES = new Set(['POINT_AWARDED', 'SERVE_CHANGED', 'SIDE_OUT'])

export function replayEvents(events: ReplayableEvent[], ruleset: ScoringRulesetLike): ReplayResult {
  const reversedSequences = new Set<number>(
    events
      .filter((e) => e.eventType === 'POINT_REVERSED')
      .map((e) => (e.payload as { reversedSequence: number }).reversedSequence),
  )

  let state: GameState = { scoreA: 0, scoreB: 0, servingTeam: 'A', serverNumber: 2 }
  let status: ReplayResult['status'] = 'IN_PROGRESS'
  let winningTeamId: string | null = null
  let finalScoreA: number | null = null
  let finalScoreB: number | null = null

  for (const event of events) {
    if (event.eventType === 'GAME_STARTED') {
      const payload = event.payload as { servingTeam: 'A' | 'B' }
      state = { scoreA: 0, scoreB: 0, servingTeam: payload.servingTeam, serverNumber: 2 }
      continue
    }

    if (SCORING_EVENT_TYPES.has(event.eventType)) {
      if (reversedSequences.has(event.sequence)) continue
      const payload = event.payload as { winningTeam: 'A' | 'B' }
      state = recordRally(state, ruleset, payload.winningTeam)
      continue
    }

    if (event.eventType === 'SCORE_CORRECTED') {
      const payload = event.payload as { scoreA: number; scoreB: number; servingTeam: 'A' | 'B'; serverNumber: 1 | 2 }
      state = {
        scoreA: payload.scoreA,
        scoreB: payload.scoreB,
        servingTeam: payload.servingTeam,
        serverNumber: payload.serverNumber,
      }
      continue
    }

    if (event.eventType === 'GAME_FINISHED') {
      const payload = event.payload as { winningTeamId: string; finalScoreA: number; finalScoreB: number }
      status = 'FINISHED'
      winningTeamId = payload.winningTeamId
      finalScoreA = payload.finalScoreA
      finalScoreB = payload.finalScoreB
      continue
    }

    if (event.eventType === 'GAME_REOPENED') {
      status = 'IN_PROGRESS'
      winningTeamId = null
      finalScoreA = null
      finalScoreB = null
      continue
    }

    if (event.eventType === 'GAME_ABANDONED') {
      status = 'ABANDONED'
      winningTeamId = null
      continue
    }

    // POINT_REVERSED itself carries no direct state effect -- its effect is
    // the `reversedSequences` exclusion computed above, applied uniformly
    // regardless of where in the sequence it appears.
  }

  return { state, status, winningTeamId, finalScoreA, finalScoreB }
}
