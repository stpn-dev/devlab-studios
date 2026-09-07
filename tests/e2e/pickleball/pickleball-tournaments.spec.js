import { test, expect } from '@playwright/test'

// A tournament is a FIXED_PAIRS session carrying `tournamentFormat` -- NOT a
// third session type (migration 0014's header, and this phase's own docs).
// These helpers therefore reuse the ordinary session-creation and
// fixed-pairs-formation flow, only adding `tournamentFormat` to the create
// call.

async function createTournamentSession(request, overrides = {}) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const venueResponse = await request.post('/api/pickleball/venues', {
    data: { name: `Tournament Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
  })
  expect(venueResponse.ok()).toBe(true)
  const venueId = (await venueResponse.json()).venue.id

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
async function createLiveTournamentWithPairs(request, pairCount) {
  const sessionResponse = await createTournamentSession(request)
  expect(sessionResponse.status()).toBe(201)
  const sessionId = (await sessionResponse.json()).session.id

  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  const pairs = []
  for (let i = 0; i < pairCount; i += 1) {
    const sessionPlayerIds = []
    for (let member = 0; member < 2; member += 1) {
      const playerResponse = await request.post('/api/pickleball/players', {
        data: { displayName: `Tourney Player ${Date.now()}-${i}-${member}-${Math.random().toString(36).slice(2)}` },
      })
      const playerId = (await playerResponse.json()).player.id
      const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
      const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
      await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
      sessionPlayerIds.push(sessionPlayerId)
    }

    const pairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: sessionPlayerIds[0], sessionPlayerBId: sessionPlayerIds[1] },
    })
    expect(pairResponse.status()).toBe(201)
    pairs.push((await pairResponse.json()).pair)
  }

  return { sessionId, pairs }
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
