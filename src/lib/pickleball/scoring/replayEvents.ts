import type { GameState, ScoringRulesetLike } from './gameState'
import { recordRally } from './recordRally'

export interface ReplayableEvent {
  sequence: number
  eventType: string
  payload: any
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
    events.filter((e) => e.eventType === 'POINT_REVERSED').map((e) => e.payload.reversedSequence),
  )

  let state: GameState = { scoreA: 0, scoreB: 0, servingTeam: 'A', serverNumber: 2 }
  let status: ReplayResult['status'] = 'IN_PROGRESS'
  let winningTeamId: string | null = null
  let finalScoreA: number | null = null
  let finalScoreB: number | null = null

  for (const event of events) {
    if (event.eventType === 'GAME_STARTED') {
      state = { scoreA: 0, scoreB: 0, servingTeam: event.payload.servingTeam, serverNumber: 2 }
      continue
    }

    if (SCORING_EVENT_TYPES.has(event.eventType)) {
      if (reversedSequences.has(event.sequence)) continue
      state = recordRally(state, ruleset, event.payload.winningTeam)
      continue
    }

    if (event.eventType === 'SCORE_CORRECTED') {
      state = {
        scoreA: event.payload.scoreA,
        scoreB: event.payload.scoreB,
        servingTeam: event.payload.servingTeam,
        serverNumber: event.payload.serverNumber,
      }
      continue
    }

    if (event.eventType === 'GAME_FINISHED') {
      status = 'FINISHED'
      winningTeamId = event.payload.winningTeamId
      finalScoreA = event.payload.finalScoreA
      finalScoreB = event.payload.finalScoreB
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
