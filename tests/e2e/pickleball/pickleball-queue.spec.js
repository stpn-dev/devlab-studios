import { test, expect } from '@playwright/test'

async function createDraftSessionWithCourts(request, courtCount) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const venueResponse = await request.post('/api/pickleball/venues', {
    data: { name: `Lifecycle Test Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
  })
  expect(venueResponse.ok()).toBe(true)
  const venueId = (await venueResponse.json()).venue.id

  for (let i = 0; i < courtCount; i += 1) {
    const courtResponse = await request.post('/api/pickleball/courts', { data: { venueId, name: `Court ${i + 1}` } })
    expect(courtResponse.ok()).toBe(true)
  }

  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `Lifecycle Test Session ${Date.now()}`,
      sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-08-30T18:00:00.000Z',
      scheduledEnd: '2026-08-30T22:00:00.000Z',
    },
  })
  expect(sessionResponse.ok()).toBe(true)
  const session = (await sessionResponse.json()).session

  return { sessionId: session.id, session }
}

async function createSessionWithCheckedInPlayers(request, playerCount) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const venueResponse = await request.post('/api/pickleball/venues', {
    data: { name: `Queue Test Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
  })
  expect(venueResponse.ok()).toBe(true)
  const venueId = (await venueResponse.json()).venue.id

  for (let i = 0; i < 2; i += 1) {
    const courtResponse = await request.post('/api/pickleball/courts', { data: { venueId, name: `Court ${i + 1}` } })
    expect(courtResponse.ok()).toBe(true)
  }

  // Courts are created on the venue BEFORE the session so that session
  // creation's auto-provisioning (seedSessionCourtsFromVenue) has courts to
  // seed session_courts rows from.
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `Queue Test Session ${Date.now()}`,
      sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-08-30T18:00:00.000Z',
      scheduledEnd: '2026-08-30T22:00:00.000Z',
    },
  })
  expect(sessionResponse.ok()).toBe(true)
  const sessionId = (await sessionResponse.json()).session.id

  // SessionCoordinatorDO.assignCourt requires session.status === 'LIVE'
  // (SessionCoordinatorDO.ts:72). The state machine requires the
  // intermediate OPEN_FOR_CHECKIN hop — DRAFT cannot jump straight to LIVE.
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  const courtsListResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
  const sessionCourts = (await courtsListResponse.json()).courts

  const sessionPlayerIds = []
  for (let i = 0; i < playerCount; i += 1) {
    const playerResponse = await request.post('/api/pickleball/players', {
      data: { displayName: `Queue Player ${Date.now()}-${i}-${Math.random().toString(36).slice(2)}` },
    })
    const playerId = (await playerResponse.json()).player.id

    const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
    const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id

    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })

    sessionPlayerIds.push(sessionPlayerId)
  }

  return { sessionId, sessionCourts, sessionPlayerIds }
}

test.describe('Pickleball queue and court assignment', () => {
  test('lists the queue with explainable reasons for each player', async ({ request }) => {
    const { sessionId } = await createSessionWithCheckedInPlayers(request, 2)
    const response = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const body = await response.json()
    expect(body.queue).toHaveLength(2)
    for (const entry of body.queue) {
      expect(entry.reasons.some((r) => r.startsWith('Games played:'))).toBe(true)
      expect(entry.reasons.some((r) => r.startsWith('Queue wait:'))).toBe(true)
    }
  })

  test('assigns a court to the fairness-selected players and marks them ASSIGNED', async ({ request }) => {
    const { sessionId, sessionCourts, sessionPlayerIds } = await createSessionWithCheckedInPlayers(request, 4)

    const assignResponse = await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, {
      data: { sessionCourtId: sessionCourts[0].id },
    })
    expect(assignResponse.status()).toBe(200)
    const body = await assignResponse.json()
    expect(body.court.status).toBe('ASSIGNED')
    expect(body.teamA.players.length + body.teamB.players.length).toBe(4)

    const queueResponse = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const queue = (await queueResponse.json()).queue
    const assignedIds = queue.filter((e) => e.status === 'ASSIGNED').map((e) => e.sessionPlayerId)
    expect(assignedIds.sort()).toEqual([...sessionPlayerIds].sort())
  })

  test('rejects assignment when fewer than the required players are eligible', async ({ request }) => {
    const { sessionId, sessionCourts } = await createSessionWithCheckedInPlayers(request, 2)
    const assignResponse = await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, {
      data: { sessionCourtId: sessionCourts[0].id },
    })
    expect(assignResponse.status()).toBe(409)
  })

  // The single most important test in this phase: it is the actual proof that
  // SessionCoordinatorDO serializes court assignment, not just a theoretical
  // claim. Two courts, two simultaneous assign calls, 8 eligible players (exactly
  // enough for two DOUBLES assignments with none left over) — if the DO's
  // batching/serialization is broken, the same player would be selected onto
  // both courts and this test would catch it via the overlap/size assertions
  // below. A flaky result here is a signal to investigate the DO, not to retry.
  test('CONCURRENCY: two simultaneous assignments to two different courts never select the same player twice', async ({ request }) => {
    const { sessionId, sessionCourts, sessionPlayerIds } = await createSessionWithCheckedInPlayers(request, 8)
    expect(sessionCourts.length).toBeGreaterThanOrEqual(2)

    const [firstResponse, secondResponse] = await Promise.all([
      request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId: sessionCourts[0].id } }),
      request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId: sessionCourts[1].id } }),
    ])

    expect(firstResponse.status()).toBe(200)
    expect(secondResponse.status()).toBe(200)

    const firstBody = await firstResponse.json()
    const secondBody = await secondResponse.json()

    const firstPlayers = [...firstBody.teamA.players, ...firstBody.teamB.players].map((p) => p.sessionPlayerId)
    const secondPlayers = [...secondBody.teamA.players, ...secondBody.teamB.players].map((p) => p.sessionPlayerId)

    expect(firstPlayers).toHaveLength(4)
    expect(secondPlayers).toHaveLength(4)

    const overlap = firstPlayers.filter((id) => secondPlayers.includes(id))
    expect(overlap).toEqual([])
    expect(new Set([...firstPlayers, ...secondPlayers]).size).toBe(8)
    expect(new Set([...firstPlayers, ...secondPlayers])).toEqual(new Set(sessionPlayerIds))
  })

  test('replaces an assigned player and requeues them when disposition is REQUEUE', async ({ request }) => {
    const { sessionId, sessionCourts, sessionPlayerIds } = await createSessionWithCheckedInPlayers(request, 5)

    const assignResponse = await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, {
      data: { sessionCourtId: sessionCourts[0].id },
    })
    const assignBody = await assignResponse.json()
    const assignedIds = [...assignBody.teamA.players, ...assignBody.teamB.players].map((p) => p.sessionPlayerId)
    const outgoing = assignedIds[0]
    const incoming = sessionPlayerIds.find((id) => !assignedIds.includes(id))

    const replaceResponse = await request.post(`/api/pickleball/sessions/${sessionId}/courts/replace`, {
      data: { sessionCourtId: sessionCourts[0].id, outgoingSessionPlayerId: outgoing, incomingSessionPlayerId: incoming, outgoingDisposition: 'REQUEUE' },
    })
    expect(replaceResponse.status()).toBe(200)

    const queueResponse = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const queue = (await queueResponse.json()).queue
    const outgoingEntry = queue.find((e) => e.sessionPlayerId === outgoing)
    expect(outgoingEntry.status).toBe('QUEUED')

    const incomingEntry = queue.find((e) => e.sessionPlayerId === incoming)
    expect(incomingEntry.status).toBe('ASSIGNED')
  })

  test('releasing a court with AUTO_REQUEUE_ALL requeues all four players', async ({ request }) => {
    const { sessionId, sessionCourts, sessionPlayerIds } = await createSessionWithCheckedInPlayers(request, 4)

    await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId: sessionCourts[0].id } })
    const releaseResponse = await request.post(`/api/pickleball/sessions/${sessionId}/courts/release`, {
      data: { sessionCourtId: sessionCourts[0].id },
    })
    expect(releaseResponse.status()).toBe(200)
    const body = await releaseResponse.json()
    expect(body.requeued).toBe(true)
    expect(body.releasedSessionPlayerIds.sort()).toEqual([...sessionPlayerIds].sort())

    const courtsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
    const court = (await courtsResponse.json()).courts.find((c) => c.id === sessionCourts[0].id)
    expect(court.status).toBe('AVAILABLE')

    const queueResponse = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const queue = (await queueResponse.json()).queue
    expect(queue.filter((e) => e.status === 'QUEUED')).toHaveLength(4)
  })

  test('a new session auto-provisions one session_courts row per venue court, already AVAILABLE with zero status transitions', async ({ request }) => {
    const { sessionId, session } = await createDraftSessionWithCourts(request, 3)
    expect(session.status).toBe('DRAFT')

    const courtsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
    expect(courtsResponse.status()).toBe(200)
    const courts = (await courtsResponse.json()).courts
    expect(courts).toHaveLength(3)
    for (const court of courts) {
      expect(court.enabled).toBe(true)
      expect(court.status).toBe('AVAILABLE')
    }
  })

  test('the session status state machine gates court assignment through the real API', async ({ request }) => {
    const { sessionId } = await createDraftSessionWithCourts(request, 1)
    const courtsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
    const preLiveCourts = (await courtsResponse.json()).courts

    // assignCourt on a DRAFT session still 409s via SessionCoordinatorDO's own gate.
    const draftAssignResponse = await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, {
      data: { sessionCourtId: preLiveCourts[0].id },
    })
    expect(draftAssignResponse.status()).toBe(409)
    // Assert on the message, not just the status code — a 409 here would
    // equally pass on "Court not found." as on the "Session is not live."
    // this test is actually meant to prove.
    expect((await draftAssignResponse.json()).error).toContain('not live')

    // Illegal transition: DRAFT straight to LIVE.
    const illegalDirectResponse = await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
    expect(illegalDirectResponse.status()).toBe(409)

    // Legal path: DRAFT -> OPEN_FOR_CHECKIN -> LIVE.
    const openResponse = await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
    expect(openResponse.status()).toBe(200)
    expect((await openResponse.json()).session.status).toBe('OPEN_FOR_CHECKIN')

    const liveResponse = await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
    expect(liveResponse.status()).toBe(200)
    expect((await liveResponse.json()).session.status).toBe('LIVE')

    // Illegal transition: LIVE back to DRAFT.
    const illegalBackwardResponse = await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'DRAFT' } })
    expect(illegalBackwardResponse.status()).toBe(409)

    // Now that the session is LIVE, assignCourt succeeds. Enough checked-in,
    // queued players are needed for a DOUBLES assignment; reuse the same
    // registration/check-in/queue flow the other tests use.
    for (let i = 0; i < 4; i += 1) {
      const playerResponse = await request.post('/api/pickleball/players', {
        data: { displayName: `Lifecycle Player ${Date.now()}-${i}-${Math.random().toString(36).slice(2)}` },
      })
      const playerId = (await playerResponse.json()).player.id
      const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
      const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
      await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
      await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
    }

    const liveAssignResponse = await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, {
      data: { sessionCourtId: preLiveCourts[0].id },
    })
    expect(liveAssignResponse.status()).toBe(200)
  })

  test('a SCOREKEEPER cannot call the session status route', async ({ request }) => {
    const { sessionId } = await createDraftSessionWithCourts(request, 1)

    const sessionInfoResponse = await request.get('/api/pickleball/auth/session')
    const { activeOrgId } = await sessionInfoResponse.json()
    await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
      data: { invitedEmail: 'scorekeeper-status@example.com', role: 'SCOREKEEPER' },
    })
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'scorekeeper-status@example.com' } })

    const response = await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
    expect(response.status()).toBe(403)
  })

  test('a SCOREKEEPER cannot assign a court', async ({ request }) => {
    const { sessionId, sessionCourts } = await createSessionWithCheckedInPlayers(request, 4)

    const sessionInfoResponse = await request.get('/api/pickleball/auth/session')
    const { activeOrgId } = await sessionInfoResponse.json()
    await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
      data: { invitedEmail: 'scorekeeper-queue@example.com', role: 'SCOREKEEPER' },
    })
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'scorekeeper-queue@example.com' } })

    const response = await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, {
      data: { sessionCourtId: sessionCourts[0].id },
    })
    expect(response.status()).toBe(403)
  })
})
