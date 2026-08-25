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
import { buildSetAvailabilityByIdStatement } from '../repositories/pickleball/sessionPlayers.js'
import { buildCreateGameStatement, buildUpdateGameProjectionStatement, getGame } from '../repositories/pickleball/games.js'
import { getNextSequence, buildAppendScoreEventStatement, listScoreEventsForGame } from '../repositories/pickleball/scoreEvents.js'
import { getIdempotentResult, buildRecordIdempotentResultStatement } from '../repositories/pickleball/idempotencyKeys.js'
import { selectNextPlayers, type QueueCandidate } from '../../lib/pickleball/queueEngine'
import { recordRally, classifyRallyOutcome } from '../../lib/pickleball/scoring/recordRally'
import { initialGameState } from '../../lib/pickleball/scoring/gameState'

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

  // Every command that mutates a game accepts an optional client-generated
  // idempotency key. If the same key is seen again (a duplicated/retried
  // request, e.g. a scorekeeper double-tapping "Finish Game" on a flaky
  // connection), the ORIGINAL result is returned unchanged instead of the
  // command re-applying its effects a second time. The DO's own serialization
  // makes this race-free: two "duplicate" requests can never both pass the
  // `getIdempotentResult` check before either one's result is recorded.
  private async withIdempotency<T>(gameId: string, idempotencyKey: string | undefined, run: () => Promise<T>): Promise<T> {
    const db = this.env.PICKLEBALL_DB
    if (idempotencyKey) {
      const cached = await getIdempotentResult(db, idempotencyKey)
      if (cached) return cached as T
    }
    const result = await run()
    if (idempotencyKey) {
      await buildRecordIdempotentResultStatement(db, { key: idempotencyKey, gameId, result }).run()
    }
    return result
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

  async startGame(sessionId: string, sessionCourtId: string) {
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
    const [teamAId, teamBId] = courtTeamIds

    const gameId = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    const servingTeam: 'A' | 'B' = 'A'

    const gameStatement = buildCreateGameStatement(db, {
      id: gameId, sessionId, sessionCourtId, scoringRulesetId: ruleset.id, format: ruleset.format,
      teamAId, teamBId, servingTeam, timestamp,
    })

    const teamAMembers = await getTeamWithMembers(db, teamAId)
    const teamBMembers = await getTeamWithMembers(db, teamBId)
    const participantStatements = [
      ...(teamAMembers?.members ?? []).map((m: { sessionPlayerId: string }) =>
        db.prepare(`INSERT INTO game_participants (id, game_id, session_player_id, team_id) VALUES (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), gameId, m.sessionPlayerId, teamAId)),
      ...(teamBMembers?.members ?? []).map((m: { sessionPlayerId: string }) =>
        db.prepare(`INSERT INTO game_participants (id, game_id, session_player_id, team_id) VALUES (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), gameId, m.sessionPlayerId, teamBId)),
    ]

    const startedEvent = buildAppendScoreEventStatement(db, {
      gameId, sequence: 1, eventType: 'GAME_STARTED', actorUserId: 'system', payload: { servingTeam },
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
  async recordRally(sessionId: string, gameId: string, winningTeam: 'A' | 'B', actorUserId: string, idempotencyKey?: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    return this.withIdempotency(gameId, idempotencyKey, async () => {
      const db = this.env.PICKLEBALL_DB

      const game = await getGame(db, sessionId, gameId)
      if (!game) return failure('Game not found.')
      if (game.status !== 'IN_PROGRESS') return failure('Game is not in progress.')

      const session = await getSessionById(db, sessionId)
      if (!session) return failure('Session not found.')
      const ruleset = await getScoringRuleset(db, session.scoringRulesetId, session.organizationId)
      if (!ruleset) return failure('Scoring ruleset not found.')

      const before = { scoreA: game.scoreA, scoreB: game.scoreB, servingTeam: game.servingTeam, serverNumber: game.serverNumber }
      const after = recordRally(before, ruleset, winningTeam)
      const outcome = classifyRallyOutcome(before, after)

      const sequence = await getNextSequence(db, gameId)
      const eventStatement = buildAppendScoreEventStatement(db, {
        gameId, sequence, eventType: outcome, actorUserId, payload: { winningTeam },
      })
      const projectionStatement = buildUpdateGameProjectionStatement(db, gameId, {
        scoreA: after.scoreA, scoreB: after.scoreB, servingTeam: after.servingTeam, serverNumber: after.serverNumber,
        status: game.status, winningTeamId: game.winningTeamId, finalScoreA: game.finalScoreA, finalScoreB: game.finalScoreB,
        revision: sequence,
      })

      await db.batch([eventStatement, projectionStatement])

      return { ok: true as const, state: after, outcome, game: await getGame(db, sessionId, gameId) }
    })
  }

  // Undo pops the most recent NOT-already-reversed rally by appending a
  // compensating POINT_REVERSED event rather than deleting or rewriting the
  // original -- the score_events log stays append-only and auditable, and
  // replayEvents() (Task 3) already knows how to skip a reversed sequence
  // when reconstructing state from the full log. This method needs the
  // recomputed state synchronously (to write the projection), so it performs
  // the equivalent fold itself over just the remaining scoring events rather
  // than calling replayEvents() over the whole log.
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

    // Recompute by replaying every remaining scoring event -- the same fold
    // Task 3's replayEvents() performs over the whole log, applied here to
    // just the non-reversed scoring events. The true opening servingTeam
    // comes from the actual GAME_STARTED event's payload, exactly as
    // replayEvents.ts's own GAME_STARTED case reads it, rather than from any
    // positional assumption about the log.
    const startedEvent = events.find((e: ScoreEvent) => e.eventType === 'GAME_STARTED')
    if (!startedEvent) return failure('Game has no GAME_STARTED event; cannot recompute state.')

    const remainingScoringEvents = scoringEvents.filter((e: ScoreEvent) => e.sequence !== lastRally.sequence)
    let state = initialGameState((startedEvent.payload as { servingTeam: 'A' | 'B' }).servingTeam, ruleset.format)
    for (const event of remainingScoringEvents) {
      state = recordRally(state, ruleset, (event.payload as { winningTeam: 'A' | 'B' }).winningTeam)
    }

    const nextSequence = await getNextSequence(db, gameId)
    const reversalEvent = buildAppendScoreEventStatement(db, {
      gameId, sequence: nextSequence, eventType: 'POINT_REVERSED', actorUserId, payload: { reversedSequence: lastRally.sequence },
    })
    const projectionStatement = buildUpdateGameProjectionStatement(db, gameId, {
      scoreA: state.scoreA, scoreB: state.scoreB, servingTeam: state.servingTeam, serverNumber: state.serverNumber,
      status: game.status, winningTeamId: game.winningTeamId, finalScoreA: game.finalScoreA, finalScoreB: game.finalScoreB,
      revision: nextSequence,
    })

    await db.batch([reversalEvent, projectionStatement])

    return { ok: true as const, state, game: await getGame(db, sessionId, gameId) }
  }
}
