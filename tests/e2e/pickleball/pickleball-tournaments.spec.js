import { test, expect } from '@playwright/test'

// A tournament is a FIXED_PAIRS session carrying `tournamentFormat` -- NOT a
// third session type (migration 0014's header, and this phase's own docs).
// These helpers therefore reuse the ordinary session-creation and
// fixed-pairs-formation flow, only adding `tournamentFormat` to the create
// call.

async function createTournamentSession(request, overrides = {}, courtCount = 0) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const venueResponse = await request.post('/api/pickleball/venues', {
    data: { name: `Tournament Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
  })
  expect(venueResponse.ok()).toBe(true)
  const venueId = (await venueResponse.json()).venue.id

  // Courts must exist on the venue BEFORE the session so that session
  // creation's auto-provisioning (seedSessionCourtsFromVenue) has something
  // to seed session_courts rows from -- same reasoning as
  // pickleball-fixed-pairs.spec.js's own setup helper.
  for (let i = 0; i < courtCount; i += 1) {
    const courtResponse = await request.post('/api/pickleball/courts', { data: { venueId, name: `Court ${i + 1}` } })
    expect(courtResponse.ok()).toBe(true)
  }

  return request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `Tournament Session ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sessionType: 'FIXED_PAIRS',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-08T18:00:00.000Z',
      scheduledEnd: '2026-09-08T22:00:00.000Z',
      tournamentFormat: 'ROUND_ROBIN',
      ...overrides,
    },
  })
}

// Creates a live ROUND_ROBIN tournament with `pairCount` formed (but not yet
// entered) pairs, each pair's two members freshly registered and checked in.
async function createLiveTournamentWithPairs(request, pairCount, courtCount = 0) {
  const sessionResponse = await createTournamentSession(request, {}, courtCount)
  expect(sessionResponse.status()).toBe(201)
  const sessionId = (await sessionResponse.json()).session.id

  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  const sessionCourts = courtCount
    ? (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts
    : []

  const pairs = []
  for (let i = 0; i < pairCount; i += 1) {
    const sessionPlayerIds = []
    const playerIds = []
    for (let member = 0; member < 2; member += 1) {
      const playerResponse = await request.post('/api/pickleball/players', {
        data: { displayName: `Tourney Player ${Date.now()}-${i}-${member}-${Math.random().toString(36).slice(2)}` },
      })
      const playerId = (await playerResponse.json()).player.id
      const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
      const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
      await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
      sessionPlayerIds.push(sessionPlayerId)
      playerIds.push(playerId)
    }

    const pairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: sessionPlayerIds[0], sessionPlayerBId: sessionPlayerIds[1] },
    })
    expect(pairResponse.status()).toBe(201)
    const pair = (await pairResponse.json()).pair
    pairs.push({ ...pair, playerIds })
  }

  return { sessionId, sessionCourts, pairs }
}

// Game-lifecycle helpers, modeled directly on pickleball-fixed-pairs.spec.js's
// own helpers of the same names -- needed here (rather than imported)
// because that file's helpers are module-local, not exported.
async function startGame(request, sessionId, sessionCourtId, assignBody, servingTeam) {
  return request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
    data: {
      sessionCourtId,
      servingTeam,
      teamAStartingServerSessionPlayerId: assignBody.teamA.players[0].sessionPlayerId,
      teamBStartingServerSessionPlayerId: assignBody.teamB.players[0].sessionPlayerId,
    },
  })
}

function assignCourt(request, sessionId, sessionCourtId) {
  return request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })
}

function enterPair(request, sessionId, sessionPairId) {
  return request.post(`/api/pickleball/sessions/${sessionId}/tournament/entrants`, { data: { sessionPairId } })
}

function lockBracket(request, sessionId) {
  return request.post(`/api/pickleball/sessions/${sessionId}/tournament/lock`, { data: {} })
}

async function enterAllPairs(request, sessionId, pairs) {
  for (const pair of pairs) {
    const response = await enterPair(request, sessionId, pair.id)
    expect(response.status()).toBe(201)
  }
}

async function loginAsScorekeeper(request, label) {
  const sessionInfoResponse = await request.get('/api/pickleball/auth/session')
  const { activeOrgId } = await sessionInfoResponse.json()
  const email = `tourney-scorekeeper-${label}-${Date.now()}@example.com`
  await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
    data: { invitedEmail: email, role: 'SCOREKEEPER' },
  })
  await request.post('/api/pickleball/auth/test-login', { data: { email } })
}

async function getFixtures(request, sessionId) {
  const response = await request.get(`/api/pickleball/sessions/${sessionId}/tournament/fixtures`)
  expect(response.status()).toBe(200)
  return (await response.json()).fixtures
}

async function getEntrants(request, sessionId) {
  const response = await request.get(`/api/pickleball/sessions/${sessionId}/tournament/entrants`)
  expect(response.status()).toBe(200)
  return (await response.json()).entrants
}

async function getQueue(request, sessionId) {
  const response = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
  expect(response.status()).toBe(200)
  return (await response.json()).queue
}

test.describe('Pickleball tournaments: session creation', () => {
  test('creates a FIXED_PAIRS session with tournamentFormat ROUND_ROBIN', async ({ request }) => {
    const response = await createTournamentSession(request)
    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.session.sessionType).toBe('FIXED_PAIRS')
    expect(body.session.tournamentFormat).toBe('ROUND_ROBIN')
  })

  test('rejects tournamentFormat on an OPEN_PLAY session with a domain error naming the reason', async ({ request }) => {
    const response = await createTournamentSession(request, { sessionType: 'OPEN_PLAY' })
    expect(response.status()).toBe(400)
    expect((await response.json()).error).toContain('Fixed Pairs')
  })

  test('rejects a tournament created against a SINGLES ruleset -- entrants are pairs', async ({ request }) => {
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
    const rulesetResponse = await request.post('/api/pickleball/scoring-rulesets', {
      data: { name: `Tourney Singles Reject Ruleset ${Date.now()}`, targetScore: 11, winBy: 2, format: 'SINGLES' },
    })
    expect(rulesetResponse.status()).toBe(201)
    const singlesRulesetId = (await rulesetResponse.json()).ruleset.id

    const response = await createTournamentSession(request, { scoringRulesetId: singlesRulesetId })
    expect(response.status()).toBe(400)
    expect((await response.json()).error).toContain('doubles')
  })
})

test.describe('Pickleball tournaments: enter pairs', () => {
  test('entering a pair returns 201; entering the same pair twice returns a domain error, not a 500', async ({ request }) => {
    const { sessionId, pairs } = await createLiveTournamentWithPairs(request, 1)

    const firstResponse = await enterPair(request, sessionId, pairs[0].id)
    expect(firstResponse.status()).toBe(201)
    expect((await firstResponse.json()).entrant.sessionPairId).toBe(pairs[0].id)

    const secondResponse = await enterPair(request, sessionId, pairs[0].id)
    expect(secondResponse.status()).toBe(409)
    expect((await secondResponse.json()).error).toBe('This pair is already entered in the tournament.')
  })

  test('entering a pair after the bracket is locked is refused', async ({ request }) => {
    const { sessionId, pairs } = await createLiveTournamentWithPairs(request, 3)
    await enterAllPairs(request, sessionId, pairs)

    const lockResponse = await lockBracket(request, sessionId)
    expect(lockResponse.status()).toBe(200)

    const enterAfterLockResponse = await enterPair(request, sessionId, pairs[0].id)
    expect(enterAfterLockResponse.status()).toBe(409)
    expect((await enterAfterLockResponse.json()).error).toBe('The bracket is locked; entrants cannot be changed.')
  })
})

test.describe('Pickleball tournaments: lock the bracket', () => {
  test('locking with fewer than 2 entrants is refused', async ({ request }) => {
    const { sessionId, pairs } = await createLiveTournamentWithPairs(request, 1)
    await enterAllPairs(request, sessionId, pairs)

    const lockResponse = await lockBracket(request, sessionId)
    expect(lockResponse.status()).toBe(409)
    expect((await lockResponse.json()).error).toBe('At least 2 entrants are required to lock the bracket.')
  })

  // n = 4 -> n(n-1)/2 = 6 fixtures. Asserting the fixture COUNT and that
  // seeds are exactly 1..n with no gaps (not merely "some fixtures exist" or
  // "some entrant has a seed") is deliberate -- a lock that silently
  // generated nothing, or seeded only some entrants, would pass a weaker
  // "toBeTruthy" check.
  test('locking generates n(n-1)/2 fixtures, assigns seeds 1..n, and sets bracket_locked_at', async ({ request }) => {
    const { sessionId, pairs } = await createLiveTournamentWithPairs(request, 4)
    await enterAllPairs(request, sessionId, pairs)

    const lockResponse = await lockBracket(request, sessionId)
    expect(lockResponse.status()).toBe(200)
    const lockBody = await lockResponse.json()
    expect(lockBody.fixtureCount).toBe(6)

    const fixturesResponse = await request.get(`/api/pickleball/sessions/${sessionId}/tournament/fixtures`)
    expect(fixturesResponse.status()).toBe(200)
    const fixtures = (await fixturesResponse.json()).fixtures
    expect(fixtures).toHaveLength(6)

    const entrantsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/tournament/entrants`)
    const entrants = (await entrantsResponse.json()).entrants
    const seeds = entrants.map((entrant) => entrant.seed).sort((a, b) => a - b)
    expect(seeds).toEqual([1, 2, 3, 4])

    const sessionsResponse = await request.get('/api/pickleball/sessions')
    const sessions = (await sessionsResponse.json()).sessions
    const lockedSession = sessions.find((s) => s.id === sessionId)
    expect(lockedSession.bracketLockedAt).toBeTruthy()
  })

  // Seeds are frozen the moment the bracket locks (spec §3.2) -- locking
  // twice must never re-seed or regenerate fixtures.
  test('locking twice is refused -- seeds are frozen', async ({ request }) => {
    const { sessionId, pairs } = await createLiveTournamentWithPairs(request, 3)
    await enterAllPairs(request, sessionId, pairs)

    const firstLockResponse = await lockBracket(request, sessionId)
    expect(firstLockResponse.status()).toBe(200)

    const secondLockResponse = await lockBracket(request, sessionId)
    expect(secondLockResponse.status()).toBe(409)
    expect((await secondLockResponse.json()).error).toBe('The bracket is already locked.')

    // Fixture count is unchanged by the second (refused) attempt -- 3(3-1)/2 = 3.
    const fixturesResponse = await request.get(`/api/pickleball/sessions/${sessionId}/tournament/fixtures`)
    expect((await fixturesResponse.json()).fixtures).toHaveLength(3)
  })
})

test.describe('Pickleball tournaments: permissions', () => {
  test('a SCOREKEEPER can neither enter a pair nor lock the bracket', async ({ request }) => {
    const { sessionId, pairs } = await createLiveTournamentWithPairs(request, 2)

    await loginAsScorekeeper(request, 'tournament')

    const enterResponse = await enterPair(request, sessionId, pairs[0].id)
    expect(enterResponse.status()).toBe(403)

    const lockResponse = await lockBracket(request, sessionId)
    expect(lockResponse.status()).toBe(403)
  })
})

test.describe('Pickleball tournaments: assign a court from the fixture list', () => {
  test('assigns the lowest round/position playable fixture, stamping two FIXED_PAIR teams with session_pair_id; the fixture moves to IN_PROGRESS with its game_id once the game starts', async ({ request }) => {
    const { sessionId, sessionCourts, pairs } = await createLiveTournamentWithPairs(request, 4, 1)
    await enterAllPairs(request, sessionId, pairs)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const fixtures = await getFixtures(request, sessionId)
    const entrants = await getEntrants(request, sessionId)
    const pairIdByEntrantId = new Map(entrants.map((entrant) => [entrant.id, entrant.sessionPairId]))

    // Fixtures come back ordered by round then position (listFixtures'
    // ORDER BY) -- fixtures[0] IS "the lowest round then position" fixture.
    const target = fixtures[0]
    const expectedPairA = pairs.find((p) => p.id === pairIdByEntrantId.get(target.entrantAId))
    const expectedPairB = pairs.find((p) => p.id === pairIdByEntrantId.get(target.entrantBId))
    expect(expectedPairA).toBeTruthy()
    expect(expectedPairB).toBeTruthy()

    const assignResponse = await assignCourt(request, sessionId, sessionCourts[0].id)
    expect(assignResponse.status()).toBe(200)
    const assignBody = await assignResponse.json()
    expect(assignBody.court.status).toBe('ASSIGNED')

    const teamAIds = assignBody.teamA.players.map((p) => p.sessionPlayerId).sort()
    const teamBIds = assignBody.teamB.players.map((p) => p.sessionPlayerId).sort()
    expect(teamAIds).toEqual([expectedPairA.sessionPlayerAId, expectedPairA.sessionPlayerBId].sort())
    expect(teamBIds).toEqual([expectedPairB.sessionPlayerAId, expectedPairB.sessionPlayerBId].sort())

    // Both teams are FIXED_PAIR (never AD_HOC) -- GET .../teams doesn't
    // expose session_pair_id, so that half is verified via the queue below,
    // same as pickleball-fixed-pairs.spec.js's own "shares one
    // session_pair_id" test does for the ordinary (non-tournament) case.
    const teamsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourts[0].id}/teams`)
    const teams = (await teamsResponse.json()).teams
    expect(teams).toHaveLength(2)
    for (const team of teams) expect(team.kind).toBe('FIXED_PAIR')

    const queueAfterAssign = await getQueue(request, sessionId)
    const assignedRows = queueAfterAssign.filter((entry) => entry.status === 'ASSIGNED')
    expect(assignedRows).toHaveLength(4)
    expect(assignedRows.filter((entry) => entry.sessionPairId === expectedPairA.id)).toHaveLength(2)
    expect(assignedRows.filter((entry) => entry.sessionPairId === expectedPairB.id)).toHaveLength(2)

    // Assigning a COURT is not the same as STARTING a game -- the fixture
    // stays READY, with no game_id, until startGame actually creates one.
    const fixturesAfterAssign = await getFixtures(request, sessionId)
    const targetAfterAssign = fixturesAfterAssign.find((f) => f.id === target.id)
    expect(targetAfterAssign.status).toBe('READY')
    expect(targetAfterAssign.gameId).toBeFalsy()

    const startResponse = await startGame(request, sessionId, sessionCourts[0].id, assignBody, 'A')
    expect(startResponse.status()).toBe(201)
    const gameId = (await startResponse.json()).game.id

    const fixturesAfterStart = await getFixtures(request, sessionId)
    const targetAfterStart = fixturesAfterStart.find((f) => f.id === target.id)
    expect(targetAfterStart.status).toBe('IN_PROGRESS')
    expect(targetAfterStart.gameId).toBe(gameId)
  })

  test('assigning a second court seats the next fixture whose entrants are not already playing', async ({ request }) => {
    const { sessionId, sessionCourts, pairs } = await createLiveTournamentWithPairs(request, 4, 2)
    await enterAllPairs(request, sessionId, pairs)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const firstAssign = await assignCourt(request, sessionId, sessionCourts[0].id)
    expect(firstAssign.status()).toBe(200)
    const firstBody = await firstAssign.json()
    const firstPlayers = [...firstBody.teamA.players, ...firstBody.teamB.players].map((p) => p.sessionPlayerId)

    const secondAssign = await assignCourt(request, sessionId, sessionCourts[1].id)
    expect(secondAssign.status()).toBe(200)
    const secondBody = await secondAssign.json()
    const secondPlayers = [...secondBody.teamA.players, ...secondBody.teamB.players].map((p) => p.sessionPlayerId)

    expect(secondPlayers.filter((id) => firstPlayers.includes(id))).toEqual([])

    // With exactly 4 entrants, round-robin's own construction guarantees
    // round 1 pairs every entrant disjointly across its 2 fixtures -- so
    // both assignments together must cover every one of the 8 registered
    // players exactly once, with none left over and none repeated.
    const allPlayerIds = pairs.flatMap((p) => [p.sessionPlayerAId, p.sessionPlayerBId])
    expect(new Set([...firstPlayers, ...secondPlayers])).toEqual(new Set(allPlayerIds))
  })

  // With exactly 3 entrants, round-robin generates 3 fixtures (X-Y, X-Z,
  // Y-Z), each in ITS OWN round (one entrant always sits out). Whichever
  // fixture is seated first consumes 2 of the 3 entrants; BOTH remaining
  // fixtures then each contain exactly one of those two busy entrants plus
  // the one still-free entrant -- never two free entrants together, so
  // neither remaining fixture can ever be played until a court is released.
  // This holds regardless of which fixture the seeding tie-break picks
  // first, so the test does not need to know or assert which one that is.
  test('every remaining fixture blocked by an entrant already on court -- assignment fails cleanly, not a crash, and seats no one twice', async ({ request }) => {
    const { sessionId, sessionCourts, pairs } = await createLiveTournamentWithPairs(request, 3, 2)
    await enterAllPairs(request, sessionId, pairs)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const firstAssign = await assignCourt(request, sessionId, sessionCourts[0].id)
    expect(firstAssign.status()).toBe(200)

    const secondAssign = await assignCourt(request, sessionId, sessionCourts[1].id)
    expect(secondAssign.status()).toBe(409)
    expect((await secondAssign.json()).error).toContain('court')

    // No one was double-seated: still exactly 4 ASSIGNED queue rows (the
    // FIRST assignment's two pairs), not 8, and the second court is still
    // untouched.
    const queueAfter = await getQueue(request, sessionId)
    expect(queueAfter.filter((entry) => entry.status === 'ASSIGNED')).toHaveLength(4)

    const courtsAfter = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts
    const secondCourtAfter = courtsAfter.find((c) => c.id === sessionCourts[1].id)
    expect(secondCourtAfter.status).toBe('AVAILABLE')
  })

  // Mirrors pickleball-fixed-pairs.spec.js's own CONCURRENCY test: two
  // courts, two simultaneous assign calls, exactly enough entrants (4) for
  // two disjoint assignments with none left over -- if the DO's
  // serialization were broken (or this path read fixtures/entrants-in-play
  // outside the serialized handler, or cached them), the same entrant could
  // be selected onto both courts and this test would catch it via the
  // overlap/size assertions below.
  test('CONCURRENCY: two simultaneous assignments to two different courts never seat the same entrant twice', async ({ request }) => {
    const { sessionId, sessionCourts, pairs } = await createLiveTournamentWithPairs(request, 4, 2)
    await enterAllPairs(request, sessionId, pairs)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const [firstResponse, secondResponse] = await Promise.all([
      assignCourt(request, sessionId, sessionCourts[0].id),
      assignCourt(request, sessionId, sessionCourts[1].id),
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
    const allPlayerIds = pairs.flatMap((p) => [p.sessionPlayerAId, p.sessionPlayerBId])
    expect(new Set([...firstPlayers, ...secondPlayers])).toEqual(new Set(allPlayerIds))
  })

  test('assigning a court before the bracket is locked is refused', async ({ request }) => {
    const { sessionId, sessionCourts, pairs } = await createLiveTournamentWithPairs(request, 2, 1)
    await enterAllPairs(request, sessionId, pairs)
    // Deliberately never locked.

    const assignResponse = await assignCourt(request, sessionId, sessionCourts[0].id)
    expect(assignResponse.status()).toBe(409)
    expect((await assignResponse.json()).error).toBe('Lock the bracket before assigning courts.')
  })
})
