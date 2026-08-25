import type { GameState, ScoringRulesetLike } from './gameState'
import { initialGameState } from './gameState'
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

  // `initialGameState` is the SINGLE source of truth for a game's opening
  // state -- shared with what startGame persists at creation time (see
  // games.js's buildCreateGameStatement, which is handed the serverNumber
  // this same function derives). Constructing the opening state inline here
  // instead is how replay came to hardcode serverNumber 2 regardless of
  // format, silently disagreeing with a live SINGLES game (serverNumber 1)
  // and violating gameProjection.ts's invariant that a replay result must
  // never differ from what the live command produced.
  let state: GameState = initialGameState('A', ruleset.format)
  let status: ReplayResult['status'] = 'IN_PROGRESS'
  let winningTeamId: string | null = null
  let finalScoreA: number | null = null
  let finalScoreB: number | null = null

  for (const event of events) {
    if (event.eventType === 'GAME_STARTED') {
      const payload = event.payload as { servingTeam: 'A' | 'B' }
      state = initialGameState(payload.servingTeam, ruleset.format)
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
