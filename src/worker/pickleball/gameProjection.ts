import { listScoreEventsForGame } from '../repositories/pickleball/scoreEvents.js'
import { getGameById, buildUpdateGameProjectionStatement } from '../repositories/pickleball/games.js'
import { getSessionById, getScoringRuleset } from '../repositories/pickleball/sessions.js'
import { replayEvents } from '../../lib/pickleball/scoring/replayEvents'

interface ScoreEvent {
  sequence: number
  eventType: string
  payload: unknown
  [key: string]: unknown
}

// Recovery mechanism for spec §59 ("derived data must be reproducible"):
// re-derives the games row entirely from its own append-only event log,
// via the same pure recordRally function every live command already uses.
// If this function's output ever differs from what a live command produced,
// that is a live bug in either the command handler or this rebuild path --
// there is no third, independent source of truth to defer to.
export async function rebuildGameProjection(db: D1Database, gameId: string): Promise<void> {
  const game = await getGameById(db, gameId)
  if (!game) throw new Error(`Cannot rebuild projection: game ${gameId} not found.`)

  const session = await getSessionById(db, game.sessionId)
  if (!session) throw new Error(`Cannot rebuild projection: session ${game.sessionId} not found.`)

  const ruleset = await getScoringRuleset(db, game.scoringRulesetId, session.organizationId)
  if (!ruleset) throw new Error(`Cannot rebuild projection: ruleset ${game.scoringRulesetId} not found.`)

  const events = await listScoreEventsForGame(db, gameId)
  const result = replayEvents(
    events.map((e: ScoreEvent) => ({ sequence: e.sequence, eventType: e.eventType, payload: e.payload })),
    ruleset,
  )

  await buildUpdateGameProjectionStatement(db, gameId, {
    scoreA: result.state.scoreA,
    scoreB: result.state.scoreB,
    servingTeam: result.state.servingTeam,
    serverNumber: result.state.serverNumber,
    status: result.status,
    winningTeamId: result.winningTeamId,
    finalScoreA: result.finalScoreA,
    finalScoreB: result.finalScoreB,
    revision: events.length,
  }).run()
}
