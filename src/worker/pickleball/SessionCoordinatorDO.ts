// Durable Object that serializes all court-assignment work for one Pickleball
// session. Instances are keyed by session id
// (`env.SESSION_COORDINATOR.idFromName(sessionId)`), so every mutation below is
// automatically serialized against every other mutation for the same session.
//
// CONCURRENCY: the atomicity guarantee comes entirely from the Durable Object
// runtime processing one request at a time per instance. There is deliberately
// NO manual lock/mutex in this file — adding one would be redundant with the
// platform guarantee and could conflict with it. What the runtime does NOT
// give us is crash-atomicity across several D1 statements, so each method
// funnels its writes through a single `db.batch([...])` transaction.
//
// TENANCY: this class has no notion of "organization". Every caller (Task 7's
// API routes) has already verified that the authenticated user's organization
// owns `sessionId` before invoking these methods, which is why the org-agnostic
// `getSessionById` is correct here and the org-scoped `getSession` is not.
import { DurableObject } from 'cloudflare:workers'
import { getSessionById, getScoringRuleset } from '../repositories/pickleball/sessions.js'
import { getSessionCourt, buildSetCourtStatusStatement } from '../repositories/pickleball/sessionCourts.js'
import {
  listEligibleQueueCandidates,
  hasOpenAssignment,
  buildMarkAssignedStatement,
  buildMarkPlayingStatement,
  buildCloseQueueEntryStatement,
  buildJoinQueueStatement,
} from '../repositories/pickleball/queueEntries.js'
import {
  buildCreateTeamStatement,
  buildAddTeamMemberStatement,
  buildReplaceTeamMemberStatement,
  buildClearTeamCourtBindingStatement,
  getActiveTeamForSessionPlayer,
  listAssignedSessionPlayerIdsForCourt,
  getTeamWithMembers,
} from '../repositories/pickleball/teams.js'
import { buildSetAvailabilityByIdStatement, buildIncrementGamesPlayedStatement } from '../repositories/pickleball/sessionPlayers.js'
import {
  buildCreateGameStatement,
  buildUpdateGameProjectionStatement,
  buildUpdateServerIdentityStatement,
  getGame,
} from '../repositories/pickleball/games.js'
import { getNextSequence, buildAppendScoreEventStatement, listScoreEventsForGame } from '../repositories/pickleball/scoreEvents.js'
import { getIdempotentResult, buildRecordIdempotentResultStatement } from '../repositories/pickleball/idempotencyKeys.js'
import { buildCreatePlayerGameStatStatement } from '../repositories/pickleball/playerGameStats.js'
import { buildUpsertMatchmakingStatement } from '../repositories/pickleball/matchmakingHistory.js'
import { selectNextPlayers, type QueueCandidate } from '../../lib/pickleball/queueEngine'
import { recordRally, classifyRallyOutcome } from '../../lib/pickleball/scoring/recordRally'
import { replayEvents } from '../../lib/pickleball/scoring/replayEvents'
import { hasGameBeenWon, isValidFinalScore } from '../../lib/pickleball/scoring/display'
import { nextServerIdentity, deriveServingPlayer } from '../../lib/pickleball/scoring/serverRotation'
import { gamePerformance } from '../../lib/pickleball/opi'

function requiredPlayerCount(format: string): number {
  return format === 'SINGLES' ? 2 : 4
}

function failure(error: string) {
  return { ok: false as const, error }
}

// Mirrors gameProjection.ts's local ScoreEvent shape: listScoreEventsForGame
// lives in a plain .js repository module, so its element type isn't inferred
// precisely enough for the filter/map/find callbacks below without this.
interface ScoreEvent {
  sequence: number
  eventType: string
  payload: unknown
  [key: string]: unknown
}

export class SessionCoordinatorDO extends DurableObject<Env> {
  // The entire concurrency guarantee rests on every caller deriving this stub
  // via `idFromName(sessionId)` for the SAME sessionId it then passes in.
  // Nothing in the platform enforces that pairing, so a caller that mixed them
  // up would get a coordinator serializing the wrong session's work — silently
  // losing mutual exclusion. This asserts the pairing instead of trusting it.
  private ownsSession(sessionId: string): boolean {
    return this.ctx.id.equals(this.env.SESSION_COORDINATOR.idFromName(sessionId))
  }

  async assignCourt(sessionId: string, sessionCourtId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    if (session.sessionType !== 'OPEN_PLAY') {
      return failure('Court assignment is only supported for Open Play sessions in this phase.')
    }
    // LIVE only — assigning a court is an active-play action, so a DRAFT,
    // OPEN_FOR_CHECKIN, PAUSED, COMPLETED, or CANCELLED session must not take
    // new assignments.
    if (session.status !== 'LIVE') return failure('Session is not live.')

    const court = await getSessionCourt(db, sessionId, sessionCourtId)
    if (!court) return failure('Court not found.')
    if (!court.enabled) return failure('Court is disabled.')
    if (court.status !== 'AVAILABLE') return failure('Court is not available.')

    const ruleset = await getScoringRuleset(db, session.scoringRulesetId, session.organizationId)
    const needed = requiredPlayerCount(ruleset ? ruleset.format : 'DOUBLES')

    const candidates: QueueCandidate[] = await listEligibleQueueCandidates(db, sessionId)
    if (candidates.length < needed) {
      return failure(`Not enough eligible players (need ${needed}, have ${candidates.length}).`)
    }

    const nowIso = new Date().toISOString()
    const { selected, reasons } = selectNextPlayers(candidates, needed, nowIso)

    // PHASE 5 SEAM — placeholder pairing, NOT a finished feature. This splits
    // the fairness-selected group at its midpoint (first half vs second half,
    // in selection order) purely so two teams exist; it does no match
    // balancing whatsoever, because OPI doesn't exist until Phase 5. Phase 5
    // should replace ONLY this pairing step (not the fairness selection above
    // it) with a real balanceTeams() call, per spec §55's
    // queue-fairness-vs-match-balancing separation.
    const half = Math.floor(selected.length / 2)
    const teamAPlayers = selected.slice(0, half)
    const teamBPlayers = selected.slice(half)

    // Every id is generated client-side before any statement runs, so the whole
    // assignment fits in one all-or-nothing batch. Executed piecemeal, a
    // mid-sequence failure could leave players flipped to ASSIGNED while the
    // court stayed AVAILABLE — stranding them where releaseCourt can't see them.
    const teamA = buildCreateTeamStatement(db, { sessionId, sessionCourtId, kind: 'AD_HOC' })
    const teamB = buildCreateTeamStatement(db, { sessionId, sessionCourtId, kind: 'AD_HOC' })
    const markAssignedStatement = buildMarkAssignedStatement(db, sessionId, selected.map((p) => p.sessionPlayerId))

    const statements = [
      teamA.statement,
      ...teamAPlayers.map((player) => buildAddTeamMemberStatement(db, { teamId: teamA.id, sessionPlayerId: player.sessionPlayerId })),
      teamB.statement,
      ...teamBPlayers.map((player) => buildAddTeamMemberStatement(db, { teamId: teamB.id, sessionPlayerId: player.sessionPlayerId })),
      markAssignedStatement,
      buildSetCourtStatusStatement(db, sessionId, sessionCourtId, 'ASSIGNED'),
    ].filter(Boolean)

    const results = await db.batch(statements)

    // The batch already committed by this point (D1 batches don't support
    // partial rollback), so this can't prevent an inconsistent write -- but a
    // `leaveQueue` racing between the eligibility read above and this commit
    // could shrink the QUEUED rows out from under `markAssignedStatement`'s
    // `WHERE ... AND status = 'QUEUED'` clause, silently seating fewer players
    // than the court's new roster (teamA/teamB rows) claims. Surface that as a
    // hard failure instead of returning success over a state where the court
    // says N players are seated but fewer than N were actually flipped to
    // ASSIGNED.
    if (markAssignedStatement) {
      const markAssignedIndex = statements.indexOf(markAssignedStatement)
      const seated = results[markAssignedIndex]?.meta?.changes ?? 0
      if (seated !== needed) {
        return failure(`Assignment failed: expected to seat ${needed} players, only ${seated} were queued at commit time.`)
      }
    }

    return {
      ok: true as const,
      // Re-read rather than reusing the batch result: the court projection
      // includes `courts.name`, which the UPDATE above cannot return.
      court: await getSessionCourt(db, sessionId, sessionCourtId),
      teamA: { id: teamA.id, players: teamAPlayers },
      teamB: { id: teamB.id, players: teamBPlayers },
      reasons,
    }
  }

  async replaceAssignedPlayer(
    sessionId: string,
    sessionCourtId: string,
    outgoingSessionPlayerId: string,
    incomingSessionPlayerId: string,
    outgoingDisposition: 'UNAVAILABLE' | 'REQUEUE',
  ) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    const court = await getSessionCourt(db, sessionId, sessionCourtId)
    if (!court) return failure('Court not found.')
    if (court.status !== 'ASSIGNED') return failure('Court has no pending assignment to replace a player on.')

    // Establish that the outgoing player is REALLY seated right now, before
    // touching any roster. `getActiveTeamForSessionPlayer` alone is not enough:
    // it returns the most recently created team containing the player, even for
    // someone who finished a game and is back in the queue. Acting on that
    // stale team would rewrite a dead roster row and flip the incoming player
    // to ASSIGNED without seating them on any live court — stranding them
    // invisibly (they'd no longer appear as an eligible queue candidate) while
    // needlessly deleting the outgoing player's real queue entry.
    if (!(await hasOpenAssignment(db, sessionId, outgoingSessionPlayerId))) {
      return failure('Outgoing player is not currently assigned on this session.')
    }

    const team = await getActiveTeamForSessionPlayer(db, sessionId, outgoingSessionPlayerId)
    if (!team) return failure('Outgoing player is not currently assigned on this session.')
    // ...and that the team we resolved is the one actually occupying the court
    // the caller named, so `sessionCourtId` is a real constraint rather than an
    // ignored argument.
    if (team.sessionCourtId !== sessionCourtId) {
      return failure('Outgoing player is not assigned to this court.')
    }

    const candidates: QueueCandidate[] = await listEligibleQueueCandidates(db, sessionId)
    const incoming = candidates.find((c) => c.sessionPlayerId === incomingSessionPlayerId)
    if (!incoming) return failure('Incoming player is not eligible (must be checked in, available, and queued).')

    // One transaction: the roster swap, the incoming player's assignment, and
    // the outgoing player's disposition must not be separable.
    const statements = [
      buildReplaceTeamMemberStatement(db, { teamId: team.id, outgoingSessionPlayerId, incomingSessionPlayerId }),
      buildMarkAssignedStatement(db, sessionId, [incomingSessionPlayerId]),
      buildCloseQueueEntryStatement(db, sessionId, outgoingSessionPlayerId),
      outgoingDisposition === 'UNAVAILABLE'
        ? buildSetAvailabilityByIdStatement(db, sessionId, outgoingSessionPlayerId, 'TEMPORARILY_UNAVAILABLE')
        : // Safe without joinQueue's duplicate guard: the close statement above
          // removes every open entry for this player earlier in the same batch.
          buildJoinQueueStatement(db, { sessionId, sessionPlayerId: outgoingSessionPlayerId }),
    ].filter(Boolean)

    await db.batch(statements)

    return { ok: true as const, teamId: team.id, incomingSessionPlayerId, outgoingSessionPlayerId }
  }

  async releaseCourt(sessionId: string, sessionCourtId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    const court = await getSessionCourt(db, sessionId, sessionCourtId)
    if (!court) return failure('Court not found.')
    if (court.status !== 'ASSIGNED' && court.status !== 'PLAYING') return failure('Court is not currently assigned.')

    const session = await getSessionById(db, sessionId)

    // Scoped to THIS court via teams.session_court_id. Previously this was a
    // session-wide query, so releasing one court also requeued every other
    // simultaneously-assigned court's players while leaving those courts stuck
    // at ASSIGNED.
    const sessionPlayerIds: string[] = await listAssignedSessionPlayerIdsForCourt(db, sessionId, sessionCourtId)

    const requeued = session?.postGameRotationPolicy === 'AUTO_REQUEUE_ALL'

    const statements = sessionPlayerIds.flatMap((sessionPlayerId) => [
      buildCloseQueueEntryStatement(db, sessionId, sessionPlayerId),
      ...(requeued ? [buildJoinQueueStatement(db, { sessionId, sessionPlayerId })] : []),
    ])

    // Release the court's team binding along with the court itself, so it does
    // not outlive this occupancy. A court is assigned and released many times
    // per session; a stale binding would let THIS release match a previous
    // occupancy's team and sweep in players who have since been reassigned
    // elsewhere. Order within the batch is irrelevant — different table, and
    // the read above already happened.
    statements.push(buildClearTeamCourtBindingStatement(db, sessionId, sessionCourtId))
    statements.push(buildSetCourtStatusStatement(db, sessionId, sessionCourtId, 'AVAILABLE'))

    await db.batch(statements)

    return { ok: true as const, releasedSessionPlayerIds: sessionPlayerIds, requeued }
  }

  async startGame(
    sessionId: string,
    sessionCourtId: string,
    servingTeam: 'A' | 'B',
    teamAStartingServerSessionPlayerId: string,
    teamBStartingServerSessionPlayerId: string,
  ) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    const court = await getSessionCourt(db, sessionId, sessionCourtId)
    if (!court) return failure('Court not found.')
    if (court.status !== 'ASSIGNED') return failure('Court has no pending assignment to start a game for.')

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    const ruleset = await getScoringRuleset(db, session.scoringRulesetId, session.organizationId)
    if (!ruleset) return failure('Scoring ruleset not found.')

    const sessionPlayerIds = await listAssignedSessionPlayerIdsForCourt(db, sessionId, sessionCourtId)
    if (!sessionPlayerIds.length) return failure('No players are currently assigned to this court.')

    // The team bound to this court IS the assignment startGame is starting a
    // game for -- resolve both sides from it rather than re-deriving rosters,
    // so this can never disagree with what assignCourt actually seated.
    const anyAssignedPlayerId = sessionPlayerIds[0]
    const team = await getActiveTeamForSessionPlayer(db, sessionId, anyAssignedPlayerId)
    if (!team || team.sessionCourtId !== sessionCourtId) {
      return failure('Could not resolve the teams currently assigned to this court.')
    }

    // assignCourt always creates teamA then teamB for one court assignment;
    // find the sibling by court binding rather than assuming id ordering.
    const courtTeamsResult = await db
      .prepare(`SELECT id FROM teams WHERE session_court_id = ? AND session_id = ?`)
      .bind(sessionCourtId, sessionId)
      .all<{ id: string }>()
    const courtTeamIds: string[] = (courtTeamsResult.results || []).map((row) => row.id)
    if (courtTeamIds.length !== 2) {
      return failure(`Expected exactly 2 teams bound to this court, found ${courtTeamIds.length}.`)
    }
    const [firstTeamId, secondTeamId] = courtTeamIds

    const firstTeamMembers = await getTeamWithMembers(db, firstTeamId)
    const secondTeamMembers = await getTeamWithMembers(db, secondTeamId)

    // The court binding doesn't itself distinguish "team A" from "team B" --
    // that label only matters for which of the two supplied starting-server
    // ids belongs to which side, so resolve by MEMBERSHIP: whichever team
    // actually contains teamAStartingServerSessionPlayerId is team A.
    const firstContainsA = (firstTeamMembers?.members ?? []).some((m: { sessionPlayerId: string }) => m.sessionPlayerId === teamAStartingServerSessionPlayerId)
    const secondContainsA = (secondTeamMembers?.members ?? []).some((m: { sessionPlayerId: string }) => m.sessionPlayerId === teamAStartingServerSessionPlayerId)
    if (firstContainsA === secondContainsA) {
      // Either neither team contains it (invalid id) or both do (shouldn't be
      // possible given team_members are exclusive, but treat ambiguity the
      // same as an invalid id -- fail closed).
      return failure('teamAStartingServerSessionPlayerId does not belong to exactly one of the two teams on this court.')
    }
    const teamAId = firstContainsA ? firstTeamId : secondTeamId
    const teamBId = firstContainsA ? secondTeamId : firstTeamId
    const teamAMembers = firstContainsA ? firstTeamMembers : secondTeamMembers
    const teamBMembers = firstContainsA ? secondTeamMembers : firstTeamMembers

    const teamAMemberIds = (teamAMembers?.members ?? []).map((m: { sessionPlayerId: string }) => m.sessionPlayerId)
    const teamBMemberIds = (teamBMembers?.members ?? []).map((m: { sessionPlayerId: string }) => m.sessionPlayerId)
    if (!teamBMemberIds.includes(teamBStartingServerSessionPlayerId)) {
      return failure('teamBStartingServerSessionPlayerId does not belong to team B on this court.')
    }
    if (ruleset.format === 'SINGLES' && (teamAMemberIds.length !== 1 || teamBMemberIds.length !== 1)) {
      return failure('Singles requires exactly one player per team.')
    }

    const gameId = crypto.randomUUID()
    const timestamp = new Date().toISOString()

    const gameStatement = buildCreateGameStatement(db, {
      id: gameId, sessionId, sessionCourtId, scoringRulesetId: ruleset.id, format: ruleset.format,
      teamAId, teamBId, servingTeam,
      teamAStartingServerSessionPlayerId, teamBStartingServerSessionPlayerId, timestamp,
    })

    const participantStatements = [
      ...teamAMemberIds.map((sessionPlayerId: string) =>
        db.prepare(`INSERT INTO game_participants (id, game_id, session_player_id, team_id) VALUES (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), gameId, sessionPlayerId, teamAId)),
      ...teamBMemberIds.map((sessionPlayerId: string) =>
        db.prepare(`INSERT INTO game_participants (id, game_id, session_player_id, team_id) VALUES (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), gameId, sessionPlayerId, teamBId)),
    ]

    const startedEvent = buildAppendScoreEventStatement(db, {
      gameId, sequence: 1, eventType: 'GAME_STARTED', actorUserId: 'system',
      payload: { servingTeam, teamAStartingServerSessionPlayerId, teamBStartingServerSessionPlayerId },
    })

    const statements = [
      gameStatement,
      ...participantStatements,
      startedEvent,
      buildMarkPlayingStatement(db, sessionId, sessionPlayerIds),
      buildSetCourtStatusStatement(db, sessionId, sessionCourtId, 'PLAYING'),
    ].filter(Boolean)

    await db.batch(statements)

    return { ok: true as const, game: await getGame(db, sessionId, gameId) }
  }

  // The single command every "Team A/B Won Rally" button calls (spec §7.1).
  // It does not know or care whether the rally scored a point, advanced
  // doubles' serve-change step, or side-out'd -- that classification is
  // derived from the before/after state by `classifyRallyOutcome` and
  // recorded as the actual event type, so the score_events log always
  // reflects what really happened rather than a generic "rally recorded".
  //
  // Idempotency (an optional client-generated key, e.g. a scorekeeper
  // double-tapping "Team A Won Rally" on a flaky connection) is handled
  // INLINE rather than through a shared helper: the cached-result check is a
  // cheap read that happens BEFORE any mutation, and -- per Ruling 8/9 --
  // the idempotency-record write is folded into the SAME db.batch() call as
  // the event/projection/identity writes below, so a crash between "mutation
  // committed" and "idempotency key recorded" is impossible; there is no
  // window where a domain-validation FAILURE gets cached, because the record
  // statement is only ever built once we're already past every failure
  // return and about to batch the real mutation. The DO's own serialization
  // makes the read-then-batch race-free: two "duplicate" requests can never
  // both pass the `getIdempotentResult` check before either one's result is
  // recorded.
  async recordRally(sessionId: string, gameId: string, winningTeam: 'A' | 'B', actorUserId: string, idempotencyKey?: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    if (idempotencyKey) {
      const cached = await getIdempotentResult(db, { gameId, commandType: 'RECORD_RALLY', key: idempotencyKey })
      if (cached) return cached
    }

    const game = await getGame(db, sessionId, gameId)
    if (!game) return failure('Game not found.')
    if (game.status !== 'IN_PROGRESS') return failure('Game is not in progress.')
    if (game.correctionPending) return failure('This game is under correction; use correctGame instead of recording a new rally.')

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    const ruleset = await getScoringRuleset(db, session.scoringRulesetId, session.organizationId)
    if (!ruleset) return failure('Scoring ruleset not found.')

    const before = { scoreA: game.scoreA, scoreB: game.scoreB, servingTeam: game.servingTeam, serverNumber: game.serverNumber }

    // The terminal-score guard lives HERE, not inside the pure recordRally --
    // see the plan's Ruling 3. A game that already reached a valid final
    // score must not accept another rally; finishGame (or correctGame) is
    // the only path forward from here.
    if (hasGameBeenWon(before, ruleset)) {
      return failure(`This game already has a final score (${before.scoreA}-${before.scoreB}) -- finish it instead of recording another rally.`)
    }

    const after = recordRally(before, ruleset, winningTeam)
    const outcome = classifyRallyOutcome(before, after)

    // Server-rotation identity is tracked alongside (not derived from) the
    // score/serve GameState -- see serverRotation.ts's Ruling 1. Each team's
    // "other" member is whichever roster id is NOT the team's current
    // server; that's the player who takes over on a same-team serve change
    // or picks up serve on a side out.
    const identity = { teamACurrentServerId: game.teamACurrentServerSessionPlayerId, teamBCurrentServerId: game.teamBCurrentServerSessionPlayerId }
    const teamAMembers = await getTeamWithMembers(db, game.teamAId)
    const teamBMembers = await getTeamWithMembers(db, game.teamBId)
    const teamAOtherPlayerId = (teamAMembers?.members ?? []).map((m: { sessionPlayerId: string }) => m.sessionPlayerId).find((id: string) => id !== identity.teamACurrentServerId) ?? null
    const teamBOtherPlayerId = (teamBMembers?.members ?? []).map((m: { sessionPlayerId: string }) => m.sessionPlayerId).find((id: string) => id !== identity.teamBCurrentServerId) ?? null
    const nextIdentity = nextServerIdentity(identity, before, after, teamAOtherPlayerId, teamBOtherPlayerId)

    const sequence = await getNextSequence(db, gameId)
    const eventStatement = buildAppendScoreEventStatement(db, {
      gameId, sequence, eventType: outcome, actorUserId, payload: { winningTeam },
    })
    const projectionStatement = buildUpdateGameProjectionStatement(db, gameId, {
      scoreA: after.scoreA, scoreB: after.scoreB, servingTeam: after.servingTeam, serverNumber: after.serverNumber,
      status: game.status, winningTeamId: game.winningTeamId, finalScoreA: game.finalScoreA, finalScoreB: game.finalScoreB,
      revision: sequence,
    })
    const identityStatement = buildUpdateServerIdentityStatement(db, gameId, {
      teamACurrentServerSessionPlayerId: nextIdentity.teamACurrentServerId,
      teamBCurrentServerSessionPlayerId: nextIdentity.teamBCurrentServerId,
    })

    // The post-mutation `game` is reconstructed in-memory here rather than
    // re-fetched after the batch, so it can be included in BOTH the
    // fresh-success result AND the idempotency-record value written in the
    // SAME db.batch() call below (Ruling 8/9 -- see the block comment above
    // this method). A post-batch re-fetch-then-separately-persist-into-the-
    // idempotency-row would need a SECOND db.batch() call, reintroducing the
    // exact "mutation committed, idempotency record not yet written" crash
    // window Ruling 8/9 exists to eliminate -- and a cache hit that skipped
    // `game` entirely (the bug this fixes) would let a retried call observe
    // a DIFFERENT response shape than the original call ever produced. Every
    // field below mirrors exactly what `projectionStatement`/`identityStatement`
    // persist; `updatedAt` uses a timestamp captured here rather than the one
    // `buildUpdateGameProjectionStatement` computes internally via its own
    // `nowIso()` call a few lines up, so it may differ from the persisted
    // column by a few milliseconds -- immaterial for a response snapshot,
    // and it keeps this fix scoped to this file instead of also touching
    // games.js's statement builder signature.
    const timestamp = new Date().toISOString()
    const updatedGame = {
      ...game,
      scoreA: after.scoreA,
      scoreB: after.scoreB,
      servingTeam: after.servingTeam,
      serverNumber: after.serverNumber,
      teamACurrentServerSessionPlayerId: nextIdentity.teamACurrentServerId,
      teamBCurrentServerSessionPlayerId: nextIdentity.teamBCurrentServerId,
      revision: sequence,
      updatedAt: timestamp,
    }

    // Computed purely in-memory BEFORE the batch runs (Ruling 8) -- this is
    // exactly what a cache hit above now returns too, since it's this same
    // object (JSON round-tripped) that gets persisted as the idempotency
    // record's value a few lines down. Cache hit and fresh success are
    // therefore structurally identical: same keys, same types, and (for
    // `game`) the snapshot as of the ORIGINAL successful call rather than a
    // live re-fetch that could reflect later rallies recorded since then.
    const result = { ok: true as const, state: after, outcome, servingPlayerId: deriveServingPlayer(after, nextIdentity), game: updatedGame }

    const statements = [eventStatement, projectionStatement, identityStatement]
    if (idempotencyKey) {
      statements.push(buildRecordIdempotentResultStatement(db, { gameId, commandType: 'RECORD_RALLY', key: idempotencyKey, result }))
    }

    await db.batch(statements)

    return result
  }

  // Undo pops the most recent NOT-already-reversed rally by appending a
  // compensating POINT_REVERSED event rather than deleting or rewriting the
  // original -- the score_events log stays append-only and auditable. This
  // now calls the SAME canonical `replayEvents` that gameProjection.ts
  // trusts, over the hypothetical event list with the new reversal already
  // appended, rather than performing its own duplicated fold (see Ruling
  // 5). The original per-base-plan-task-8 fold ignored SCORE_CORRECTED
  // entirely, so an undo performed after a correction had silently
  // recomputed state from the pre-correction history -- a real, confirmed
  // gap this fixes.
  //
  // KNOWN LIMITATION: this does NOT roll back server-rotation identity.
  // `team_a_current_server_session_player_id` / `team_b_current_server_
  // session_player_id` keep reflecting the state as of the just-undone
  // rally, not the rotation as it stood immediately before that rally.
  // Recomputing identity backward through an undo would require replaying
  // the identity rotation the same way `replayEvents` replays GameState,
  // and `replayEvents`'s `ReplayResult` does not currently carry identity
  // (it only folds GameState) -- extending it to do so is the natural fix,
  // but is out of scope for this task.
  async undoLastRally(sessionId: string, gameId: string, actorUserId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    const game = await getGame(db, sessionId, gameId)
    if (!game) return failure('Game not found.')
    if (game.status !== 'IN_PROGRESS') return failure('Game is not in progress.')

    const events: ScoreEvent[] = await listScoreEventsForGame(db, gameId)
    const alreadyReversed = new Set(
      events
        .filter((e: ScoreEvent) => e.eventType === 'POINT_REVERSED')
        .map((e: ScoreEvent) => (e.payload as { reversedSequence: number }).reversedSequence),
    )
    const scoringEvents = events.filter(
      (e: ScoreEvent) => ['POINT_AWARDED', 'SERVE_CHANGED', 'SIDE_OUT'].includes(e.eventType) && !alreadyReversed.has(e.sequence),
    )
    const lastRally = scoringEvents.at(-1)
    if (!lastRally) return failure('There is no rally to undo.')

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    const ruleset = await getScoringRuleset(db, session.scoringRulesetId, session.organizationId)
    if (!ruleset) return failure('Scoring ruleset not found.')

    const nextSequence = await getNextSequence(db, gameId)
    const hypotheticalEvents = [
      ...events.map((e: ScoreEvent) => ({ sequence: e.sequence, eventType: e.eventType, payload: e.payload })),
      { sequence: nextSequence, eventType: 'POINT_REVERSED', payload: { reversedSequence: lastRally.sequence } },
    ]
    const replayed = replayEvents(hypotheticalEvents, ruleset)

    const reversalEvent = buildAppendScoreEventStatement(db, {
      gameId, sequence: nextSequence, eventType: 'POINT_REVERSED', actorUserId, payload: { reversedSequence: lastRally.sequence },
    })
    const projectionStatement = buildUpdateGameProjectionStatement(db, gameId, {
      scoreA: replayed.state.scoreA, scoreB: replayed.state.scoreB, servingTeam: replayed.state.servingTeam, serverNumber: replayed.state.serverNumber,
      status: replayed.status, winningTeamId: replayed.winningTeamId, finalScoreA: replayed.finalScoreA, finalScoreB: replayed.finalScoreB,
      revision: nextSequence,
    })

    await db.batch([reversalEvent, projectionStatement])

    return { ok: true as const, state: replayed.state, game: await getGame(db, sessionId, gameId) }
  }

  // Finishes a game AND releases its court in ONE db.batch() -- not a
  // finish call followed by a separate this.releaseCourt(...) call. The
  // release-side statements below are the SAME build*Statement functions
  // releaseCourt itself uses, composed directly into this batch instead of
  // going through a second, non-atomic DO call. Without this, there would be
  // a window where the game is FINISHED but the court/queue still say
  // otherwise (or vice versa, on a crash between the two calls). releaseCourt
  // itself is UNCHANGED and remains independently callable -- e.g. a
  // facilitator releasing a court that never had a game started on it.
  //
  // Idempotency mirrors recordRally's Ruling 8/9: the cached-result check
  // happens before any mutation, and the record statement is only ever
  // appended once every failure path (including the final-score validation
  // below) has already returned. A retry after the score legitimately
  // changes must not be poisoned by a cached validation failure, so a
  // failed `isValidFinalScore` check returns WITHOUT writing any
  // idempotency record at all.
  //
  // Also mirroring recordRally (Ruling 8): the post-mutation `game` is
  // reconstructed in-memory as `finishedGame` below, BEFORE the batch runs,
  // rather than re-fetched via a post-batch getGame(...) call. That in-
  // memory object is what goes into BOTH the fresh-success `result` AND the
  // idempotency-record value persisted in the SAME db.batch() -- so a cache
  // hit on retry returns exactly the same shape (including `game`) as the
  // original call did, instead of silently omitting `game` the way this
  // method used to on the cache-hit path.
  async finishGame(sessionId: string, gameId: string, actorUserId: string, idempotencyKey?: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    if (idempotencyKey) {
      const cached = await getIdempotentResult(db, { gameId, commandType: 'FINISH_GAME', key: idempotencyKey })
      if (cached) return cached
    }

    const game = await getGame(db, sessionId, gameId)
    if (!game) return failure('Game not found.')
    if (game.status !== 'IN_PROGRESS') return failure('Game is not in progress.')

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    const ruleset = await getScoringRuleset(db, session.scoringRulesetId, session.organizationId)
    if (!ruleset) return failure('Scoring ruleset not found.')

    if (!isValidFinalScore(game.scoreA, game.scoreB, ruleset)) {
      // Do NOT record an idempotency result here -- see the block comment
      // above. A retry with the same key after the score legitimately
      // changes must not be poisoned by this failed attempt.
      return failure(`${game.scoreA}-${game.scoreB} is not a valid final score for this ruleset.`)
    }

    const winningTeamId = game.scoreA > game.scoreB ? game.teamAId : game.teamBId
    const sequence = await getNextSequence(db, gameId)

    const finishedEvent = buildAppendScoreEventStatement(db, {
      gameId, sequence, eventType: 'GAME_FINISHED', actorUserId,
      payload: { finalScoreA: game.scoreA, finalScoreB: game.scoreB, winningTeamId },
    })
    const projectionStatement = buildUpdateGameProjectionStatement(db, gameId, {
      scoreA: game.scoreA, scoreB: game.scoreB, servingTeam: game.servingTeam, serverNumber: game.serverNumber,
      status: 'FINISHED', winningTeamId, finalScoreA: game.scoreA, finalScoreB: game.scoreB, revision: sequence,
    })

    const participantsResult = await db
      .prepare(
        `SELECT gp.session_player_id, gp.team_id, sp.player_id
         FROM game_participants gp JOIN session_players sp ON sp.id = gp.session_player_id
         WHERE gp.game_id = ?`,
      )
      .bind(gameId)
      .all<{ session_player_id: string; team_id: string; player_id: string }>()
    const participants = participantsResult.results || []

    const timestamp = new Date().toISOString()
    const statStatements = participants.map((p) => {
      const isTeamA = p.team_id === game.teamAId
      const pointsFor = isTeamA ? game.scoreA : game.scoreB
      const pointsAgainst = isTeamA ? game.scoreB : game.scoreA
      return buildCreatePlayerGameStatStatement(db, {
        gameId, playerId: p.player_id, pointsFor, pointsAgainst,
        gamePerformance: gamePerformance(pointsFor, pointsAgainst),
        isWin: p.team_id === winningTeamId, eligibleForOpi: true,
      })
    })

    const matchmakingStatements: unknown[] = []
    const teamAPlayers = participants.filter((p) => p.team_id === game.teamAId).map((p) => p.player_id)
    const teamBPlayers = participants.filter((p) => p.team_id === game.teamBId).map((p) => p.player_id)
    for (const players of [teamAPlayers, teamBPlayers]) {
      for (let i = 0; i < players.length; i += 1) {
        for (let j = i + 1; j < players.length; j += 1) {
          matchmakingStatements.push(
            buildUpsertMatchmakingStatement(db, { sessionId, playerId: players[i], otherPlayerId: players[j], relation: 'PARTNER', timestamp }),
            buildUpsertMatchmakingStatement(db, { sessionId, playerId: players[j], otherPlayerId: players[i], relation: 'PARTNER', timestamp }),
          )
        }
      }
    }
    for (const playerA of teamAPlayers) {
      for (const playerB of teamBPlayers) {
        matchmakingStatements.push(
          buildUpsertMatchmakingStatement(db, { sessionId, playerId: playerA, otherPlayerId: playerB, relation: 'OPPONENT', timestamp }),
          buildUpsertMatchmakingStatement(db, { sessionId, playerId: playerB, otherPlayerId: playerA, relation: 'OPPONENT', timestamp }),
        )
      }
    }

    const gamesPlayedStatements = participants.map((p) => buildIncrementGamesPlayedStatement(db, sessionId, p.session_player_id))

    // Atomic release: the SAME statements releaseCourt itself builds,
    // composed directly into THIS batch rather than calling
    // this.releaseCourt(...) as a second, separate DO call afterward -- no
    // window where the game is FINISHED but the court/queue still say
    // otherwise. releaseCourt itself remains independently callable (a
    // facilitator can still release a court with no finished game behind it).
    const releasedSessionPlayerIds = participants.map((p) => p.session_player_id)
    const requeued = session.postGameRotationPolicy === 'AUTO_REQUEUE_ALL'
    const releaseStatements = releasedSessionPlayerIds.flatMap((sessionPlayerId) => [
      buildCloseQueueEntryStatement(db, sessionId, sessionPlayerId),
      ...(requeued ? [buildJoinQueueStatement(db, { sessionId, sessionPlayerId })] : []),
    ])
    releaseStatements.push(buildClearTeamCourtBindingStatement(db, sessionId, game.sessionCourtId))
    releaseStatements.push(buildSetCourtStatusStatement(db, sessionId, game.sessionCourtId, 'AVAILABLE'))

    // Built purely in-memory BEFORE the batch runs, mirroring recordRally's
    // `updatedGame` (Ruling 8). Every field mirrors exactly what
    // `projectionStatement` persists. `finishedAt`/`updatedAt` reuse the
    // `timestamp` captured above rather than the `nowIso()` calls
    // `buildUpdateGameProjectionStatement` makes internally, so they may
    // differ from the persisted columns by a few milliseconds --
    // immaterial for a response snapshot, and it keeps this fix scoped to
    // this file instead of also touching games.js's statement builder.
    const finishedGame = {
      ...game,
      status: 'FINISHED' as const,
      winningTeamId,
      finalScoreA: game.scoreA,
      finalScoreB: game.scoreB,
      revision: sequence,
      finishedAt: timestamp,
      updatedAt: timestamp,
    }

    // Computed purely in-memory BEFORE the batch runs (Ruling 8) -- this is
    // exactly what a cache hit above now returns too, since it's this same
    // object (JSON round-tripped) that gets persisted as the idempotency
    // record's value a few lines down. Cache hit and fresh success are
    // therefore structurally identical: same keys, same types, and (for
    // `game`) the snapshot as of the ORIGINAL successful call rather than a
    // live re-fetch that could reflect a later correction/abandon recorded
    // since then.
    const result = {
      ok: true as const, winningTeamId, finalScoreA: game.scoreA, finalScoreB: game.scoreB,
      releasedSessionPlayerIds, requeued, game: finishedGame,
    }

    const statements = [finishedEvent, projectionStatement, ...statStatements, ...matchmakingStatements, ...gamesPlayedStatements, ...releaseStatements]
    if (idempotencyKey) {
      statements.push(buildRecordIdempotentResultStatement(db, { gameId, commandType: 'FINISH_GAME', key: idempotencyKey, result }))
    }

    await db.batch(statements)

    return result
  }

  // Abandons a game AND releases its court in ONE db.batch(), same atomicity
  // principle as finishGame above. Deliberately skips player_game_stats,
  // matchmaking_history, and the games_played increment entirely -- an
  // abandoned game was never actually completed and is explicitly excluded
  // from OPI (edge case #18), so none of finishGame's stat/matchmaking
  // bookkeeping applies here.
  async abandonGame(sessionId: string, gameId: string, actorUserId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    const game = await getGame(db, sessionId, gameId)
    if (!game) return failure('Game not found.')
    if (game.status !== 'IN_PROGRESS') return failure('Game is not in progress.')

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')

    const sequence = await getNextSequence(db, gameId)
    const abandonedEvent = buildAppendScoreEventStatement(db, { gameId, sequence, eventType: 'GAME_ABANDONED', actorUserId, payload: {} })
    const projectionStatement = buildUpdateGameProjectionStatement(db, gameId, {
      scoreA: game.scoreA, scoreB: game.scoreB, servingTeam: game.servingTeam, serverNumber: game.serverNumber,
      status: 'ABANDONED', winningTeamId: null, finalScoreA: null, finalScoreB: null, revision: sequence,
    })

    // No player_game_stats, no matchmaking_history, no games_played increment
    // -- an abandoned game is explicitly excluded from OPI (edge case #18) and
    // was never actually completed. Court/queue release IS atomic with the
    // abandonment, same principle as finishGame.
    const sessionPlayerIds: string[] = await listAssignedSessionPlayerIdsForCourt(db, sessionId, game.sessionCourtId)
    const requeued = session.postGameRotationPolicy === 'AUTO_REQUEUE_ALL'
    const releaseStatements = sessionPlayerIds.flatMap((sessionPlayerId) => [
      buildCloseQueueEntryStatement(db, sessionId, sessionPlayerId),
      ...(requeued ? [buildJoinQueueStatement(db, { sessionId, sessionPlayerId })] : []),
    ])
    releaseStatements.push(buildClearTeamCourtBindingStatement(db, sessionId, game.sessionCourtId))
    releaseStatements.push(buildSetCourtStatusStatement(db, sessionId, game.sessionCourtId, 'AVAILABLE'))

    await db.batch([abandonedEvent, projectionStatement, ...releaseStatements])

    return { ok: true as const, releasedSessionPlayerIds: sessionPlayerIds, requeued, game: await getGame(db, sessionId, gameId) }
  }
}
