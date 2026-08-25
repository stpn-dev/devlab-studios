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
  hasTeamBoundToCourt,
} from '../repositories/pickleball/teams.js'
import {
  buildSetAvailabilityByIdStatement,
  buildIncrementGamesPlayedStatement,
  buildRecomputeGamesPlayedStatement,
} from '../repositories/pickleball/sessionPlayers.js'
import {
  buildCreateGameStatement,
  buildUpdateGameProjectionStatement,
  buildUpdateServerIdentityStatement,
  getGame,
} from '../repositories/pickleball/games.js'
import { getNextSequence, buildAppendScoreEventStatement, listScoreEventsForGame } from '../repositories/pickleball/scoreEvents.js'
import { getIdempotentResult, buildRecordIdempotentResultStatement } from '../repositories/pickleball/idempotencyKeys.js'
import {
  buildCreatePlayerGameStatStatement,
  buildDeletePlayerGameStatsForGameStatement,
} from '../repositories/pickleball/playerGameStats.js'
import {
  buildUpsertMatchmakingStatement,
  recomputeMatchmakingHistoryStatements,
} from '../repositories/pickleball/matchmakingHistory.js'
import { buildSessionSnapshot } from './sessionSnapshot.js'
import { toPublicSessionView } from '../../lib/pickleball/publicSessionView'
import { selectNextPlayers, type QueueCandidate } from '../../lib/pickleball/queueEngine'
import { recordRally, classifyRallyOutcome } from '../../lib/pickleball/scoring/recordRally'
import { initialGameState } from '../../lib/pickleball/scoring/gameState'
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
  // In-memory monotonic counter, informational only — see the realtime
  // spec's Decision 3. It resets to 0 whenever the DO hibernates and wakes
  // fresh; that is harmless because every broadcast carries a COMPLETE
  // snapshot, never a diff a client would need to reconcile against a prior
  // seq.
  private seq = 0

  // The entire concurrency guarantee rests on every caller deriving this stub
  // via `idFromName(sessionId)` for the SAME sessionId it then passes in.
  // Nothing in the platform enforces that pairing, so a caller that mixed them
  // up would get a coordinator serializing the wrong session's work — silently
  // losing mutual exclusion. This asserts the pairing instead of trusting it.
  private ownsSession(sessionId: string): boolean {
    return this.ctx.id.equals(this.env.SESSION_COORDINATOR.idFromName(sessionId))
  }

  // Entry point for the two realtime channels (spec §9). Reachable only via
  // env.SESSION_COORDINATOR.get(...).fetch() from the two Astro routes below
  // — never directly from the internet — so the headers those routes set
  // are trusted the same way every RPC method's sessionId parameter is
  // trusted, with the same ownsSession self-check as defense in depth.
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade request.', { status: 400 })
    }

    const sessionId = request.headers.get('X-Pickleball-Session-Id')
    if (!sessionId || !this.ownsSession(sessionId)) {
      return new Response('Coordinator/session mismatch.', { status: 400 })
    }

    const channel = request.headers.get('X-Pickleball-Channel')
    if (channel !== 'operator' && channel !== 'public') {
      return new Response('Missing or invalid X-Pickleball-Channel header.', { status: 400 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    // Hibernation API: the DO can evict from memory between messages instead
    // of staying pinned for every open connection (spec's Decision 4). The
    // tag lets broadcast() (Task 4) target one channel without deserializing
    // every socket's attachment; the attachment (set right below) carries the
    // sessionId/channel pair itself, since one DO instance never needs to
    // hold a trusted "this.sessionId" field of its own (see ownsSession's
    // comment on why nothing here is ever assumed rather than checked).
    this.ctx.acceptWebSocket(server, [channel])
    server.serializeAttachment({ sessionId, channel })

    const snapshot = await buildSessionSnapshot(this.env.PICKLEBALL_DB, sessionId)
    // Type-only cast, no runtime check added: buildSessionSnapshot's plain-JS
    // return type carries `session: {...} | null` because getSessionById can
    // theoretically return null, but by the time ANY request reaches this
    // fetch() handler, the calling Astro route (operator: [sessionId].ts;
    // public: rt/public/[code].ts) has already resolved and 404'd on a
    // missing session before ever invoking the DO -- see this task's plan
    // notes. toPublicSessionView's allowlist type intentionally has no `|
    // null` on `session` for the same reason every other allowlisted field
    // is spelled out explicitly rather than inferred.
    const payload = channel === 'public' ? toPublicSessionView(snapshot as Parameters<typeof toPublicSessionView>[0]) : snapshot
    this.seq += 1
    server.send(JSON.stringify({ type: 'STATE', sessionId, seq: this.seq, payload }))

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    // Task 4 adds real handling (RESYNC_REQUEST). For now, every inbound
    // message is ignored — the DO never accepts a mutation over the socket
    // (spec: all mutations stay REST/RPC).
    void ws
    void message
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // Hibernation API removes a closed socket from ctx.getWebSockets()
    // automatically; there is no other per-socket state to clean up.
    void wasClean
    ws.close(code, reason)
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    void error
    ws.close(1011, 'Internal error.')
  }

  // Shared release-safety guard for finishGame AND abandonGame.
  //
  // Both of those compose court-release statements (clear the team-court
  // binding, flip the court to AVAILABLE, close/requeue queue entries) that
  // are derived from the COURT's current occupants rather than from the
  // game's own participants. That is only safe while the game being
  // finished/abandoned really IS that court's current occupant. It very
  // often is NOT:
  //
  //   * `status = 'IN_PROGRESS'` does not mean "physically on a court": a
  //     REOPENED game (correction_pending = 1) is IN_PROGRESS again even
  //     though its court was released — and very likely reassigned to a
  //     later, still-live game — back when it first finished.
  //   * releaseCourt accepts a PLAYING court, so a court can be released and
  //     reassigned out from under a game by another path entirely, after
  //     which that game's own finish/abandon would clobber the NEW occupant.
  //
  // So: release only when the court is still PLAYING and one of this game's
  // own two teams is still the team bound to it. Otherwise the game still
  // finishes/abandons normally (its `games` row still transitions, its events
  // are still appended) and only the "hand this court back to the pool" side
  // effect is skipped, because that court is no longer this game's to hand
  // back.
  private async gameStillHoldsItsCourt(
    db: D1Database,
    sessionId: string,
    game: { sessionCourtId: string; teamAId: string; teamBId: string },
  ): Promise<boolean> {
    if (!game.sessionCourtId) return false

    const court = await getSessionCourt(db, sessionId, game.sessionCourtId)
    if (!court || court.status !== 'PLAYING') return false

    return hasTeamBoundToCourt(db, sessionId, game.sessionCourtId, [game.teamAId, game.teamBId])
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

    // The opening state comes from `initialGameState` -- the SAME function
    // replayEvents folds a GAME_STARTED event through -- so the row this
    // INSERT writes and a later replay of this game's events can never
    // disagree about the opening serverNumber (2 for doubles' traditional
    // "0-0-2", 1 for singles, where the server-1/server-2 distinction does
    // not exist). games.js no longer re-derives it.
    const opening = initialGameState(servingTeam, ruleset.format)

    const gameStatement = buildCreateGameStatement(db, {
      id: gameId, sessionId, sessionCourtId, scoringRulesetId: ruleset.id, format: ruleset.format,
      teamAId, teamBId, servingTeam, serverNumber: opening.serverNumber,
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
  // Explicit return type -- same TS2589 workaround as finishGame above (see
  // that method's comment): a caller narrowing on `outcome.ok` (rally.ts)
  // otherwise blows the RPC provider's type-instantiation depth on this
  // method's richly-inferred `state`/`outcome`/`servingPlayerId`/`game`
  // fields. No behavior change; `unknown` is used for fields no caller reads
  // in a typed way.
  async recordRally(
    sessionId: string,
    gameId: string,
    winningTeam: 'A' | 'B',
    actorUserId: string,
    idempotencyKey?: string,
  ): Promise<
    | { ok: false; error: string }
    | { ok: true; state: unknown; outcome: string; servingPlayerId: unknown; game: unknown }
  > {
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
  // Explicit return type -- same TS2589 workaround as finishGame/recordRally
  // above.
  async undoLastRally(
    sessionId: string,
    gameId: string,
    actorUserId: string,
  ): Promise<{ ok: false; error: string } | { ok: true; state: unknown; game: unknown }> {
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
  // Explicit return type (added by this hardening task's Task 8, type-only --
  // no behavior change): this method's two success branches (the
  // correctionPending re-finish path and the normal path) build structurally
  // different inline `result` object literals. Left inferred, that union --
  // once run through DurableObjectStub's RPC provider type mapping -- blows
  // up into TS2589 "Type instantiation is excessively deep and possibly
  // infinite" the moment a caller narrows on `outcome.ok` (see finish.ts).
  // `game` is typed `unknown` here rather than re-declaring games.js's
  // ~24-field projection shape, since no caller needs typed access to it --
  // every route just forwards the whole outcome object into jsonResponse.
  async finishGame(
    sessionId: string,
    gameId: string,
    actorUserId: string,
    idempotencyKey?: string,
  ): Promise<
    | { ok: false; error: string }
    | {
        ok: true
        winningTeamId: string
        finalScoreA: number
        finalScoreB: number
        releasedSessionPlayerIds: string[]
        requeued: boolean
        game: unknown
      }
  > {
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

    // Re-finish after a historical correction (issue #12): the court was
    // already released and its players already moved on when this game
    // first finished, so this branch must NOT release the court again and
    // must NOT re-increment games_played incrementally (this game's
    // contribution may already be counted once from before the reopen) --
    // recompute both games_played and matchmaking_history from scratch
    // instead (Ruling 11). finishedEvent/projectionStatement/statStatements
    // above are identical regardless of which path is taken, so this branch
    // reuses them rather than recomputing anything already built. `result`
    // is built the SAME way the normal path below builds its `result` --
    // with an in-memory `finishedGame` snapshot embedded as `game` BEFORE the
    // batch runs, so a fresh call and an idempotency-key cache hit against
    // this same result return identical, `game`-inclusive shapes (see the
    // block comment on the normal path's `result` a bit further down for why
    // this matters).
    //
    // Its "must NOT release the court again" half is now ALSO covered by the
    // general `gameStillHoldsItsCourt` guard on the normal path below (a
    // reopened game's teams were unbound from the court when it first
    // finished, so the guard would skip the release anyway). The branch stays
    // because its OTHER half is not subsumed: recomputing games_played and
    // matchmaking_history from scratch instead of incrementing/upserting them
    // is specific to a re-finish and has nothing to do with the court.
    if (game.correctionPending) {
      const clearCorrectionStatement = db.prepare(`UPDATE games SET correction_pending = 0 WHERE id = ?`).bind(gameId)
      const gamesPlayedStatements = participants.map((p) => buildRecomputeGamesPlayedStatement(db, sessionId, p.session_player_id))
      // Pure SQL, built without reading D1 -- and appended LAST in the batch
      // below so its `WHERE status = 'FINISHED'` is evaluated after
      // `projectionStatement` has already flipped this game back to FINISHED.
      const matchmakingRecomputeStatements = recomputeMatchmakingHistoryStatements(db, sessionId)

      const finishedGame = {
        ...game,
        status: 'FINISHED' as const,
        correctionPending: false,
        winningTeamId,
        finalScoreA: game.scoreA,
        finalScoreB: game.scoreB,
        revision: sequence,
        finishedAt: timestamp,
        updatedAt: timestamp,
      }

      const result = {
        ok: true as const, winningTeamId, finalScoreA: game.scoreA, finalScoreB: game.scoreB,
        releasedSessionPlayerIds: [] as string[], requeued: false, game: finishedGame,
      }

      const statements = [
        finishedEvent, projectionStatement, clearCorrectionStatement, ...statStatements,
        ...gamesPlayedStatements, ...matchmakingRecomputeStatements,
      ]
      if (idempotencyKey) {
        statements.push(buildRecordIdempotentResultStatement(db, { gameId, commandType: 'FINISH_GAME', key: idempotencyKey, result }))
      }

      await db.batch(statements)

      return result
    }

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
    //
    // Gated on the shared `gameStillHoldsItsCourt` guard (see its comment):
    // if this game is no longer the court's current occupant, the release is
    // skipped entirely rather than clobbering whatever occupancy took over.
    const holdsCourt = await this.gameStillHoldsItsCourt(db, sessionId, game)
    const releasedSessionPlayerIds = holdsCourt ? participants.map((p) => p.session_player_id) : []
    const requeued = holdsCourt && session.postGameRotationPolicy === 'AUTO_REQUEUE_ALL'
    const releaseStatements = releasedSessionPlayerIds.flatMap((sessionPlayerId) => [
      buildCloseQueueEntryStatement(db, sessionId, sessionPlayerId),
      ...(requeued ? [buildJoinQueueStatement(db, { sessionId, sessionPlayerId })] : []),
    ])
    if (holdsCourt) {
      releaseStatements.push(buildClearTeamCourtBindingStatement(db, sessionId, game.sessionCourtId))
      releaseStatements.push(buildSetCourtStatusStatement(db, sessionId, game.sessionCourtId, 'AVAILABLE'))
    }

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
  // Explicit return type -- same TS2589 workaround as finishGame/recordRally
  // above.
  async abandonGame(
    sessionId: string,
    gameId: string,
    actorUserId: string,
  ): Promise<
    | { ok: false; error: string }
    | { ok: true; releasedSessionPlayerIds: string[]; requeued: boolean; game: unknown }
  > {
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
    //
    // ...and, exactly as in finishGame, that release only happens while this
    // game is still the court's current occupant (see
    // `gameStillHoldsItsCourt`). `status !== 'IN_PROGRESS'` above is NOT
    // sufficient on its own: a REOPENED game is IN_PROGRESS again long after
    // its court was released and reassigned, so an abandon issued against it
    // would otherwise release whatever DIFFERENT live game now holds that
    // court.
    const holdsCourt = await this.gameStillHoldsItsCourt(db, sessionId, game)
    const sessionPlayerIds: string[] = holdsCourt
      ? await listAssignedSessionPlayerIdsForCourt(db, sessionId, game.sessionCourtId)
      : []
    const requeued = holdsCourt && session.postGameRotationPolicy === 'AUTO_REQUEUE_ALL'
    const releaseStatements = sessionPlayerIds.flatMap((sessionPlayerId) => [
      buildCloseQueueEntryStatement(db, sessionId, sessionPlayerId),
      ...(requeued ? [buildJoinQueueStatement(db, { sessionId, sessionPlayerId })] : []),
    ])
    if (holdsCourt) {
      releaseStatements.push(buildClearTeamCourtBindingStatement(db, sessionId, game.sessionCourtId))
      releaseStatements.push(buildSetCourtStatusStatement(db, sessionId, game.sessionCourtId, 'AVAILABLE'))
    }

    await db.batch([abandonedEvent, projectionStatement, ...releaseStatements])

    return { ok: true as const, releasedSessionPlayerIds: sessionPlayerIds, requeued, game: await getGame(db, sessionId, gameId) }
  }

  // Reopens an already-FINISHED game for a historical correction (issue #12).
  // Deliberately does NOT touch the court or queue -- the court was already
  // released and its players already moved on when the game first finished,
  // so there is nothing court/queue-side to undo. `status` returns to
  // IN_PROGRESS (Ruling 2: no new status value, so existing readers of
  // `status` keep working unchanged) but `correction_pending = 1` is the real
  // signal: recordRally checks this flag and refuses ordinary rallies against
  // a reopened game until correctGame + a re-finish clear it again.
  // Explicit return type -- same TS2589 workaround as finishGame/recordRally
  // above.
  async reopenGame(
    sessionId: string,
    gameId: string,
    actorUserId: string,
  ): Promise<{ ok: false; error: string } | { ok: true; game: unknown }> {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    const game = await getGame(db, sessionId, gameId)
    if (!game) return failure('Game not found.')
    if (game.status !== 'FINISHED') return failure('Only a finished game can be reopened.')

    const sequence = await getNextSequence(db, gameId)
    const reopenedEvent = buildAppendScoreEventStatement(db, { gameId, sequence, eventType: 'GAME_REOPENED', actorUserId, payload: {} })
    const projectionStatement = buildUpdateGameProjectionStatement(db, gameId, {
      scoreA: game.scoreA, scoreB: game.scoreB, servingTeam: game.servingTeam, serverNumber: game.serverNumber,
      status: 'IN_PROGRESS', winningTeamId: null, finalScoreA: null, finalScoreB: null, revision: sequence,
    })
    const correctionFlagStatement = db.prepare(`UPDATE games SET correction_pending = 1 WHERE id = ?`).bind(gameId)
    const invalidateStatsStatement = buildDeletePlayerGameStatsForGameStatement(db, gameId)

    // Deterministic recomputation (Ruling 11) rather than incremental
    // subtraction, since this game's contribution to games_played /
    // matchmaking_history is being invalidated: recompute both from scratch
    // now that this game no longer counts as FINISHED.
    const participantsResult = await db
      .prepare(`SELECT DISTINCT gp.session_player_id FROM game_participants gp WHERE gp.game_id = ?`)
      .bind(gameId)
      .all<{ session_player_id: string }>()
    const sessionPlayerIds = (participantsResult.results || []).map((row) => row.session_player_id)
    const gamesPlayedStatements = sessionPlayerIds.map((id) => buildRecomputeGamesPlayedStatement(db, sessionId, id))
    // Pure SQL, built without reading D1 -- and appended LAST in the batch
    // below so its `WHERE status = 'FINISHED'` is evaluated after
    // `projectionStatement` has already moved this game off FINISHED.
    const matchmakingStatements = recomputeMatchmakingHistoryStatements(db, sessionId)

    await db.batch([
      reopenedEvent, projectionStatement, correctionFlagStatement, invalidateStatsStatement,
      ...gamesPlayedStatements, ...matchmakingStatements,
    ])

    return { ok: true as const, game: await getGame(db, sessionId, gameId) }
  }

  // Corrects an IN_PROGRESS game's score/serving state, whether that game is
  // genuinely still live (correction_pending = 0, a mid-game mistake caught
  // before finishing) or was reopened for a historical correction
  // (correction_pending = 1). Deliberately does NOT require correction_pending
  // to be set -- see section 7 of the hardening plan: correcting a mistake
  // while a game is still physically IN_PROGRESS does not require going
  // through reopenGame first.
  // Explicit return type -- same TS2589 workaround as finishGame/recordRally
  // above.
  async correctGame(
    sessionId: string,
    gameId: string,
    actorUserId: string,
    correctedState: { scoreA: number; scoreB: number; servingTeam: 'A' | 'B'; serverNumber: 1 | 2 },
  ): Promise<{ ok: false; error: string } | { ok: true; game: unknown }> {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    const game = await getGame(db, sessionId, gameId)
    if (!game) return failure('Game not found.')
    if (game.status !== 'IN_PROGRESS') return failure('Reopen the game before correcting its score.')

    const sequence = await getNextSequence(db, gameId)
    const correctedEvent = buildAppendScoreEventStatement(db, { gameId, sequence, eventType: 'SCORE_CORRECTED', actorUserId, payload: correctedState })
    const projectionStatement = buildUpdateGameProjectionStatement(db, gameId, {
      scoreA: correctedState.scoreA, scoreB: correctedState.scoreB, servingTeam: correctedState.servingTeam, serverNumber: correctedState.serverNumber,
      status: 'IN_PROGRESS', winningTeamId: null, finalScoreA: null, finalScoreB: null, revision: sequence,
    })

    await db.batch([correctedEvent, projectionStatement])

    return { ok: true as const, game: await getGame(db, sessionId, gameId) }
  }
}
