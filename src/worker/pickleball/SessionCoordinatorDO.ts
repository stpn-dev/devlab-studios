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
} from '../repositories/pickleball/teams.js'
import {
  buildSetAvailabilityByIdStatement,
  buildIncrementGamesPlayedStatement,
} from '../repositories/pickleball/sessionPlayers.js'
import { selectNextPlayers, type QueueCandidate } from '../../lib/pickleball/queueEngine'

function requiredPlayerCount(format: string): number {
  return format === 'SINGLES' ? 2 : 4
}

function failure(error: string) {
  return { ok: false as const, error }
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

    const statements = [
      teamA.statement,
      ...teamAPlayers.map((player) => buildAddTeamMemberStatement(db, { teamId: teamA.id, sessionPlayerId: player.sessionPlayerId })),
      teamB.statement,
      ...teamBPlayers.map((player) => buildAddTeamMemberStatement(db, { teamId: teamB.id, sessionPlayerId: player.sessionPlayerId })),
      buildMarkAssignedStatement(db, sessionId, selected.map((p) => p.sessionPlayerId)),
      buildSetCourtStatusStatement(db, sessionId, sessionCourtId, 'ASSIGNED'),
    ].filter(Boolean)

    await db.batch(statements)

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
    if (court.status !== 'ASSIGNED') return failure('Court is not currently assigned.')

    const session = await getSessionById(db, sessionId)

    // Scoped to THIS court via teams.session_court_id. Previously this was a
    // session-wide query, so releasing one court also requeued every other
    // simultaneously-assigned court's players while leaving those courts stuck
    // at ASSIGNED.
    const sessionPlayerIds: string[] = await listAssignedSessionPlayerIdsForCourt(db, sessionId, sessionCourtId)

    const requeued = session?.postGameRotationPolicy === 'AUTO_REQUEUE_ALL'

    const statements = sessionPlayerIds.flatMap((sessionPlayerId) => [
      buildCloseQueueEntryStatement(db, sessionId, sessionPlayerId),
      // Runs on both rotation policies: a player's games-played count reflects
      // that their assignment ended, independent of whether they re-queue.
      buildIncrementGamesPlayedStatement(db, sessionId, sessionPlayerId),
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
}
