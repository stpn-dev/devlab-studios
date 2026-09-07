import { test, expect } from '@playwright/test'
import { loginAsOperator } from './helpers.js'

async function createFixedPairsSessionWithCheckedInPlayers(request, playerCount, courtCount = 1) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const venueResponse = await request.post('/api/pickleball/venues', {
    data: { name: `Pairs Test Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
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
      name: `Pairs Test Session ${Date.now()}`,
      sessionType: 'FIXED_PAIRS',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-08-30T18:00:00.000Z',
      scheduledEnd: '2026-08-30T22:00:00.000Z',
    },
  })
  expect(sessionResponse.ok()).toBe(true)
  const sessionId = (await sessionResponse.json()).session.id

  // SessionCoordinatorDO.assignCourt requires session.status === 'LIVE', and
  // the state machine requires the intermediate OPEN_FOR_CHECKIN hop — same
  // reasoning as pickleball-queue.spec.js's helper.
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  // Courts are created on the venue BEFORE the session so that session
  // creation's auto-provisioning (seedSessionCourtsFromVenue) has courts to
  // seed session_courts rows from — same reasoning as pickleball-queue.spec.js.
  const courtsListResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
  const sessionCourts = (await courtsListResponse.json()).courts

  const sessionPlayerIds = []
  for (let i = 0; i < playerCount; i += 1) {
    const playerResponse = await request.post('/api/pickleball/players', {
      data: { displayName: `Pairs Player ${Date.now()}-${i}-${Math.random().toString(36).slice(2)}` },
    })
    const playerId = (await playerResponse.json()).player.id

    const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
    const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id

    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })

    sessionPlayerIds.push(sessionPlayerId)
  }

  return { sessionId, sessionCourts, sessionPlayerIds }
}

async function registerUncheckedInPlayer(request, sessionId) {
  const playerResponse = await request.post('/api/pickleball/players', {
    data: { displayName: `Pairs Player Unchecked ${Date.now()}-${Math.random().toString(36).slice(2)}` },
  })
  const playerId = (await playerResponse.json()).player.id
  const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
  return (await registerResponse.json()).sessionPlayer.id
}

async function loginAsScorekeeper(request, label) {
  const sessionInfoResponse = await request.get('/api/pickleball/auth/session')
  const { activeOrgId } = await sessionInfoResponse.json()
  const email = `scorekeeper-${label}-${Date.now()}@example.com`
  await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
    data: { invitedEmail: email, role: 'SCOREKEEPER' },
  })
  await request.post('/api/pickleball/auth/test-login', { data: { email } })
}

async function formPair(request, sessionId, sessionPlayerAId, sessionPlayerBId) {
  const response = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
    data: { sessionPlayerAId, sessionPlayerBId },
  })
  return (await response.json()).pair
}

// Forms a pair and immediately queues it. Joining names only ONE member --
// the DO resolves the pair from that member and queues both (see the "queue
// a pair, not a player" tests below) -- so a single join call is enough to
// make the pair court-assignment-eligible.
async function formAndQueuePair(request, sessionId, sessionPlayerAId, sessionPlayerBId) {
  const pair = await formPair(request, sessionId, sessionPlayerAId, sessionPlayerBId)
  const joinResponse = await request.post(`/api/pickleball/sessions/${sessionId}/queue`, {
    data: { sessionPlayerId: sessionPlayerAId },
  })
  expect(joinResponse.status()).toBe(201)
  return pair
}

test.describe('Pickleball fixed pairs: session creation', () => {
  test('rejects a FIXED_PAIRS session created against a SINGLES ruleset', async ({ request }) => {
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

    const venueResponse = await request.post('/api/pickleball/venues', {
      data: { name: `Pairs Creation Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
    })
    const venueId = (await venueResponse.json()).venue.id

    // The seeded default ruleset is DOUBLES-only, so a SINGLES ruleset has
    // to be created through the real API rather than referenced by a fixed
    // fixture id.
    const rulesetResponse = await request.post('/api/pickleball/scoring-rulesets', {
      data: { name: `Singles Reject Ruleset ${Date.now()}`, targetScore: 11, winBy: 2, format: 'SINGLES' },
    })
    expect(rulesetResponse.status()).toBe(201)
    const singlesRulesetId = (await rulesetResponse.json()).ruleset.id

    const sessionResponse = await request.post('/api/pickleball/sessions', {
      data: {
        venueId,
        name: `Pairs Singles Reject ${Date.now()}`,
        sessionType: 'FIXED_PAIRS',
        scoringRulesetId: singlesRulesetId,
        scheduledStart: '2026-08-30T18:00:00.000Z',
        scheduledEnd: '2026-08-30T22:00:00.000Z',
      },
    })
    expect(sessionResponse.status()).toBe(400)
    expect((await sessionResponse.json()).error).toContain('doubles')
  })

  test('creates a FIXED_PAIRS session against a DOUBLES ruleset', async ({ request }) => {
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

    const venueResponse = await request.post('/api/pickleball/venues', {
      data: { name: `Pairs Creation Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
    })
    const venueId = (await venueResponse.json()).venue.id

    const sessionResponse = await request.post('/api/pickleball/sessions', {
      data: {
        venueId,
        name: `Pairs Doubles Accept ${Date.now()}`,
        sessionType: 'FIXED_PAIRS',
        scoringRulesetId: 'usap-2026-sideout-11-doubles',
        scheduledStart: '2026-08-30T18:00:00.000Z',
        scheduledEnd: '2026-08-30T22:00:00.000Z',
      },
    })
    expect(sessionResponse.status()).toBe(201)
    expect((await sessionResponse.json()).session.sessionType).toBe('FIXED_PAIRS')
  })

  test('the create form offers both Open Play and Fixed Pairs session types', async ({ page, request, baseURL }) => {
    await loginAsOperator(request, page.context(), baseURL)

    await page.goto('/pickleball/app/sessions')
    await page.getByRole('button', { name: 'New Session' }).click()

    const options = await page.getByTestId('session-type-select').locator('option').allTextContents()
    expect(options).toEqual(['Open Play', 'Fixed Pairs'])
  })
})

test.describe('Pickleball fixed pairs: form and dissolve', () => {
  test('forms a pair from two checked-in players', async ({ request }) => {
    const { sessionId, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 2)
    const [playerA, playerB] = sessionPlayerIds

    const response = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: playerA, sessionPlayerBId: playerB },
    })
    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.pair.sessionPlayerAId).toBe(playerA)
    expect(body.pair.sessionPlayerBId).toBe(playerB)
    expect(body.pair.status).toBe('ACTIVE')
  })

  test('refuses to pair a player who is already in an active pair', async ({ request }) => {
    const { sessionId, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 3)
    const [playerA, playerB, playerC] = sessionPlayerIds

    const firstPairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: playerA, sessionPlayerBId: playerB },
    })
    expect(firstPairResponse.status()).toBe(201)

    const secondPairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: playerA, sessionPlayerBId: playerC },
    })
    expect(secondPairResponse.status()).toBe(409)
    expect((await secondPairResponse.json()).error).toBeTruthy()
  })

  test('refuses to pair a player who is not checked in', async ({ request }) => {
    const { sessionId, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 1)
    const [playerA] = sessionPlayerIds
    const notCheckedInSessionPlayerId = await registerUncheckedInPlayer(request, sessionId)

    const response = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: playerA, sessionPlayerBId: notCheckedInSessionPlayerId },
    })
    expect(response.status()).toBe(409)
    expect((await response.json()).error).toContain('checked in')
  })

  test('dissolving a pair lets its members be paired with someone else', async ({ request, baseURL }) => {
    const { sessionId, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 3)
    const [playerA, playerB, playerC] = sessionPlayerIds

    const pairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: playerA, sessionPlayerBId: playerB },
    })
    const pairId = (await pairResponse.json()).pair.id

    // An explicit Origin header is required — Astro's CSRF check rejects a
    // bodyless request.delete() with none (same pattern as pickleball-crud.spec.js).
    const dissolveResponse = await request.delete(`/api/pickleball/sessions/${sessionId}/pairs/${pairId}`, {
      headers: { Origin: baseURL },
    })
    expect(dissolveResponse.status()).toBe(200)

    const rePairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: playerA, sessionPlayerBId: playerC },
    })
    expect(rePairResponse.status()).toBe(201)
  })

  test('a SCOREKEEPER cannot form or dissolve a pair', async ({ request, baseURL }) => {
    const { sessionId, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 3)
    const [playerA, playerB, playerC] = sessionPlayerIds

    // Form a real pair as the operator first, so there is something for the
    // scorekeeper to (fail to) dissolve below.
    const pairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: playerA, sessionPlayerBId: playerB },
    })
    const pairId = (await pairResponse.json()).pair.id

    // One scorekeeper login covers both checks below: the permission gate
    // rejects a formPair/dissolvePair attempt before any domain validation
    // runs, so which players are named in the blocked form attempt is
    // immaterial (playerC is unpaired and checked-in; only the 403 matters).
    await loginAsScorekeeper(request, 'pairs')

    const formResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: playerA, sessionPlayerBId: playerC },
    })
    expect(formResponse.status()).toBe(403)

    // Explicit Origin header so a 403 here can only be the permission check
    // under test, not Astro's CSRF guard (same reasoning as the test above).
    const dissolveResponse = await request.delete(`/api/pickleball/sessions/${sessionId}/pairs/${pairId}`, {
      headers: { Origin: baseURL },
    })
    expect(dissolveResponse.status()).toBe(403)
  })
})

test.describe('Pickleball fixed pairs: queue a pair, not a player', () => {
  test('joining the queue as a pair creates two queue_entries rows sharing one session_pair_id and queued_at', async ({ request }) => {
    const { sessionId, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 2)
    const [playerA, playerB] = sessionPlayerIds
    const pair = await formPair(request, sessionId, playerA, playerB)

    // Joining names only ONE member (playerA) -- the DO must resolve the
    // pair from that member and queue BOTH, not just the one named.
    const joinResponse = await request.post(`/api/pickleball/sessions/${sessionId}/queue`, {
      data: { sessionPlayerId: playerA },
    })
    expect(joinResponse.status()).toBe(201)

    const queueResponse = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const queue = (await queueResponse.json()).queue
    const rowA = queue.find((e) => e.sessionPlayerId === playerA)
    const rowB = queue.find((e) => e.sessionPlayerId === playerB)

    expect(rowA).toBeTruthy()
    expect(rowB).toBeTruthy()
    expect(rowA.status).toBe('QUEUED')
    expect(rowB.status).toBe('QUEUED')
    expect(rowA.sessionPairId).toBe(pair.id)
    expect(rowB.sessionPairId).toBe(pair.id)
    expect(rowA.queuedAt).toBe(rowB.queuedAt)
  })

  test('joining the queue as an unpaired player is refused with a domain error naming the reason', async ({ request }) => {
    const { sessionId, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 1)
    const [playerA] = sessionPlayerIds

    const joinResponse = await request.post(`/api/pickleball/sessions/${sessionId}/queue`, {
      data: { sessionPlayerId: playerA },
    })
    expect(joinResponse.status()).toBe(409)
    expect((await joinResponse.json()).error).toContain('pair')
  })

  test('leaving the queue as a pair closes both rows together', async ({ request }) => {
    const { sessionId, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 2)
    const [playerA, playerB] = sessionPlayerIds
    await formPair(request, sessionId, playerA, playerB)

    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId: playerA } })

    // Leave named by the OTHER member (playerB) -- proves this closes the
    // whole pair's rows, not merely "the row for the id you passed."
    const leaveResponse = await request.post(`/api/pickleball/sessions/${sessionId}/queue/leave`, {
      data: { sessionPlayerId: playerB },
    })
    expect(leaveResponse.status()).toBe(200)

    const queueResponse = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const queue = (await queueResponse.json()).queue
    expect(queue.find((e) => e.sessionPlayerId === playerA)).toBeUndefined()
    expect(queue.find((e) => e.sessionPlayerId === playerB)).toBeUndefined()
  })

  test('dissolving a queued pair closes its open queue entries', async ({ request, baseURL }) => {
    const { sessionId, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 2)
    const [playerA, playerB] = sessionPlayerIds
    const pair = await formPair(request, sessionId, playerA, playerB)

    const joinResponse = await request.post(`/api/pickleball/sessions/${sessionId}/queue`, {
      data: { sessionPlayerId: playerA },
    })
    expect(joinResponse.status()).toBe(201)

    // Explicit Origin header — Astro's CSRF check rejects a bodyless
    // request.delete() with none (same pattern as the form/dissolve tests).
    const dissolveResponse = await request.delete(`/api/pickleball/sessions/${sessionId}/pairs/${pair.id}`, {
      headers: { Origin: baseURL },
    })
    expect(dissolveResponse.status()).toBe(200)

    const queueResponse = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const queue = (await queueResponse.json()).queue
    expect(queue.find((e) => e.sessionPlayerId === playerA)).toBeUndefined()
    expect(queue.find((e) => e.sessionPlayerId === playerB)).toBeUndefined()
  })
})

test.describe('Pickleball fixed pairs: assign a court to two pairs', () => {
  test('assigns a court to two eligible pairs, creating two FIXED_PAIR teams that each hold one pair', async ({ request }) => {
    const { sessionId, sessionCourts, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 4, 1)
    const [p1, p2, p3, p4] = sessionPlayerIds
    await formAndQueuePair(request, sessionId, p1, p2)
    await formAndQueuePair(request, sessionId, p3, p4)

    const assignResponse = await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, {
      data: { sessionCourtId: sessionCourts[0].id },
    })
    expect(assignResponse.status()).toBe(200)
    const body = await assignResponse.json()
    expect(body.court.status).toBe('ASSIGNED')

    const teamAIds = body.teamA.players.map((p) => p.sessionPlayerId).sort()
    const teamBIds = body.teamB.players.map((p) => p.sessionPlayerId).sort()
    expect(teamAIds).toHaveLength(2)
    expect(teamBIds).toHaveLength(2)

    // Each team must be exactly one of the two FORMED pairs -- never a mix
    // of members from both pairs, which would mean a pair got split.
    const expectedPairs = [[p1, p2].sort(), [p3, p4].sort()]
    expect(expectedPairs).toContainEqual(teamAIds)
    expect(expectedPairs).toContainEqual(teamBIds)
    expect(teamAIds).not.toEqual(teamBIds)

    // Verify the persisted teams/team_members rows directly, not just the
    // command's response -- kind must be FIXED_PAIR (never AD_HOC, the
    // open-play default), and each team's real roster must match one pair.
    const teamsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourts[0].id}/teams`)
    const teams = (await teamsResponse.json()).teams
    expect(teams).toHaveLength(2)
    for (const team of teams) {
      expect(team.kind).toBe('FIXED_PAIR')
      const memberIds = team.members.map((m) => m.sessionPlayerId).sort()
      expect(expectedPairs).toContainEqual(memberIds)
    }
  })

  test('rejects assignment when fewer than two eligible pairs are queued', async ({ request }) => {
    const { sessionId, sessionCourts, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 2, 1)
    const [p1, p2] = sessionPlayerIds
    await formAndQueuePair(request, sessionId, p1, p2)

    const assignResponse = await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, {
      data: { sessionCourtId: sessionCourts[0].id },
    })
    expect(assignResponse.status()).toBe(409)
    expect((await assignResponse.json()).error).toContain('pair')
  })

  // Mirrors pickleball-queue.spec.js's CONCURRENCY test: two courts, two
  // simultaneous assign calls, exactly enough eligible pairs (4) for two
  // assignments with none left over -- if the DO's serialization were broken
  // (or if this path read eligible pairs outside the serialized handler, or
  // cached them), the same pair could be selected onto both courts and this
  // test would catch it via the overlap/size assertions below. A flaky
  // result here is a signal to investigate the DO, not to retry.
  test('CONCURRENCY: two simultaneous assignments to two different courts never seat the same pair twice', async ({ request }) => {
    const { sessionId, sessionCourts, sessionPlayerIds } = await createFixedPairsSessionWithCheckedInPlayers(request, 8, 2)
    expect(sessionCourts.length).toBeGreaterThanOrEqual(2)

    for (let i = 0; i < sessionPlayerIds.length; i += 2) {
      await formAndQueuePair(request, sessionId, sessionPlayerIds[i], sessionPlayerIds[i + 1])
    }

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
})
