// Durable Object that serializes all court-assignment work for one Pickleball
// session. Instances are keyed by session id
// (`env.SESSION_COORDINATOR.idFromName(sessionId)`), so every mutation below is
// automatically serialized against every other mutation for the same session.
//
// CONCURRENCY: the atomicity guarantee comes entirely from the Durable Object
// runtime processing one request at a time per instance. There is deliberately
// NO manual lock/mutex in this file — adding one would be redundant with the
// platform guarantee and could conflict with it.
//
// TENANCY: this class has no notion of "organization". Every caller (Task 7's
// API routes) has already verified that the authenticated user's organization
// owns `sessionId` before invoking these methods, which is why the org-agnostic
// `getSessionById` is correct here and the org-scoped `getSession` is not.
import { DurableObject } from 'cloudflare:workers'
import { getSessionById, getScoringRuleset } from '../repositories/pickleball/sessions.js'
import { getSessionCourt, setCourtStatus } from '../repositories/pickleball/sessionCourts.js'
import {
  listEligibleQueueCandidates,
  markAssigned,
  closeQueueEntry,
  joinQueue,
} from '../repositories/pickleball/queueEntries.js'
import { createTeam, addTeamMember, getActiveTeamForSessionPlayer } from '../repositories/pickleball/teams.js'
import { selectNextPlayers, type QueueCandidate } from '../../lib/pickleball/queueEngine'

function requiredPlayerCount(format: string): number {
  return format === 'SINGLES' ? 2 : 4
}

export class SessionCoordinatorDO extends DurableObject<Env> {
  async assignCourt(sessionId: string, sessionCourtId: string) {
    const db = this.env.PICKLEBALL_DB

    const session = await getSessionById(db, sessionId)
    if (!session) return { ok: false as const, error: 'Session not found.' }
    if (session.sessionType !== 'OPEN_PLAY') {
      return { ok: false as const, error: 'Court assignment is only supported for Open Play sessions in this phase.' }
    }

    const court = await getSessionCourt(db, sessionId, sessionCourtId)
    if (!court) return { ok: false as const, error: 'Court not found.' }
    if (court.status !== 'AVAILABLE') return { ok: false as const, error: 'Court is not available.' }

    const ruleset = await getScoringRuleset(db, session.scoringRulesetId, session.organizationId)
    const needed = requiredPlayerCount(ruleset ? ruleset.format : 'DOUBLES')

    const candidates: QueueCandidate[] = await listEligibleQueueCandidates(db, sessionId)
    if (candidates.length < needed) {
      return { ok: false as const, error: `Not enough eligible players (need ${needed}, have ${candidates.length}).` }
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

    const teamA = await createTeam(db, { sessionId, kind: 'AD_HOC' })
    for (const player of teamAPlayers) await addTeamMember(db, { teamId: teamA.id, sessionPlayerId: player.sessionPlayerId })

    const teamB = await createTeam(db, { sessionId, kind: 'AD_HOC' })
    for (const player of teamBPlayers) await addTeamMember(db, { teamId: teamB.id, sessionPlayerId: player.sessionPlayerId })

    await markAssigned(db, sessionId, selected.map((p) => p.sessionPlayerId))
    await setCourtStatus(db, sessionId, sessionCourtId, 'ASSIGNED')

    return {
      ok: true as const,
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
    const db = this.env.PICKLEBALL_DB

    const court = await getSessionCourt(db, sessionId, sessionCourtId)
    if (!court) return { ok: false as const, error: 'Court not found.' }
    if (court.status !== 'ASSIGNED') return { ok: false as const, error: 'Court has no pending assignment to replace a player on.' }

    const team = await getActiveTeamForSessionPlayer(db, sessionId, outgoingSessionPlayerId)
    if (!team) return { ok: false as const, error: 'Outgoing player is not currently assigned on this session.' }

    const candidates: QueueCandidate[] = await listEligibleQueueCandidates(db, sessionId)
    const incoming = candidates.find((c) => c.sessionPlayerId === incomingSessionPlayerId)
    if (!incoming) return { ok: false as const, error: 'Incoming player is not eligible (must be checked in, available, and queued).' }

    await db
      .prepare(`UPDATE team_members SET session_player_id = ? WHERE team_id = ? AND session_player_id = ?`)
      .bind(incomingSessionPlayerId, team.id, outgoingSessionPlayerId)
      .run()

    await markAssigned(db, sessionId, [incomingSessionPlayerId])
    await closeQueueEntry(db, sessionId, outgoingSessionPlayerId)

    if (outgoingDisposition === 'UNAVAILABLE') {
      await db
        .prepare(`UPDATE session_players SET availability_status = 'TEMPORARILY_UNAVAILABLE', updated_at = ? WHERE id = ?`)
        .bind(new Date().toISOString(), outgoingSessionPlayerId)
        .run()
    } else {
      await joinQueue(db, { sessionId, sessionPlayerId: outgoingSessionPlayerId })
    }

    return { ok: true as const, teamId: team.id, incomingSessionPlayerId, outgoingSessionPlayerId }
  }

  async releaseCourt(sessionId: string, sessionCourtId: string) {
    const db = this.env.PICKLEBALL_DB

    const court = await getSessionCourt(db, sessionId, sessionCourtId)
    if (!court) return { ok: false as const, error: 'Court not found.' }
    if (court.status !== 'ASSIGNED') return { ok: false as const, error: 'Court is not currently assigned.' }

    const session = await getSessionById(db, sessionId)

    const membersResult = await db
      .prepare(
        `SELECT tm.session_player_id FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         WHERE t.session_id = ? AND tm.session_player_id IN (
           SELECT session_player_id FROM queue_entries WHERE session_id = ? AND status = 'ASSIGNED'
         )`,
      )
      .bind(sessionId, sessionId)
      .all<{ session_player_id: string }>()

    const sessionPlayerIds = (membersResult.results || []).map((row) => row.session_player_id)

    for (const sessionPlayerId of sessionPlayerIds) {
      await closeQueueEntry(db, sessionId, sessionPlayerId)
      if (session && session.postGameRotationPolicy === 'AUTO_REQUEUE_ALL') {
        await joinQueue(db, { sessionId, sessionPlayerId })
      }
    }

    await setCourtStatus(db, sessionId, sessionCourtId, 'AVAILABLE')

    return { ok: true as const, releasedSessionPlayerIds: sessionPlayerIds, requeued: session?.postGameRotationPolicy === 'AUTO_REQUEUE_ALL' }
  }
}
