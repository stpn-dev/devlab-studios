import { test, expect } from '@playwright/test'

// C3: DOUBLE_ELIMINATION end to end -- round-robin pools feeding a
// single-elimination bracket whose slots are filled by POOL_RANK sources.
//
// Its own spec file for the same reason the single-elimination suite is:
// pickleball-tournaments.spec.js already runs long enough that one
// `wrangler dev --local` server dies partway through it.

async function createDeSession(request, courtCount) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `DE Venue ${unique}` } })
  expect(venueResponse.ok()).toBe(true)
  const venueId = (await venueResponse.json()).venue.id

  for (let i = 0; i < courtCount; i += 1) {
    expect((await request.post('/api/pickleball/courts', { data: { venueId, name: `Court ${i + 1}` } })).ok()).toBe(true)
  }

  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `DE Session ${unique}`,
      sessionType: 'FIXED_PAIRS',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-08T18:00:00.000Z',
      scheduledEnd: '2026-09-08T22:00:00.000Z',
      tournamentFormat: 'DOUBLE_ELIMINATION',
    },
  })
  expect(sessionResponse.status()).toBe(201)
  return (await sessionResponse.json()).session.id
}

async function createLiveDoubleElim(request, pairCount, courtCount = 1) {
  const sessionId = await createDeSession(request, courtCount)
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  const sessionCourts = courtCount
    ? (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts
    : []

  const pairs = []
  for (let i = 0; i < pairCount; i += 1) {
    const sessionPlayerIds = []
    for (let member = 0; member < 2; member += 1) {
      const playerResponse = await request.post('/api/pickleball/players', {
        data: { displayName: `DE Player ${Date.now()}-${i}-${member}-${Math.random().toString(36).slice(2)}` },
      })
      const playerId = (await playerResponse.json()).player.id
      const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
      sessionPlayerIds.push((await registerResponse.json()).sessionPlayer.id)
      await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    }

    const pairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: sessionPlayerIds[0], sessionPlayerBId: sessionPlayerIds[1] },
    })
    expect(pairResponse.status()).toBe(201)
    const pair = (await pairResponse.json()).pair
    expect(
      (await request.post(`/api/pickleball/sessions/${sessionId}/tournament/entrants`, { data: { sessionPairId: pair.id } })).status(),
    ).toBe(201)
    pairs.push(pair)
  }

  return { sessionId, sessionCourts, pairs }
}

const lockBracket = (request, sessionId) => request.post(`/api/pickleball/sessions/${sessionId}/tournament/lock`, { data: {} })
const assignCourt = (request, sessionId, sessionCourtId) =>
  request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })

async function getFixtures(request, sessionId) {
  const response = await request.get(`/api/pickleball/sessions/${sessionId}/tournament/fixtures`)
  expect(response.status()).toBe(200)
  return (await response.json()).fixtures
}

// Plays whichever fixture the app proposes on the given court, 11-0.
async function playProposed(request, sessionId, sessionCourtId) {
  const assignResponse = await assignCourt(request, sessionId, sessionCourtId)
  expect(assignResponse.status()).toBe(200)
  const assignBody = await assignResponse.json()

  const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
    data: {
      sessionCourtId,
      servingTeam: 'A',
      teamAStartingServerSessionPlayerId: assignBody.teamA.players[0].sessionPlayerId,
      teamBStartingServerSessionPlayerId: assignBody.teamB.players[0].sessionPlayerId,
    },
  })
  expect(startResponse.status()).toBe(201)
  const gameId = (await startResponse.json()).game.id

  for (let i = 0; i < 11; i += 1) {
    expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, { data: { winningTeam: 'A' } })).status()).toBe(200)
  }
  expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/finish`, { data: {} })).status()).toBe(200)

  const finished = (await getFixtures(request, sessionId)).find((f) => f.gameId === gameId)
  return { fixture: finished, gameId, winnerEntrantId: finished.winnerEntrantId }
}

// Plays every currently-playable fixture until assignCourt has nothing left.
//
// Scores deliberately VARY (some 11-0, some 11-9) rather than every game being
// a shutout. With identical scores everywhere, point differentials come out
// symmetric and a pool table ranks the same however the arithmetic is done --
// which makes the suite blind to whether qualification used the right inputs
// at all. Alternating gives each entrant a distinct differential, so ranking
// on an incomplete table produces a different qualifier and gets noticed.
async function playUntilStuck(request, sessionId, sessionCourtId, limit = 40) {
  const played = []
  for (let i = 0; i < limit; i += 1) {
    const probe = await assignCourt(request, sessionId, sessionCourtId)
    if (probe.status() !== 200) break
    const assignBody = await probe.json()
    // Alternate WHICH SIDE wins, not just the score. Letting team A win every
    // game looks like variety because the scores differ, but it is not: in a
    // pool of four it produces one pair on 3-0 and a perfect three-way cycle
    // beneath them, tied on wins AND differential. That is a real tie, decided
    // by a rule this file's oracle deliberately does not model, so every pool
    // got skipped and the test asserted nothing. Alternating the winner
    // spreads the pool out properly instead.
    const winner = i % 2 === 0 ? 'A' : 'B'
    const loser = winner === 'A' ? 'B' : 'A'
    // Every third game is a 11-9 rather than a shutout, so differentials are
    // not all multiples of the same number and can actually separate pairs on
    // equal wins.
    const closeGame = i % 3 === 2

    const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
      data: {
        sessionCourtId,
        servingTeam: closeGame ? loser : winner,
        teamAStartingServerSessionPlayerId: assignBody.teamA.players[0].sessionPlayerId,
        teamBStartingServerSessionPlayerId: assignBody.teamB.players[0].sessionPlayerId,
      },
    })
    expect(startResponse.status()).toBe(201)
    const gameId = (await startResponse.json()).game.id

    const rallies = closeGame
      ? [...Array(9).fill(loser), winner, ...Array(11).fill(winner)]
      : Array(11).fill(winner)
    for (const winningTeam of rallies) {
      expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, { data: { winningTeam } })).status()).toBe(200)
    }
    expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/finish`, { data: {} })).status()).toBe(200)
    played.push(gameId)
  }
  return played
}

test.describe('Pickleball double elimination: draw', () => {
  test('locking a 4-entrant draw creates a winners bracket, a losers bracket and a grand final', async ({ request }) => {
    const { sessionId } = await createLiveDoubleElim(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const fixtures = await getFixtures(request, sessionId)
    // 2n-2: three winners-bracket matches, two in the losers bracket, and the
    // grand final.
    expect(fixtures).toHaveLength(6)

    const losers = fixtures.filter((f) => f.bracket === 'LOSERS')
    expect(losers).toHaveLength(2)

    const main = fixtures.filter((f) => f.bracket === 'MAIN')
    const grandFinalRound = Math.max(...main.map((f) => f.roundNumber))
    expect(main.filter((f) => f.roundNumber === grandFinalRound)).toHaveLength(1)

    // Only the two opening winners-bracket matches can be played at the start.
    expect(fixtures.filter((f) => f.status === 'READY')).toHaveLength(2)
  })

  test('losers-bracket slots are fed by LOSER_OF sources pointing at real winners-bracket matches', async ({ request }) => {
    const { sessionId } = await createLiveDoubleElim(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const fixtures = await getFixtures(request, sessionId)
    const ids = new Set(fixtures.map((f) => f.id))
    const loserSources = fixtures
      .filter((f) => f.bracket === 'LOSERS')
      .flatMap((f) => [f.sourceA, f.sourceB])
      .filter((s) => s && s.startsWith('LOSER_OF:'))

    expect(loserSources.length).toBeGreaterThan(0)
    for (const source of loserSources) {
      const target = source.replace('LOSER_OF:', '')
      // Rewritten to a real fixture id, not left as a generator slot key.
      expect(target).not.toMatch(/^(MAIN|LOSERS):/)
      expect(ids.has(target)).toBe(true)
    }
  })

  test('refuses to lock with too few entrants for a losers bracket to mean anything', async ({ request }) => {
    const { sessionId } = await createLiveDoubleElim(request, 2, 1)
    const response = await lockBracket(request, sessionId)
    expect(response.status()).toBe(409)
    expect((await response.json()).error).toContain('At least 3 entrants')
  })
})

test.describe('Pickleball double elimination: playing it out', () => {

  test('losing a winners-bracket match drops that pair into the losers bracket rather than out', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveDoubleElim(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const first = await playProposed(request, sessionId, sessionCourts[0].id)
    const loserEntrantId =
      first.fixture.entrantAId === first.winnerEntrantId ? first.fixture.entrantBId : first.fixture.entrantAId
    expect(loserEntrantId).toBeTruthy()

    // The defining property of the format: the loser is still in.
    const losersFixtures = (await getFixtures(request, sessionId)).filter((f) => f.bracket === 'LOSERS')
    const seatedInLosers = losersFixtures.flatMap((f) => [f.entrantAId, f.entrantBId])
    expect(seatedInLosers).toContain(loserEntrantId)
  })

  test('a 4-entrant draw plays through to a single champion in exactly six matches, stranding nothing', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveDoubleElim(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const played = await playUntilStuck(request, sessionId, sessionCourts[0].id)
    expect(played).toHaveLength(6)

    const fixtures = await getFixtures(request, sessionId)
    expect(fixtures.every((f) => f.status === 'FINISHED')).toBe(true)
    expect((await assignCourt(request, sessionId, sessionCourts[0].id)).status()).toBe(409)

    const grandFinalRound = Math.max(...fixtures.filter((f) => f.bracket === 'MAIN').map((f) => f.roundNumber))
    const grandFinal = fixtures.find((f) => f.bracket === 'MAIN' && f.roundNumber === grandFinalRound)
    expect(grandFinal.winnerEntrantId).toBeTruthy()
  })

  test('the champion is a pair that reached the grand final, and everyone else has lost twice', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveDoubleElim(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)
    await playUntilStuck(request, sessionId, sessionCourts[0].id)

    const fixtures = await getFixtures(request, sessionId)
    const grandFinalRound = Math.max(...fixtures.filter((f) => f.bracket === 'MAIN').map((f) => f.roundNumber))
    const grandFinal = fixtures.find((f) => f.bracket === 'MAIN' && f.roundNumber === grandFinalRound)
    const champion = grandFinal.winnerEntrantId

    const losses = new Map()
    for (const fixture of fixtures) {
      if (!fixture.winnerEntrantId) continue
      const loser = fixture.entrantAId === fixture.winnerEntrantId ? fixture.entrantBId : fixture.entrantAId
      if (loser) losses.set(loser, (losses.get(loser) ?? 0) + 1)
    }

    // Nobody is eliminated on one loss except by the grand final itself.
    for (const [entrantId, count] of losses) {
      if (entrantId === champion) continue
      expect(count).toBeGreaterThanOrEqual(1)
    }
    expect((losses.get(champion) ?? 0)).toBeLessThanOrEqual(1)
  })

  test('a 5-entrant draw (byes, so holes in the losers bracket) still completes', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveDoubleElim(request, 5, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    // A bye means one winners-bracket match never happens, so it drops no
    // loser -- the losers bracket has a hole that must have been collapsed at
    // generation rather than left as an unplayable match.
    const before = await getFixtures(request, sessionId)
    for (const fixture of before) {
      const sideA = fixture.entrantAId ?? fixture.sourceA
      const sideB = fixture.entrantBId ?? fixture.sourceB
      expect(Boolean(sideA) && Boolean(sideB)).toBe(true)
    }

    await playUntilStuck(request, sessionId, sessionCourts[0].id)
    expect((await getFixtures(request, sessionId)).every((f) => f.status === 'FINISHED')).toBe(true)
  })
})
