import { describe, it, expect } from 'vitest'
import { toPublicSessionView } from './publicSessionView'

const snapshot = {
  session: {
    id: 's1', organizationId: 'org1', venueId: 'v1', name: 'Tuesday Open Play', sessionType: 'OPEN_PLAY',
    status: 'LIVE', scoringRulesetId: 'r1', scheduledStart: '2026-08-25T18:00:00.000Z', scheduledEnd: null,
    actualStart: null, actualEnd: null, postGameRotationPolicy: 'AUTO_REQUEUE_ALL', leaderboardMinGames: 3,
    publicViewEnabled: true, publicLeaderboardEnabled: true, createdByUserId: 'u1',
    createdAt: '2026-08-25T17:00:00.000Z', updatedAt: '2026-08-25T17:00:00.000Z',
  },
  courts: [{
    id: 'c1', sessionId: 's1', courtId: 'court1', courtName: 'Court 1', enabled: true, status: 'PLAYING',
    currentGameId: 'g1', createdAt: '2026-08-25T17:00:00.000Z', updatedAt: '2026-08-25T17:05:00.000Z',
  }],
  queue: [{
    id: 'q1', sessionId: 's1', sessionPlayerId: 'sp1', playerId: 'p1', displayName: 'Alex Rivera',
    gamesPlayed: 2, status: 'QUEUED', queuedAt: '2026-08-25T17:10:00.000Z', assignedAt: null,
  }],
  games: [{
    id: 'g1', sessionId: 's1', sessionCourtId: 'c1', scoringRulesetId: 'r1', format: 'DOUBLES', status: 'IN_PROGRESS',
    teamAId: 'ta1', teamBId: 'tb1', revision: 3, scoreA: 5, scoreB: 3, servingTeam: 'A' as const, serverNumber: 2 as const,
    teamAStartingServerSessionPlayerId: 'sp1', teamBStartingServerSessionPlayerId: 'sp2',
    teamACurrentServerSessionPlayerId: 'sp1', teamBCurrentServerSessionPlayerId: 'sp2',
    correctionPending: false, winningTeamId: null, finalScoreA: null, finalScoreB: null,
    startedAt: '2026-08-25T17:05:00.000Z', finishedAt: null, createdAt: '2026-08-25T17:05:00.000Z', updatedAt: '2026-08-25T17:20:00.000Z',
  }],
  teamNames: { ta1: 'Jordan Lee / Sam Patel', tb1: 'Casey Kim / Morgan Diaz' },
  leaderboard: [
    { displayName: 'Jordan Lee', opi: 61.11, rank: 1, confidenceTier: 'DEVELOPING' },
    { displayName: 'Sam Patel', opi: 45, rank: 2, confidenceTier: 'PROVISIONAL' },
  ],
}

describe('toPublicSessionView', () => {
  it('allowlists session to id/name/sessionType/status only', () => {
    const view = toPublicSessionView(snapshot)
    expect(view.session).toEqual({ id: 's1', name: 'Tuesday Open Play', sessionType: 'OPEN_PLAY', status: 'LIVE' })
  })

  it('never exposes organizationId or createdByUserId', () => {
    const view = toPublicSessionView(snapshot)
    expect(JSON.stringify(view)).not.toContain('org1')
    expect(JSON.stringify(view)).not.toContain('u1')
  })

  it('allowlists courts to id/courtName/status/currentGameId only', () => {
    const view = toPublicSessionView(snapshot)
    expect(view.courts).toEqual([{ id: 'c1', courtName: 'Court 1', status: 'PLAYING', currentGameId: 'g1' }])
  })

  it('omits the queue entirely', () => {
    const view = toPublicSessionView(snapshot)
    // `queue` isn't part of PublicSessionView's type at all (that's the
    // allowlist doing its job) -- cast through `unknown` to assert the
    // runtime shape really has no such key, rather than a type error.
    expect((view as unknown as { queue?: unknown }).queue).toBeUndefined()
  })

  it('never exposes a queued player\'s display name', () => {
    const view = toPublicSessionView(snapshot)
    expect(JSON.stringify(view)).not.toContain('Alex Rivera')
  })

  it('allowlists games to score/serving/status fields plus team names, never session_player ids', () => {
    const view = toPublicSessionView(snapshot)
    expect(view.games).toEqual([{
      id: 'g1', sessionCourtId: 'c1', format: 'DOUBLES', status: 'IN_PROGRESS',
      scoreA: 5, scoreB: 3, servingTeam: 'A', serverNumber: 2,
      winningTeamId: null, finalScoreA: null, finalScoreB: null,
      teamAName: 'Jordan Lee / Sam Patel', teamBName: 'Casey Kim / Morgan Diaz',
    }])
    expect(JSON.stringify(view.games)).not.toContain('sp1')
  })

  it('includes the sanitized leaderboard as-provided (display name, opi, rank, confidence tier only)', () => {
    const view = toPublicSessionView(snapshot)
    expect(view.leaderboard).toEqual([
      { displayName: 'Jordan Lee', opi: 61.11, rank: 1, confidenceTier: 'DEVELOPING' },
      { displayName: 'Sam Patel', opi: 45, rank: 2, confidenceTier: 'PROVISIONAL' },
    ])
  })

  it('omits the leaderboard (null) when the snapshot carries none, e.g. publicLeaderboardEnabled is false', () => {
    const view = toPublicSessionView({ ...snapshot, leaderboard: null })
    expect(view.leaderboard).toBeNull()
  })

  it('falls back to null team names for a team id with no entry in teamNames', () => {
    const view = toPublicSessionView({ ...snapshot, teamNames: {} })
    expect(view.games[0].teamAName).toBeNull()
    expect(view.games[0].teamBName).toBeNull()
  })
})
