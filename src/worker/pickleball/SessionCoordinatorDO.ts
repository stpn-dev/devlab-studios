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
import { getSessionCourt, buildSetCourtStatusStatement, buildSetCourtCurrentGameStatement } from '../repositories/pickleball/sessionCourts.js'
import {
  listEligibleQueueCandidates,
  hasOpenAssignment,
  buildMarkAssignedStatement,
  buildMarkPlayingStatement,
  buildCloseQueueEntryStatement,
  buildJoinQueueStatement,
  joinQueue as joinQueueRepo,
  leaveQueue as leaveQueueRepo,
  joinQueueAsPair as joinQueueAsPairRepo,
  leaveQueueAsPair as leaveQueueAsPairRepo,
  buildCloseQueueEntriesForPairStatement,
  buildCloseQueuedEntriesForPairStatement,
  hasOpenAssignmentForPair,
} from '../repositories/pickleball/queueEntries.js'
import {
  buildCreateTeamStatement,
  getTeamSessionPairId,
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
  registerPlayer as registerPlayerRepo,
  checkInPlayer,
  bulkCheckIn,
  setAvailability as setAvailabilityRepo,
  cancelRegistration as cancelRegistrationRepo,
  leaveSession as leaveSessionRepo,
  getSessionPlayerById,
  getSessionPlayer,
} from '../repositories/pickleball/sessionPlayers.js'
import {
  createPair,
  getPair as getSessionPairRepo,
  buildDissolvePairStatement,
  getActivePairForSessionPlayer,
  listEligiblePairs,
  buildIncrementPairGamesPlayedStatement,
  buildRecomputePairGamesPlayedStatement,
} from '../repositories/pickleball/sessionPairs.js'
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
import { buildRecomputePlayerSnapshotsStatements, getPlayerSnapshot } from '../repositories/pickleball/playerPerformanceSnapshots.js'
import {
  enterPair as enterTournamentPairRepo,
  listEntrants as listTournamentEntrants,
  buildSetSeedStatement,
  insertFixturesStatements,
  buildLockBracketStatement,
  listFixtures as listTournamentFixtures,
  buildSetFixtureGameStatement,
} from '../repositories/pickleball/tournaments.js'
import { buildSessionSnapshot, buildPublicSnapshotExtras } from './sessionSnapshot.js'
import { toPublicSessionView } from '../../lib/pickleball/publicSessionView'
import { selectNextPlayers, balanceTeams, type QueueCandidate } from '../../lib/pickleball/queueEngine'
import { selectNextPairs, buildLastOpponentPairId, type PairCandidate, type LastOpponentSessionPlayer } from '../../lib/pickleball/pairSelection'
import { seedEntrants, type SeedCandidate } from '../../lib/pickleball/tournament/seeding'
import { generateFixtures } from '../../lib/pickleball/tournament/generateFixtures'
import { nextPlayableFixture, type FixtureRow } from '../../lib/pickleball/tournament/nextPlayableFixture'
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
    // Runtime guard, not just a type-only cast: buildSessionSnapshot's
    // plain-JS return type carries `session: {...} | null` because
    // getSessionById can theoretically return null. By the time ANY request
    // reaches this fetch() handler, the calling Astro route (operator:
    // [sessionId].ts; public: rt/public/[code].ts) has already resolved and
    // 404'd on a missing session before ever invoking the DO, so this branch
    // is unreachable today -- but a future delete-session feature, or a bug
    // that lets an upgrade reach the DO for a session removed mid-connection,
    // would otherwise hit toPublicSessionView(snapshot) with `session: null`
    // and throw reading `.id` off `null` mid-handshake. Failing loudly here
    // keeps that a typed compile-time guarantee instead of a cast that
    // silently discards it. Destructuring `session` out (rather than testing
    // `snapshot.session` inline) is what lets the non-null narrowing below
    // actually reach the `{ ...snapshot, session }` passed to
    // toPublicSessionView -- TS narrows the checked expression, not
    // `snapshot`'s own property type, so re-spreading with the narrowed
    // local is required for this to type-check without a cast.
    const { session } = snapshot
    if (!session) {
      return new Response('Session no longer exists.', { status: 404 })
    }
    const payload = channel === 'public'
      ? toPublicSessionView({ ...snapshot, session, ...(await buildPublicSnapshotExtras(this.env.PICKLEBALL_DB, session, snapshot.games)) })
      : snapshot
    this.seq += 1
    server.send(JSON.stringify({ type: 'STATE', sessionId, seq: this.seq, payload }))

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(message))
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object' || (parsed as { type?: string }).type !== 'RESYNC_REQUEST') return

    const attachment = ws.deserializeAttachment() as { sessionId: string; channel: 'operator' | 'public' } | null
    if (!attachment) return
    await this.sendSnapshotTo(ws, attachment.sessionId, attachment.channel)
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // Hibernation API removes a closed socket from ctx.getWebSockets()
    // automatically; there is no other per-socket state to clean up.
    void wasClean
    // 1005/1006 are reserved "no status was actually present" codes and can
    // never be sent explicitly -- a client's bare ws.close() (the
    // overwhelmingly common client-initiated close) reports as 1005, which
    // would otherwise throw here on every ordinary close.
    ws.close(code === 1005 || code === 1006 ? 1000 : code, reason)
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    void error
    ws.close(1011, 'Internal error.')
  }

  // Serves a client-requested resync (RESYNC_REQUEST) with a fresh snapshot
  // over the SAME socket that asked. Same non-null narrowing requirement as
  // fetch() above (see that method's block comment for the full rationale):
  // buildSessionSnapshot's `session` field is genuinely `T | null`, so the
  // null case must be a real runtime guard, not a type-erasing cast. Unlike
  // fetch() -- where a null session 404s an in-progress handshake -- this
  // runs over an ALREADY-established connection, so there is no response to
  // 404; skipping the send is the reasonable no-op (nothing valid exists to
  // show, and the socket stays open for a future resync once the session
  // exists again, if ever).
  private async sendSnapshotTo(ws: WebSocket, sessionId: string, channel: 'operator' | 'public') {
    const snapshot = await buildSessionSnapshot(this.env.PICKLEBALL_DB, sessionId)
    const { session } = snapshot
    if (!session) return
    const payload = channel === 'public'
      ? toPublicSessionView({ ...snapshot, session, ...(await buildPublicSnapshotExtras(this.env.PICKLEBALL_DB, session, snapshot.games)) })
      : snapshot
    this.seq += 1
    ws.send(JSON.stringify({ type: 'STATE', sessionId, seq: this.seq, payload }))
  }

  // Called by every mutating method below, AFTER its own db.batch() (or
  // single-statement write, for Task 6's thin wrappers) has already
  // committed. A broadcast failure must never fail the mutation that
  // triggered it -- the caller already has its own success/failure response
  // to return regardless -- so this method swallows its own errors rather
  // than letting them propagate into a `await this.broadcast(sessionId)`
  // call site. console.error is used deliberately: this codebase has no
  // logging library, and it's the platform-native way Workers surfaces
  // errors to `wrangler tail`/dashboard logs, not application log noise.
  private async broadcast(sessionId: string) {
    try {
      const sockets = this.ctx.getWebSockets()
      if (!sockets.length) return

      const snapshot = await buildSessionSnapshot(this.env.PICKLEBALL_DB, sessionId)
      // Same non-null narrowing requirement as fetch()/sendSnapshotTo above:
      // a real runtime guard, not a cast. Here there are potentially MANY
      // connected sockets and nothing valid to send any of them, so the
      // whole broadcast is skipped rather than fanning out incomplete data.
      const { session } = snapshot
      if (!session) {
        console.error('broadcast: session no longer exists, skipping', sessionId)
        return
      }
      const publicExtras = await buildPublicSnapshotExtras(this.env.PICKLEBALL_DB, session, snapshot.games)
      const publicPayload = toPublicSessionView({ ...snapshot, session, ...publicExtras })
      this.seq += 1
      const seq = this.seq

      for (const ws of sockets) {
        const attachment = ws.deserializeAttachment() as { sessionId: string; channel: 'operator' | 'public' } | null
        // Every socket this instance ever accepted was already checked
        // against THIS sessionId at accept time (fetch()'s ownsSession
        // guard), so attachment.sessionId should always match -- this check
        // is defense in depth, not a real filter.
        if (!attachment || attachment.sessionId !== sessionId) continue
        const payload = attachment.channel === 'public' ? publicPayload : snapshot
        try {
          ws.send(JSON.stringify({ type: 'STATE', sessionId, seq, payload }))
        } catch (error) {
          console.error('broadcast: failed to send to one socket', error)
        }
      }
    } catch (error) {
      console.error('broadcast: failed to build/send snapshot', error)
    }
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
  // Builds the close-and-maybe-requeue statements every court release runs
  // (release, finish, abandon). Extracted because all three sites had the
  // same inline flatMap and all three were pair-blind: they called
  // buildJoinQueueStatement without a session_pair_id, so a FIXED_PAIRS
  // session's post-game requeue produced rows with a NULL pair id.
  // listEligiblePairs requires both members' rows to carry the pair's own id,
  // so after one finished game the pair was invisible to assignment, could not
  // re-join (hasOpenQueueEntry saw the orphans), could not leave (the DELETE
  // keys on session_pair_id), and could not be dissolved clean. The session
  // was unrecoverable. Keeping this in one place is what stops a fourth
  // release site being written pair-blind.
  //
  // In a FIXED_PAIRS session only whole pairs are requeued, and both rows of a
  // pair share one session_pair_id and one queued_at, exactly as
  // joinQueueAsPair produces. A released player whose pair has since been
  // dissolved is closed but NOT requeued — a lone player has nothing to be
  // seated as, and requeueing them would recreate the orphan row this fixes.
  private async buildRequeueStatements(
    db: D1Database,
    session: { id: string; sessionType: string },
    sessionPlayerIds: string[],
    requeued: boolean,
  ): Promise<D1PreparedStatement[]> {
    const sessionId = session.id
    const closes = sessionPlayerIds.map((id) => buildCloseQueueEntryStatement(db, sessionId, id))
    if (!requeued) return closes

    if (session.sessionType !== 'FIXED_PAIRS') {
      return [...closes, ...sessionPlayerIds.map((id) => buildJoinQueueStatement(db, { sessionId, sessionPlayerId: id }))]
    }

    const released = new Set(sessionPlayerIds)
    const pairs = new Map<string, string[]>()
    for (const sessionPlayerId of sessionPlayerIds) {
      const pair = await getActivePairForSessionPlayer(db, sessionId, sessionPlayerId)
      if (!pair) continue
      const members = pairs.get(pair.id) || []
      pairs.set(pair.id, [...members, sessionPlayerId])
    }

    const rejoins: D1PreparedStatement[] = []
    for (const [sessionPairId, members] of pairs) {
      // Both members must be in this release, or the pair is not whole here
      // and requeueing half of it would strand the other half.
      if (members.length !== 2 || !members.every((id) => released.has(id))) continue
      const queuedAt = new Date().toISOString()
      for (const sessionPlayerId of members) {
        rejoins.push(buildJoinQueueStatement(db, { sessionId, sessionPlayerId, sessionPairId }, queuedAt))
      }
    }

    return [...closes, ...rejoins]
  }

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

  // FIXED_PAIRS sibling of finishGame/reopenGame's per-player games_played
  // bookkeeping. `game_participants` has no session_pair_id column, so the
  // pair is recovered by grouping participants by team_id and reading
  // `teams.session_pair_id` off the team itself (migration 0013).
  //
  // NOT from either member's current pairing, which is what this did
  // originally: the two diverge the moment anyone re-pairs, and the
  // fresh-finish path increments blindly, so a finished game's credit landed
  // on a pair that never took the court. listEligiblePairs orders by
  // games_played, so that corrupted the fairness order, not just a display. Only ever called for a FIXED_PAIRS session -- an
  // OPEN_PLAY game's teams are ad-hoc and have no corresponding session_pairs
  // rows at all, so this would silently no-op there anyway, but callers gate
  // on `session.sessionType === 'FIXED_PAIRS'` up front to avoid the wasted
  // lookups.
  //
  // `mode` mirrors the player-level Ruling 11 split: 'INCREMENT' for a
  // genuinely fresh finish, 'RECOMPUTE' for the correctionPending re-finish
  // and reopen paths, where this game's own contribution may already be
  // counted once and an increment would double it.
  private async buildPairGamesPlayedStatements(
    db: D1Database,
    sessionId: string,
    participants: Array<{ session_player_id: string; team_id: string }>,
    mode: 'INCREMENT' | 'RECOMPUTE',
  ): Promise<unknown[]> {
    const memberIdsByTeam = new Map<string, string[]>()
    for (const participant of participants) {
      const members = memberIdsByTeam.get(participant.team_id) ?? []
      members.push(participant.session_player_id)
      memberIdsByTeam.set(participant.team_id, members)
    }

    // Resolve the pair from the TEAM, not from either member's current
    // pairing. Those diverge the moment anyone re-pairs, and resolving from
    // live state credited the game to whichever pair a member happens to be
    // in now -- a pair that may never have played it.
    const statements: unknown[] = []
    for (const [teamId, members] of memberIdsByTeam) {
      if (members.length !== 2) continue
      const sessionPairId = await getTeamSessionPairId(db, sessionId, teamId)
      if (!sessionPairId) continue
      statements.push(
        mode === 'INCREMENT'
          ? buildIncrementPairGamesPlayedStatement(db, sessionId, sessionPairId)
          : buildRecomputePairGamesPlayedStatement(db, sessionId, sessionPairId),
      )
    }
    return statements
  }

  async assignCourt(sessionId: string, sessionCourtId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')

    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    if (session.sessionType !== 'OPEN_PLAY' && session.sessionType !== 'FIXED_PAIRS') {
      return failure('Court assignment is only supported for Open Play and Fixed Pairs sessions in this phase.')
    }
    // LIVE only — assigning a court is an active-play action, so a DRAFT,
    // OPEN_FOR_CHECKIN, PAUSED, COMPLETED, or CANCELLED session must not take
    // new assignments.
    if (session.status !== 'LIVE') return failure('Session is not live.')

    const court = await getSessionCourt(db, sessionId, sessionCourtId)
    if (!court) return failure('Court not found.')
    if (!court.enabled) return failure('Court is disabled.')
    if (court.status !== 'AVAILABLE') return failure('Court is not available.')

    // ORDERING HAZARD: a tournament IS a FIXED_PAIRS session (migration
    // 0014's header) -- carrying `tournamentFormat` rather than being a
    // third session_type. This check MUST come before the
    // `sessionType === 'FIXED_PAIRS'` branch below, or a locked tournament's
    // court assignment would fall into the ordinary fairness-queue path and
    // seat whatever pair the queue selected instead of the fixture the
    // bracket actually calls for next.
    if (session.tournamentFormat) {
      return this.assignCourtToTournamentFixture(db, sessionId, sessionCourtId, session)
    }

    if (session.sessionType === 'FIXED_PAIRS') {
      return this.assignCourtToPairs(db, sessionId, sessionCourtId)
    }

    const ruleset = await getScoringRuleset(db, session.scoringRulesetId, session.organizationId)
    const needed = requiredPlayerCount(ruleset ? ruleset.format : 'DOUBLES')

    const candidates: QueueCandidate[] = await listEligibleQueueCandidates(db, sessionId)
    if (candidates.length < needed) {
      return failure(`Not enough eligible players (need ${needed}, have ${candidates.length}).`)
    }

    const nowIso = new Date().toISOString()

    // Repeat-avoidance tiebreak input (spec §5 rule 3, queueEngine.ts): for
    // each current candidate, find the sessionPlayerId of the one other
    // CURRENTLY-ELIGIBLE candidate they were most recently partnered or
    // opposed with, per matchmaking_history. matchmaking_history has no
    // direct session_id-scoped session_player_id -- it's keyed by
    // (session_id, player_id) -- so the join through session_players on
    // (player_id, session_id) is what resolves a player's identity within
    // THIS session specifically. Only meaningful once candidates.length >= 5
    // (matching selectNextPlayers' own internal guard), but harmless to
    // always compute since the pure function no-ops below that threshold.
    const candidateSessionPlayerIds = candidates.map((c) => c.sessionPlayerId)
    const lastPairedWith: Record<string, string | null> = {}
    if (candidateSessionPlayerIds.length >= 5) {
      const placeholders = candidateSessionPlayerIds.map(() => '?').join(',')
      const historyResult = await db
        .prepare(
          `SELECT sp1.id AS session_player_id, sp2.id AS other_session_player_id, mh.last_game_at
           FROM matchmaking_history mh
           JOIN session_players sp1 ON sp1.player_id = mh.player_id AND sp1.session_id = ?
           JOIN session_players sp2 ON sp2.player_id = mh.other_player_id AND sp2.session_id = ?
           WHERE mh.session_id = ? AND sp1.id IN (${placeholders}) AND sp2.id IN (${placeholders})
           ORDER BY mh.last_game_at DESC`,
        )
        .bind(sessionId, sessionId, sessionId, ...candidateSessionPlayerIds, ...candidateSessionPlayerIds)
        .all<{ session_player_id: string; other_session_player_id: string; last_game_at: string }>()
      for (const row of historyResult.results || []) {
        if (!(row.session_player_id in lastPairedWith)) lastPairedWith[row.session_player_id] = row.other_session_player_id
      }
    }

    const { selected, reasons } = selectNextPlayers(candidates, needed, nowIso, lastPairedWith)

    // PHASE 5 SEAM (now filled): this used to split the fairness-selected
    // group at its midpoint (first half vs second half, in selection order)
    // purely so two teams existed, doing no match balancing whatsoever
    // because OPI didn't exist yet. It now reads each selected player's
    // current ALL_TIME OPI (defaulting to a neutral 50 for a player with no
    // snapshot yet) and hands the group to balanceTeams -- ONLY this pairing
    // step, not the fairness selection above it -- per spec §55's
    // queue-fairness-vs-match-balancing separation.
    const candidatesWithOpi = await Promise.all(
      selected.map(async (player) => {
        const snapshot = await getPlayerSnapshot(db, player.playerId, 'ALL_TIME', null)
        return { sessionPlayerId: player.sessionPlayerId, opi: snapshot ? snapshot.opi : 50 }
      }),
    )
    const { teamA: teamASide } = balanceTeams(candidatesWithOpi)
    const teamAIds = new Set(teamASide.map((p) => p.sessionPlayerId))
    const teamAPlayers = selected.filter((player) => teamAIds.has(player.sessionPlayerId))
    const teamBPlayers = selected.filter((player) => !teamAIds.has(player.sessionPlayerId))

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

    // The batch has already committed at this point either way (D1 batches
    // don't support partial rollback), so connected clients need to hear
    // about it regardless of whether the seat-count check below succeeds or
    // fails -- broadcast unconditionally right after the commit, before that
    // check can short-circuit this method with an early return.
    await this.broadcast(sessionId)

    // This can't prevent an inconsistent write -- but a `leaveQueue` racing
    // between the eligibility read above and this commit could shrink the
    // QUEUED rows out from under `markAssignedStatement`'s
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

  // FIXED_PAIRS sibling of the OPEN_PLAY body above: same shape (eligibility
  // read -> pure fairness selection -> one all-or-nothing db.batch() ->
  // broadcast -> seat-count guard), but the unit of work is a pair rather
  // than a player. `balanceTeams` is deliberately NOT called here -- partners
  // are fixed by definition in this session type, so there is nothing to
  // balance within a side; the two pairs `selectNextPairs` returns become
  // Team A and Team B in selection order.
  private async assignCourtToPairs(db: D1Database, sessionId: string, sessionCourtId: string) {
    const candidates: PairCandidate[] = await listEligiblePairs(db, sessionId)

    const nowIso = new Date().toISOString()

    // Repeat-avoidance tiebreak input (pairSelection.ts's rule 3): for each
    // eligible pair, the sessionPairId of the one other CURRENTLY-ELIGIBLE
    // pair it most recently OPPOSED, per matchmaking_history. The player-level
    // read is built the same way assignCourt's OPEN_PLAY path above builds
    // `lastPairedWith` -- joining matchmaking_history to session_players on
    // (player_id, session_id) to resolve a player's identity within THIS
    // session -- but restricted to relation = 'OPPONENT'. Unlike the
    // player-level query, this restriction is required, not optional: a
    // fixed pair's two members are ALSO in each other's candidate set and
    // are permanently each other's PARTNER, so an unfiltered query would
    // resolve "most recently paired with" to a pair's own other member every
    // time -- never a real opposing pair. The player->pair bridge itself
    // (including the self-reference fix for a re-paired member) lives in
    // buildLastOpponentPairId (pairSelection.ts), pure and unit-tested.
    //
    // Query guard: only worth running when a real swap could occur.
    // pairSelection.ts's own contract guarantees rule 3 cannot change the
    // outcome once sorted.length === count (=== 2 here) -- there is no
    // candidate left outside the selection to swap in. Below that
    // (candidates.length <= 2), this would be a pure extra D1 round-trip on
    // the hot assignment path.
    const candidateSessionPlayerIds = candidates.flatMap((pair) => pair.memberSessionPlayerIds)
    const lastOpponentSessionPlayer: Record<string, LastOpponentSessionPlayer> = {}
    if (candidates.length > 2) {
      const placeholders = candidateSessionPlayerIds.map(() => '?').join(',')
      const historyResult = await db
        .prepare(
          `SELECT sp1.id AS session_player_id, sp2.id AS other_session_player_id, mh.last_game_at
           FROM matchmaking_history mh
           JOIN session_players sp1 ON sp1.player_id = mh.player_id AND sp1.session_id = ?
           JOIN session_players sp2 ON sp2.player_id = mh.other_player_id AND sp2.session_id = ?
           WHERE mh.session_id = ? AND mh.relation = 'OPPONENT'
             AND sp1.id IN (${placeholders}) AND sp2.id IN (${placeholders})
           ORDER BY mh.last_game_at DESC`,
        )
        .bind(sessionId, sessionId, sessionId, ...candidateSessionPlayerIds, ...candidateSessionPlayerIds)
        .all<{ session_player_id: string; other_session_player_id: string; last_game_at: string }>()
      for (const row of historyResult.results || []) {
        if (!(row.session_player_id in lastOpponentSessionPlayer)) {
          lastOpponentSessionPlayer[row.session_player_id] = { sessionPlayerId: row.other_session_player_id, lastGameAt: row.last_game_at }
        }
      }
    }

    const lastOpponentPairId = buildLastOpponentPairId(candidates, lastOpponentSessionPlayer)

    const { selected, reasons, shortfall } = selectNextPairs(candidates, 2, nowIso, lastOpponentPairId)
    if (shortfall) return failure(shortfall)

    const [pairA, pairB] = selected
    const allMemberIds = [...pairA.memberSessionPlayerIds, ...pairB.memberSessionPlayerIds]

    // Same all-or-nothing batch shape as the OPEN_PLAY path: every id is
    // generated client-side before any statement runs, so a mid-sequence
    // failure can never leave players flipped to ASSIGNED while the court
    // stays AVAILABLE.
    // session_pair_id is stamped on the team here and never re-derived. It is
    // what lets pair statistics credit the pair that ACTUALLY played, even
    // after the pair dissolves and its members re-pair with other people
    // (migration 0013).
    const teamA = buildCreateTeamStatement(db, { sessionId, sessionCourtId, kind: 'FIXED_PAIR', sessionPairId: pairA.sessionPairId })
    const teamB = buildCreateTeamStatement(db, { sessionId, sessionCourtId, kind: 'FIXED_PAIR', sessionPairId: pairB.sessionPairId })
    const markAssignedStatement = buildMarkAssignedStatement(db, sessionId, allMemberIds)

    const statements = [
      teamA.statement,
      ...pairA.memberSessionPlayerIds.map((sessionPlayerId) => buildAddTeamMemberStatement(db, { teamId: teamA.id, sessionPlayerId })),
      teamB.statement,
      ...pairB.memberSessionPlayerIds.map((sessionPlayerId) => buildAddTeamMemberStatement(db, { teamId: teamB.id, sessionPlayerId })),
      markAssignedStatement,
      buildSetCourtStatusStatement(db, sessionId, sessionCourtId, 'ASSIGNED'),
    ].filter(Boolean)

    const results = await db.batch(statements)

    // Broadcast unconditionally right after the commit -- same reasoning as
    // the OPEN_PLAY path: the batch has already committed either way, so
    // connected clients must hear about it regardless of the seat-count
    // check below.
    await this.broadcast(sessionId)

    // Mirrors the OPEN_PLAY path's post-commit seat-count guard: a
    // leaveQueue racing between the eligibility read above and this commit
    // could shrink the QUEUED rows out from under markAssignedStatement's
    // `WHERE ... AND status = 'QUEUED'` clause. Surface that as a hard
    // failure rather than returning success over an inconsistent seat count.
    if (markAssignedStatement) {
      const markAssignedIndex = statements.indexOf(markAssignedStatement)
      const seated = results[markAssignedIndex]?.meta?.changes ?? 0
      if (seated !== allMemberIds.length) {
        return failure(`Assignment failed: expected to seat ${allMemberIds.length} players, only ${seated} were queued at commit time.`)
      }
    }

    return {
      ok: true as const,
      court: await getSessionCourt(db, sessionId, sessionCourtId),
      teamA: { id: teamA.id, players: pairA.memberSessionPlayerIds.map((sessionPlayerId) => ({ sessionPlayerId })) },
      teamB: { id: teamB.id, players: pairB.memberSessionPlayerIds.map((sessionPlayerId) => ({ sessionPlayerId })) },
      reasons,
    }
  }

  // Tournament sibling of assignCourtToPairs above: the unit of work is
  // still a pair, but WHICH pair plays next comes from the fixture list
  // (nextPlayableFixture, pure/unit-tested in Task 3), never from
  // listEligiblePairs' fairness queue -- a bracket match is not a fairness
  // decision. Fixtures and "who's currently on a court" are both read HERE,
  // inside this serialized handler, never cached across calls (this file's
  // header CONCURRENCY guarantee): a call that read them earlier and reused
  // a stale answer could seat an entrant onto two courts at once.
  //
  // Team creation reuses assignCourtToPairs' exact shape one line up: two
  // FIXED_PAIR teams, each with session_pair_id stamped (migration 0013), so
  // pair statistics and every other FIXED_PAIR-shaped reader (finishGame's
  // pair games_played bookkeeping, hasOpenAssignmentForPair, etc.) work
  // identically for a tournament pair as for an ordinary one.
  private async assignCourtToTournamentFixture(
    db: D1Database,
    sessionId: string,
    sessionCourtId: string,
    session: { bracketLockedAt: string | null },
  ) {
    // Fixtures don't exist -- and there is nothing to seat -- until
    // lockBracket has run (spec §3.2: entrants/seeds are frozen at lock,
    // and that is also when fixtures are generated).
    if (!session.bracketLockedAt) return failure('Lock the bracket before assigning courts.')

    const [fixtures, entrants, entrantsInPlayResult] = await Promise.all([
      listTournamentFixtures(db, sessionId),
      listTournamentEntrants(db, sessionId),
      // "In play" mirrors hasOpenAssignmentForPair's own definition (an
      // ASSIGNED or PLAYING queue_entries row for the pair) rather than
      // re-deriving it from teams.session_court_id -- same source of truth
      // the rest of this file already trusts for "is this pair seated?".
      db
        .prepare(
          `SELECT DISTINCT te.id AS entrant_id
           FROM tournament_entrants te
           JOIN queue_entries qe ON qe.session_pair_id = te.session_pair_id AND qe.session_id = te.session_id
           WHERE te.session_id = ? AND qe.status IN ('ASSIGNED', 'PLAYING')`,
        )
        .bind(sessionId)
        .all<{ entrant_id: string }>(),
    ])

    const entrantsInPlay = (entrantsInPlayResult.results || []).map((row) => row.entrant_id)
    const fixture = nextPlayableFixture(fixtures as FixtureRow[], entrantsInPlay)
    if (!fixture) {
      return failure('No fixture is playable right now -- every remaining match has an entrant already on a court.')
    }

    const entrantById = new Map<string, { id: string; sessionPairId: string }>()
    for (const entrant of entrants as Array<{ id: string; sessionPairId: string }>) {
      entrantById.set(entrant.id, entrant)
    }
    const entrantA = fixture.entrantAId ? entrantById.get(fixture.entrantAId) : null
    const entrantB = fixture.entrantBId ? entrantById.get(fixture.entrantBId) : null
    if (!entrantA || !entrantB) {
      return failure('This fixture is missing an entrant and cannot be played yet.')
    }

    const [pairA, pairB] = await Promise.all([
      getSessionPairRepo(db, sessionId, entrantA.sessionPairId),
      getSessionPairRepo(db, sessionId, entrantB.sessionPairId),
    ])
    if (!pairA || !pairB) {
      return failure("This fixture's pair could not be resolved.")
    }

    const pairAMemberIds = [pairA.sessionPlayerAId, pairA.sessionPlayerBId]
    const pairBMemberIds = [pairB.sessionPlayerAId, pairB.sessionPlayerBId]
    const allMemberIds = [...pairAMemberIds, ...pairBMemberIds]

    // Defensive re-check, not the real enforcement: nextPlayableFixture
    // already excludes any entrant currently ASSIGNED/PLAYING, so this
    // should never fire in a correct caller. It exists so a stray queue
    // entry (e.g. an operator manually queuing a tournament pair through the
    // ordinary queue routes) surfaces as a clean domain failure here instead
    // of a raw SQLITE_CONSTRAINT 500 from idx_queue_entries_one_open_per_player
    // when the INSERT below runs.
    const alreadyOpen = await Promise.all(allMemberIds.map((id) => hasOpenAssignment(db, sessionId, id)))
    if (alreadyOpen.some(Boolean)) {
      return failure('One of this fixture\'s entrants already holds an open queue entry; resolve that first.')
    }

    // Same all-or-nothing batch shape as assignCourtToPairs: every id is
    // generated client-side before any statement runs, so a mid-sequence
    // failure can never leave players flipped to ASSIGNED while the court
    // stays AVAILABLE.
    const teamA = buildCreateTeamStatement(db, { sessionId, sessionCourtId, kind: 'FIXED_PAIR', sessionPairId: pairA.id })
    const teamB = buildCreateTeamStatement(db, { sessionId, sessionCourtId, kind: 'FIXED_PAIR', sessionPairId: pairB.id })

    // Tournament pairs never pass through joinQueueAsPair -- they are seated
    // straight from the fixture list, not the fairness queue -- so there is
    // no pre-existing QUEUED row for buildMarkAssignedStatement to flip.
    // These rows are inserted ALREADY ASSIGNED instead. This is what lets
    // hasOpenAssignmentForPair (dissolvePair/leaveSession's "pair is on a
    // court" guard) and listAssignedSessionPlayerIdsForCourt (startGame,
    // finishGame, releaseCourt) see this pair as genuinely seated, exactly as
    // they do for an ordinary fixed-pairs assignment -- tournament code must
    // not route around that guard (see this task's own brief).
    const timestamp = new Date().toISOString()
    const assignedQueueStatements = [
      ...pairAMemberIds.map((sessionPlayerId) =>
        db
          .prepare(
            `INSERT INTO queue_entries (id, session_id, session_player_id, session_pair_id, status, queued_at, assigned_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'ASSIGNED', ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), sessionId, sessionPlayerId, pairA.id, timestamp, timestamp, timestamp, timestamp),
      ),
      ...pairBMemberIds.map((sessionPlayerId) =>
        db
          .prepare(
            `INSERT INTO queue_entries (id, session_id, session_player_id, session_pair_id, status, queued_at, assigned_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'ASSIGNED', ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), sessionId, sessionPlayerId, pairB.id, timestamp, timestamp, timestamp, timestamp),
      ),
    ]

    const statements = [
      teamA.statement,
      ...pairAMemberIds.map((sessionPlayerId) => buildAddTeamMemberStatement(db, { teamId: teamA.id, sessionPlayerId })),
      teamB.statement,
      ...pairBMemberIds.map((sessionPlayerId) => buildAddTeamMemberStatement(db, { teamId: teamB.id, sessionPlayerId })),
      ...assignedQueueStatements,
      buildSetCourtStatusStatement(db, sessionId, sessionCourtId, 'ASSIGNED'),
    ].filter(Boolean)

    await db.batch(statements)

    await this.broadcast(sessionId)

    return {
      ok: true as const,
      court: await getSessionCourt(db, sessionId, sessionCourtId),
      teamA: { id: teamA.id, players: pairAMemberIds.map((sessionPlayerId) => ({ sessionPlayerId })) },
      teamB: { id: teamB.id, players: pairBMemberIds.map((sessionPlayerId) => ({ sessionPlayerId })) },
      fixture,
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

    // FIXED_PAIRS edge case (spec 2.6): swapping out one member of an
    // assigned pair is not supported -- there is no "half a pair" state this
    // codebase understands (no partial-pair play), so refusing outright and
    // pointing the operator at dissolvePair + formPair is the honest answer
    // rather than half-implementing a swap that would silently orphan the
    // pair's stats or its remaining partner. Checked before the court/roster
    // lookups below: this is a session-type-level refusal, not something a
    // more specific 404/409 further down should ever get the chance to mask.
    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    if (session.sessionType === 'FIXED_PAIRS') {
      return failure('Replacing one member of a fixed pair is not supported; dissolve the pair and form a new one instead.')
    }

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

    await this.broadcast(sessionId)

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

    const statements = await this.buildRequeueStatements(
      db,
      { id: sessionId, sessionType: session?.sessionType ?? 'OPEN_PLAY' },
      sessionPlayerIds,
      requeued,
    )

    // Release the court's team binding along with the court itself, so it does
    // not outlive this occupancy. A court is assigned and released many times
    // per session; a stale binding would let THIS release match a previous
    // occupancy's team and sweep in players who have since been reassigned
    // elsewhere. Order within the batch is irrelevant — different table, and
    // the read above already happened.
    statements.push(buildClearTeamCourtBindingStatement(db, sessionId, sessionCourtId))
    statements.push(buildSetCourtStatusStatement(db, sessionId, sessionCourtId, 'AVAILABLE'))
    statements.push(buildSetCourtCurrentGameStatement(db, sessionId, sessionCourtId, null))

    await db.batch(statements)

    await this.broadcast(sessionId)

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

    // Tournament games (session.tournamentFormat, never sessionType --
    // see assignCourt's own ordering-hazard comment) link the fixture that
    // was seated for this court to the game JUST created above, in the SAME
    // batch as the game's own creation -- buildSetFixtureGameStatement is
    // named "for Task 6/7 to batch alongside the game-creation statements"
    // in tournaments.js precisely because game creation happens HERE, not in
    // assignCourt (no gameId exists yet when a court is merely assigned).
    // The fixture is matched by its two entrants' underlying session_pair_id
    // against this court's two teams' session_pair_id, in EITHER order --
    // "team A" here is whichever side the caller named when starting the
    // game (resolved by membership above), which need not match the
    // fixture's own entrant_a/entrant_b labeling from assignCourt.
    let fixtureLinkStatement: unknown = null
    if (session.tournamentFormat) {
      const [pairIdForTeamA, pairIdForTeamB] = await Promise.all([
        getTeamSessionPairId(db, sessionId, teamAId),
        getTeamSessionPairId(db, sessionId, teamBId),
      ])
      if (pairIdForTeamA && pairIdForTeamB) {
        const fixtureRow = await db
          .prepare(
            `SELECT tf.id AS id
             FROM tournament_fixtures tf
             JOIN tournament_entrants ea ON ea.id = tf.entrant_a_id
             JOIN tournament_entrants eb ON eb.id = tf.entrant_b_id
             WHERE tf.session_id = ? AND tf.status = 'READY'
               AND ((ea.session_pair_id = ? AND eb.session_pair_id = ?) OR (ea.session_pair_id = ? AND eb.session_pair_id = ?))`,
          )
          .bind(sessionId, pairIdForTeamA, pairIdForTeamB, pairIdForTeamB, pairIdForTeamA)
          .first<{ id: string }>()
        if (fixtureRow) {
          fixtureLinkStatement = buildSetFixtureGameStatement(db, sessionId, fixtureRow.id, gameId)
        }
      }
    }

    const statements = [
      gameStatement,
      ...participantStatements,
      startedEvent,
      buildMarkPlayingStatement(db, sessionId, sessionPlayerIds),
      buildSetCourtStatusStatement(db, sessionId, sessionCourtId, 'PLAYING'),
      buildSetCourtCurrentGameStatement(db, sessionId, sessionCourtId, gameId),
      fixtureLinkStatement,
    ].filter(Boolean)

    await db.batch(statements)

    await this.broadcast(sessionId)

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

    await this.broadcast(sessionId)

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

    await this.broadcast(sessionId)

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
    const affectedPlayerIds = participants.map((p) => p.player_id)

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
      // Pair-level sibling of the player recompute above -- same Ruling 11
      // reasoning, one level up (see buildPairGamesPlayedStatements' own
      // comment). Only meaningful for a FIXED_PAIRS session.
      const pairGamesPlayedStatements =
        session.sessionType === 'FIXED_PAIRS'
          ? await this.buildPairGamesPlayedStatements(db, sessionId, participants, 'RECOMPUTE')
          : []
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
        ...gamesPlayedStatements, ...pairGamesPlayedStatements, ...matchmakingRecomputeStatements,
        ...buildRecomputePlayerSnapshotsStatements(db, affectedPlayerIds, sessionId),
      ]
      if (idempotencyKey) {
        statements.push(buildRecordIdempotentResultStatement(db, { gameId, commandType: 'FINISH_GAME', key: idempotencyKey, result }))
      }

      await db.batch(statements)

      await this.broadcast(sessionId)

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
    // Pair-level sibling of the player increment above -- see
    // buildPairGamesPlayedStatements' own comment. Only meaningful for a
    // FIXED_PAIRS session; an OPEN_PLAY game's teams have no session_pairs
    // rows at all.
    const pairGamesPlayedStatements =
      session.sessionType === 'FIXED_PAIRS'
        ? await this.buildPairGamesPlayedStatements(db, sessionId, participants, 'INCREMENT')
        : []

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
    const releaseStatements = await this.buildRequeueStatements(
      db,
      { id: sessionId, sessionType: session.sessionType },
      releasedSessionPlayerIds,
      requeued,
    )
    if (holdsCourt) {
      releaseStatements.push(buildClearTeamCourtBindingStatement(db, sessionId, game.sessionCourtId))
      releaseStatements.push(buildSetCourtStatusStatement(db, sessionId, game.sessionCourtId, 'AVAILABLE'))
      releaseStatements.push(buildSetCourtCurrentGameStatement(db, sessionId, game.sessionCourtId, null))
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

    const statements = [
      finishedEvent, projectionStatement, ...statStatements, ...matchmakingStatements, ...gamesPlayedStatements,
      ...pairGamesPlayedStatements, ...releaseStatements,
      ...buildRecomputePlayerSnapshotsStatements(db, affectedPlayerIds, sessionId),
    ]
    if (idempotencyKey) {
      statements.push(buildRecordIdempotentResultStatement(db, { gameId, commandType: 'FINISH_GAME', key: idempotencyKey, result }))
    }

    await db.batch(statements)

    await this.broadcast(sessionId)

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
    const releaseStatements = await this.buildRequeueStatements(
      db,
      { id: sessionId, sessionType: session.sessionType },
      sessionPlayerIds,
      requeued,
    )
    if (holdsCourt) {
      releaseStatements.push(buildClearTeamCourtBindingStatement(db, sessionId, game.sessionCourtId))
      releaseStatements.push(buildSetCourtStatusStatement(db, sessionId, game.sessionCourtId, 'AVAILABLE'))
      releaseStatements.push(buildSetCourtCurrentGameStatement(db, sessionId, game.sessionCourtId, null))
    }

    await db.batch([abandonedEvent, projectionStatement, ...releaseStatements])

    await this.broadcast(sessionId)

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

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')

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
      .prepare(`SELECT DISTINCT gp.session_player_id, gp.team_id FROM game_participants gp WHERE gp.game_id = ?`)
      .bind(gameId)
      .all<{ session_player_id: string; team_id: string }>()
    const reopenParticipants = participantsResult.results || []
    const sessionPlayerIds = reopenParticipants.map((row) => row.session_player_id)
    const gamesPlayedStatements = sessionPlayerIds.map((id) => buildRecomputeGamesPlayedStatement(db, sessionId, id))
    // Pair-level sibling of the player recompute above -- see
    // buildPairGamesPlayedStatements' own comment. Only meaningful for a
    // FIXED_PAIRS session.
    const pairGamesPlayedStatements =
      session.sessionType === 'FIXED_PAIRS'
        ? await this.buildPairGamesPlayedStatements(db, sessionId, reopenParticipants, 'RECOMPUTE')
        : []
    // Pure SQL, built without reading D1 -- and appended LAST in the batch
    // below so its `WHERE status = 'FINISHED'` is evaluated after
    // `projectionStatement` has already moved this game off FINISHED.
    const matchmakingStatements = recomputeMatchmakingHistoryStatements(db, sessionId)

    // Fetched separately from `sessionPlayerIds` above (which carries
    // session_player_id for games_played recomputation) because the snapshot
    // recompute keys off the org-level player_id instead.
    const affectedPlayersResult = await db
      .prepare(
        `SELECT sp.player_id
         FROM game_participants gp JOIN session_players sp ON sp.id = gp.session_player_id
         WHERE gp.game_id = ?`,
      )
      .bind(gameId)
      .all<{ player_id: string }>()
    const affectedPlayerIds = (affectedPlayersResult.results || []).map((p) => p.player_id)

    await db.batch([
      reopenedEvent, projectionStatement, correctionFlagStatement, invalidateStatsStatement,
      ...gamesPlayedStatements, ...pairGamesPlayedStatements, ...matchmakingStatements,
      ...buildRecomputePlayerSnapshotsStatements(db, affectedPlayerIds, sessionId),
    ])

    await this.broadcast(sessionId)

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

    await this.broadcast(sessionId)

    return { ok: true as const, game: await getGame(db, sessionId, gameId) }
  }

  // The 8 methods below are thin wrappers -- each delegates its actual
  // read/write to the SAME repository function the REST route used to call
  // directly (see this plan's Task 7), adding only the ownsSession guard
  // every DO method has and a broadcast() call so these session-player/
  // queue changes are as "live" as the 10 game/court commands above. Ruling
  // A: this plan's spec named 6 of these; registerPlayer and leaveSession
  // are the 2 more the same "everything, including queue/check-in" decision
  // implies once the REST surface is actually re-checked against it.
  //
  // Each repository call's null/false "no-op" return (e.g. "already
  // checked in", "no open queue entry") maps to a failure() here and
  // SKIPS the broadcast -- nothing changed, so nothing to tell connected
  // clients about.

  async registerPlayer(sessionId: string, playerId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const sessionPlayer = await registerPlayerRepo(this.env.PICKLEBALL_DB, { sessionId, playerId })
    await this.broadcast(sessionId)
    return { ok: true as const, sessionPlayer }
  }

  async checkIn(sessionId: string, playerId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const sessionPlayer = await checkInPlayer(this.env.PICKLEBALL_DB, sessionId, playerId)
    if (!sessionPlayer) return failure('Player is not eligible to check in.')
    await this.broadcast(sessionId)
    return { ok: true as const, sessionPlayer }
  }

  async checkInBulk(sessionId: string, playerIds: string[]) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const checkedInPlayerIds = await bulkCheckIn(this.env.PICKLEBALL_DB, sessionId, playerIds)
    if (checkedInPlayerIds.length) await this.broadcast(sessionId)
    return { ok: true as const, checkedInPlayerIds }
  }

  // FIXED_PAIRS edge case (spec 2.6): a pair is only eligible while BOTH
  // members are AVAILABLE (listEligiblePairs' own WHERE clause), so one
  // member going anything other than AVAILABLE makes the whole pair
  // undispatchable -- its queue entries (both rows, one per member, sharing
  // one session_pair_id) are closed here so a stale QUEUED row never lingers
  // for the fairness engine to see. The pair itself is NOT dissolved -- that
  // only happens when a member actually LEAVES the session (leaveSession
  // below) -- so nothing here needs to re-queue anyone: when both members
  // are AVAILABLE again, an ordinary joinQueue call re-queues the pair with
  // a fresh queued_at, same as any pair joining for the first time. The
  // availability UPDATE and the queue-close DELETE must commit atomically
  // (same reasoning as dissolvePair's block comment) -- an interruption
  // between them could leave the player marked unavailable with the pair's
  // queue rows still QUEUED, exactly the ghost state this exists to avoid.
  async setAvailability(sessionId: string, playerId: string, status: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'RESTING') {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')

    if (session.sessionType === 'FIXED_PAIRS' && status !== 'AVAILABLE') {
      const sessionPlayer = await getSessionPlayer(db, sessionId, playerId)
      if (!sessionPlayer || sessionPlayer.attendanceStatus !== 'CHECKED_IN') {
        return failure('Player is not eligible for an availability change.')
      }

      const pair = await getActivePairForSessionPlayer(db, sessionId, sessionPlayer.id)
      const statements = [
        buildSetAvailabilityByIdStatement(db, sessionId, sessionPlayer.id, status),
        // QUEUED-only, deliberately. If the pair is currently ASSIGNED or
        // PLAYING, its queue rows record that occupancy — deleting them here
        // would make hasOpenQueueEntry report the pair as free, letting an
        // operator re-queue it while it is still on court and have it seated
        // on a second court at the same time.
        ...(pair ? [buildCloseQueuedEntriesForPairStatement(db, sessionId, pair.id)] : []),
      ]
      await db.batch(statements)

      await this.broadcast(sessionId)
      return { ok: true as const, sessionPlayer: await getSessionPlayer(db, sessionId, playerId) }
    }

    const sessionPlayer = await setAvailabilityRepo(db, sessionId, playerId, status)
    if (!sessionPlayer) return failure('Player is not eligible for an availability change.')
    await this.broadcast(sessionId)
    return { ok: true as const, sessionPlayer }
  }

  async cancelRegistration(sessionId: string, playerId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const sessionPlayer = await cancelRegistrationRepo(this.env.PICKLEBALL_DB, sessionId, playerId)
    if (!sessionPlayer) return failure('Registration cannot be cancelled in its current state.')
    await this.broadcast(sessionId)
    return { ok: true as const, sessionPlayer }
  }

  // FIXED_PAIRS edge case (spec 2.6): a member leaving the session leaves
  // the OTHER member without a partner, so the pair cannot stay ACTIVE --
  // it is dissolved (not merely closed out of the queue, unlike
  // setAvailability above) and its open queue entries are closed the same
  // way dissolvePair does. All three writes (the leave-session UPDATE, the
  // pair dissolve, the queue close) commit in ONE db.batch(): an
  // interruption between them could leave the departing player marked
  // LEFT_SESSION with the pair still ACTIVE (or vice versa), which would
  // either strand the remaining member unable to re-pair, or let a
  // dissolved pair's ex-partner still look partnered.
  async leaveSession(sessionId: string, playerId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')

    if (session.sessionType === 'FIXED_PAIRS') {
      // Guard BEFORE the batch, same shape as setAvailability's FIXED_PAIRS
      // branch above -- checking attendanceStatus AFTER db.batch() had
      // already committed the leave/dissolve/queue-close statements would
      // let a caller be told nothing happened while their pair was in fact
      // dissolved and their queue rows deleted. Unreachable today (formPair
      // gates pairing on CHECKED_IN, so a player in an ACTIVE pair is always
      // checked in), but the ordering must be correct regardless.
      const sessionPlayer = await getSessionPlayer(db, sessionId, playerId)
      if (!sessionPlayer || sessionPlayer.attendanceStatus !== 'CHECKED_IN') {
        return failure('Player cannot leave in their current state.')
      }

      const pair = await getActivePairForSessionPlayer(db, sessionId, sessionPlayer.id)

      // Same refusal as dissolvePair: leaving dissolves the pair, and doing
      // that while it is seated strands the court in the state described
      // there. The operator releases the court first.
      if (pair && (await hasOpenAssignmentForPair(db, sessionId, pair.id))) {
        return failure('This player is on a court. Release the court first, then mark them as having left.')
      }

      const leaveStatement = db
        .prepare(
          `UPDATE session_players SET attendance_status = 'LEFT_SESSION', updated_at = ?
           WHERE session_id = ? AND player_id = ? AND attendance_status = 'CHECKED_IN'`,
        )
        .bind(new Date().toISOString(), sessionId, playerId)

      const statements = [
        leaveStatement,
        ...(pair ? [buildDissolvePairStatement(db, sessionId, pair.id), buildCloseQueueEntriesForPairStatement(db, sessionId, pair.id)] : []),
      ]

      await db.batch(statements)

      await this.broadcast(sessionId)
      return { ok: true as const, sessionPlayer: await getSessionPlayer(db, sessionId, playerId) }
    }

    const sessionPlayer = await leaveSessionRepo(db, sessionId, playerId)
    if (!sessionPlayer) return failure('Player cannot leave in their current state.')
    await this.broadcast(sessionId)
    return { ok: true as const, sessionPlayer }
  }

  // Forms a fixed pair from two already-checked-in session players (spec Part
  // B). `createPair` is the real enforcement of "at most one ACTIVE pair per
  // player" (a BEFORE INSERT trigger, migration 0012) and "not the same
  // player twice" (a CHECK constraint) -- it returns null for either
  // violation rather than throwing, so both collapse into the same domain
  // failure here. The CHECKED_IN gate below is NOT covered by createPair at
  // all (createPair only knows about session_pairs, not attendance), so it
  // must be checked here before ever attempting the insert.
  async formPair(sessionId: string, sessionPlayerAId: string, sessionPlayerBId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    if (session.sessionType !== 'FIXED_PAIRS') {
      return failure('Pairs can only be formed for a Fixed Pairs session.')
    }

    const [playerA, playerB] = await Promise.all([
      getSessionPlayerById(db, sessionId, sessionPlayerAId),
      getSessionPlayerById(db, sessionId, sessionPlayerBId),
    ])
    if (!playerA || !playerB) return failure('Both players must belong to this session.')
    if (playerA.attendanceStatus !== 'CHECKED_IN' || playerB.attendanceStatus !== 'CHECKED_IN') {
      return failure('Both players must be checked in to form a pair.')
    }

    // Defense-in-depth re-check alongside migration 0012's BEFORE INSERT
    // trigger (trg_session_pairs_one_active_pair_per_player), which is the
    // real enforcement -- this DO already serializes every command for this
    // session, so this can never race with a concurrent formPair call for
    // the SAME session (the platform guarantee this file's header describes).
    // Checking explicitly here gives a clear, specific domain error instead
    // of relying solely on createPair's null return, and keeps working even
    // if the trigger's shape or message ever changes.
    const [existingPairA, existingPairB] = await Promise.all([
      getActivePairForSessionPlayer(db, sessionId, sessionPlayerAId),
      getActivePairForSessionPlayer(db, sessionId, sessionPlayerBId),
    ])
    if (existingPairA || existingPairB) {
      return failure('One or both players are already in an active pair.')
    }

    const pair = await createPair(db, { sessionId, sessionPlayerAId, sessionPlayerBId })
    if (!pair) {
      return failure('One or both players are already in an active pair, or the same player was given twice.')
    }

    await this.broadcast(sessionId)
    return { ok: true as const, pair }
  }

  // A tournament is a FIXED_PAIRS session carrying `tournamentFormat` (see
  // migration 0014's header) -- NOT a third session type -- so entering a
  // pair and locking the bracket both gate on that field, not on sessionType.
  //
  // Refused once bracket_locked_at is set: entrants are frozen the moment the
  // bracket locks (spec §3.2), same rule lockBracket itself enforces below.
  async enterPair(sessionId: string, sessionPairId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    if (!session.tournamentFormat) return failure('This session is not a tournament.')
    if (session.bracketLockedAt) return failure('The bracket is locked; entrants cannot be changed.')

    const pair = await getSessionPairRepo(db, sessionId, sessionPairId)
    if (!pair || pair.status !== 'ACTIVE') return failure('Pair not found, or not active.')

    const entrant = await enterTournamentPairRepo(db, { sessionId, sessionPairId })
    if (!entrant) return failure('This pair is already entered in the tournament.')

    await this.broadcast(sessionId)
    return { ok: true as const, entrant }
  }

  // Computes seeds (seedEntrants, reading each pair's members' ALL_TIME OPI),
  // generates fixtures (generateFixtures) and writes seeds + fixtures +
  // bracket_locked_at in ONE db.batch() -- a half-locked bracket (seeds
  // without fixtures, or fixtures without the lock) is exactly the class of
  // state Part B kept having to fix for session_pairs/queue_entries, and the
  // same discipline applies here. Locking twice is refused (seeds are frozen
  // once set, spec §3.2); so is locking with fewer than 2 entrants.
  async lockBracket(sessionId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')
    if (!session.tournamentFormat) return failure('This session is not a tournament.')
    if (session.bracketLockedAt) return failure('The bracket is already locked.')

    const entrants = await listTournamentEntrants(db, sessionId)
    if (entrants.length < 2) return failure('At least 2 entrants are required to lock the bracket.')

    // ALL_TIME OPI is per player_id, mean of the pair's two members, null if
    // either has no snapshot yet (seeding.ts sorts a null OPI last, never as
    // zero -- see that file's header). Tournament games never feed OPI
    // (that asymmetry is Task 7's concern, spec §3.2) but are seeded FROM it.
    const candidates: SeedCandidate[] = await Promise.all(
      entrants.map(async (entrant: { id: string; displayName: string; memberPlayerIds: string[] }) => {
        const [snapshotA, snapshotB] = await Promise.all(
          entrant.memberPlayerIds.map((playerId: string) => getPlayerSnapshot(db, playerId, 'ALL_TIME', null)),
        )
        const opiA = snapshotA ? snapshotA.opi : null
        const opiB = snapshotB ? snapshotB.opi : null
        const opi = opiA === null || opiB === null ? null : (opiA + opiB) / 2
        return { entrantId: entrant.id, displayName: entrant.displayName, opi }
      }),
    )

    const seeds = seedEntrants(candidates)
    // generateFixtures THROWS for any format other than ROUND_ROBIN
    // (deliberately -- see that file's header); createSessionSchema already
    // restricts tournamentFormat to 'ROUND_ROBIN' for this phase, so that
    // throw is unreachable via the public API today, not caught into an
    // empty fixture list here.
    const fixtures = generateFixtures(session.tournamentFormat as 'ROUND_ROBIN', seeds)

    // This file's other methods use `new Date().toISOString()` directly
    // (e.g. joinQueueAsPair above) rather than importing nowIso() from
    // responses.js -- followed here for consistency, not the sessionPairs.js
    // repository style.
    const timestamp = new Date().toISOString()
    const statements = [
      ...seeds.map(({ entrantId, seed }) => buildSetSeedStatement(db, sessionId, entrantId, seed)),
      ...insertFixturesStatements(db, sessionId, fixtures),
      buildLockBracketStatement(db, sessionId, timestamp),
    ]
    await db.batch(statements)

    await this.broadcast(sessionId)
    return { ok: true as const, seeds, fixtureCount: fixtures.length }
  }

  // Dissolves an ACTIVE pair AND closes any open queue_entries rows still
  // carrying this session_pair_id in ONE db.batch() -- migration 0012's
  // header is explicit that a queued pair's two rows share one
  // session_pair_id, so a dissolved pair must never leave either row queued
  // behind it (a facilitator dissolving a pair mid-queue must not leave a
  // "ghost" pair entry the fairness engine can still select). The two
  // statements MUST commit together: run as separate un-batched calls, a
  // failure/interruption between them could leave the pair DISSOLVED with
  // its queue rows still QUEUED -- exactly the ghost state this method
  // exists to prevent. Same db.batch() atomicity this file uses everywhere
  // else (see joinQueueAsPair's identical reasoning).
  async dissolvePair(sessionId: string, pairId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const db = this.env.PICKLEBALL_DB

    // Refused while the pair is seated, for the same reason
    // replaceAssignedPlayer is refused: there is no half-a-pair state this
    // codebase understands. Dissolving here used to delete the pair's
    // ASSIGNED/PLAYING queue rows while leaving the court ASSIGNED with its
    // teams still bound -- after which hasOpenQueueEntry reported both
    // members free, so the same player could be re-paired and seated on a
    // SECOND court while still on the first. Releasing the court is the
    // operator's recovery path and is available on the Courts page.
    if (await hasOpenAssignmentForPair(db, sessionId, pairId)) {
      return failure('This pair is on a court. Release the court first, then dissolve the pair.')
    }

    const dissolveStatement = buildDissolvePairStatement(db, sessionId, pairId)
    const closeQueueStatement = buildCloseQueueEntriesForPairStatement(db, sessionId, pairId)

    const [dissolveResult] = await db.batch([dissolveStatement, closeQueueStatement])
    if (!dissolveResult.meta.changes) return failure('Pair not found, or already dissolved.')

    await this.broadcast(sessionId)
    return { ok: true as const }
  }

  // A FIXED_PAIRS session queues pairs and nothing else (spec Part B): this
  // branches on session type BEFORE ever touching queue_entries, so an
  // OPEN_PLAY session's path below is completely unchanged (same repo call,
  // same failure message, same shape) -- every new branch is conditional on
  // `sessionType === 'FIXED_PAIRS'`, never the other way around.
  async joinQueue(sessionId: string, sessionPlayerId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')

    if (session.sessionType === 'FIXED_PAIRS') {
      const pair = await getActivePairForSessionPlayer(db, sessionId, sessionPlayerId)
      if (!pair) return failure('Player is not part of an active pair; form a pair before joining the queue.')

      const queueEntry = await joinQueueAsPairRepo(db, { sessionId, sessionPairId: pair.id })
      if (!queueEntry) return failure('This pair already has an open queue entry.')
      await this.broadcast(sessionId)
      return { ok: true as const, queueEntry }
    }

    const queueEntry = await joinQueueRepo(db, { sessionId, sessionPlayerId })
    if (!queueEntry) return failure('Player already has an open queue entry.')
    await this.broadcast(sessionId)
    return { ok: true as const, queueEntry }
  }

  async leaveQueue(sessionId: string, sessionPlayerId: string) {
    if (!this.ownsSession(sessionId)) return failure('Coordinator/session mismatch.')
    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return failure('Session not found.')

    if (session.sessionType === 'FIXED_PAIRS') {
      const pair = await getActivePairForSessionPlayer(db, sessionId, sessionPlayerId)
      if (!pair) return failure('Player is not part of an active pair.')

      const left = await leaveQueueAsPairRepo(db, sessionId, pair.id)
      if (!left) return failure('No open queue entry to leave.')
      await this.broadcast(sessionId)
      return { ok: true as const }
    }

    const left = await leaveQueueRepo(db, sessionId, sessionPlayerId)
    if (!left) return failure('No open queue entry to leave.')
    await this.broadcast(sessionId)
    return { ok: true as const }
  }
}
