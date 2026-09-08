import { test, expect } from '@playwright/test'

// C3: POOL_TO_BRACKET end to end -- round-robin pools feeding a
// single-elimination bracket whose slots are filled by POOL_RANK sources.
//
// Its own spec file for the same reason the single-elimination suite is:
// pickleball-tournaments.spec.js already runs long enough that one
// `wrangler dev --local` server dies partway through it.

async function createPoolSession(request, courtCount) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Pool Venue ${unique}` } })
  expect(venueResponse.ok()).toBe(true)
  const venueId = (await venueResponse.json()).venue.id

  for (let i = 0; i < courtCount; i += 1) {
    expect((await request.post('/api/pickleball/courts', { data: { venueId, name: `Court ${i + 1}` } })).ok()).toBe(true)
  }

  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `Pool Session ${unique}`,
      sessionType: 'FIXED_PAIRS',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-08T18:00:00.000Z',
      scheduledEnd: '2026-09-08T22:00:00.000Z',
      tournamentFormat: 'POOL_TO_BRACKET',
    },
  })
  expect(sessionResponse.status()).toBe(201)
  return (await sessionResponse.json()).session.id
}

async function createLivePools(request, pairCount, courtCount = 1) {
  const sessionId = await createPoolSession(request, courtCount)
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
        data: { displayName: `Pool Player ${Date.now()}-${i}-${member}-${Math.random().toString(36).slice(2)}` },
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

// Independent oracle: rank a pool from its FINISHED fixtures and the games
// behind them, the way the product says a pool table works (wins, then point
// differential, then head-to-head). Deliberately recomputed here from raw
// results rather than read from the app, so it can disagree with the app.
function rankPoolFromResults(poolFixtures, scoresByGameId, entrantIds) {
  const stats = new Map(entrantIds.map((id) => [id, { id, wins: 0, diff: 0 }]))

  for (const fixture of poolFixtures) {
    const score = fixture.gameId ? scoresByGameId.get(fixture.gameId) : null
    const winner = fixture.winnerEntrantId
    const loser = winner === fixture.entrantAId ? fixture.entrantBId : fixture.entrantAId
    if (winner && stats.has(winner)) stats.get(winner).wins += 1
    if (score && winner && loser && stats.has(winner) && stats.has(loser)) {
      const margin = Math.abs(score.a - score.b)
      stats.get(winner).diff += margin
      stats.get(loser).diff -= margin
    }
  }

  // Ordered by wins then point differential ONLY. Head-to-head is deliberately
  // not reimplemented here: the app resolves multi-way ties by containment,
  // and a naive pairwise comparison inside a sort is not even transitive for a
  // three-way cycle, so an oracle that tried to match it would just be a
  // second, worse implementation disagreeing with the first. Instead the
  // caller skips any pool where the qualifying cut is an actual tie on these
  // two keys, and asserts on the pools where the answer is unambiguous.
  const ordered = [...stats.values()].sort((x, y) => (y.wins !== x.wins ? y.wins - x.wins : y.diff - x.diff))

  // One tiebreak IS modelled: a straight TWO-way tie, settled by the match
  // those two played against each other. That case is unambiguous and matches
  // the app's containment rule exactly (with a group of two, "beat everyone
  // else in the group" is just "won the head-to-head"). Larger tied groups are
  // left alone -- a three-way cycle has no pairwise answer, and guessing at
  // one would make this oracle a second, worse implementation.
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const [x, y] = [ordered[i], ordered[i + 1]]
    const tiedGroupSize = ordered.filter((row) => row.wins === x.wins && row.diff === x.diff).length
    if (x.wins !== y.wins || x.diff !== y.diff || tiedGroupSize !== 2) continue

    const direct = poolFixtures.find(
      (f) =>
        f.status === 'FINISHED' &&
        ((f.entrantAId === x.id && f.entrantBId === y.id) || (f.entrantAId === y.id && f.entrantBId === x.id)),
    )
    if (direct && direct.winnerEntrantId === y.id) {
      ordered[i] = y
      ordered[i + 1] = x
    }
  }

  return ordered
}

// Whether the qualifying cut (2nd vs 3rd) is one this oracle can actually
// decide: separated on wins or differential, or a clean two-way tie the
// head-to-head above resolves. A larger tied group is decided by a rule this
// oracle deliberately does not model, so that pool proves nothing either way.
function qualifyingCutIsDecisive(ranked) {
  const second = ranked[1]
  const third = ranked[2]
  if (!second || !third) return true
  if (second.wins !== third.wins || second.diff !== third.diff) return true
  return ranked.filter((row) => row.wins === second.wins && row.diff === second.diff).length === 2
}

// Final scores for every game, from the session's game LIST. There is no
// single-game GET route; an earlier version of this helper invented one and
// swallowed the 404, which left every differential silently zero and made the
// oracle below rank on wins alone -- a test quietly measuring less than it
// claimed. Hence the assertions: a missing score fails here rather than
// weakening an assertion somewhere else.
async function getGameScores(request, sessionId, gameIds) {
  const response = await request.get(`/api/pickleball/sessions/${sessionId}/games`)
  expect(response.status()).toBe(200)
  const games = (await response.json()).games

  const scores = new Map()
  for (const gameId of gameIds) {
    const game = games.find((candidate) => candidate.id === gameId)
    expect(game, `game ${gameId} missing from the session game list`).toBeTruthy()
    expect(typeof game.finalScoreA).toBe('number')
    expect(typeof game.finalScoreB).toBe('number')
    scores.set(gameId, { a: game.finalScoreA, b: game.finalScoreB })
  }
  return scores
}

test.describe('Pickleball pools: draw', () => {
  test('locking a 6-entrant pool tournament creates two pools of three plus a 4-slot bracket', async ({ request }) => {
    const { sessionId } = await createLivePools(request, 6, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const fixtures = await getFixtures(request, sessionId)
    const pool = fixtures.filter((f) => f.bracket === 'POOL')
    const main = fixtures.filter((f) => f.bracket === 'MAIN')

    // Two pools of three: 3 round-robin fixtures each.
    expect(pool).toHaveLength(6)
    expect(new Set(pool.map((f) => f.poolLabel))).toEqual(new Set(['A', 'B']))
    // Four qualifiers -> semi-finals plus a final.
    expect(main).toHaveLength(3)

    // Pool play is immediately playable; nothing in the bracket is.
    expect(pool.every((f) => f.status === 'READY')).toBe(true)
    expect(main.every((f) => f.status === 'PENDING')).toBe(true)
  })

  test('bracket slots carry POOL_RANK sources, and the semi-finals are cross-pool', async ({ request }) => {
    const { sessionId } = await createLivePools(request, 6, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const semis = (await getFixtures(request, sessionId)).filter((f) => f.bracket === 'MAIN' && f.roundNumber === 1)
    expect(semis).toHaveLength(2)

    for (const semi of semis) {
      const [tagA, labelA, rankA] = semi.sourceA.split(':')
      const [tagB, labelB, rankB] = semi.sourceB.split(':')
      expect(tagA).toBe('POOL_RANK')
      expect(tagB).toBe('POOL_RANK')
      // A pool winner against a runner-up from the other pool, so nobody
      // replays a pool opponent the moment they qualify.
      expect([rankA, rankB].sort()).toEqual(['1', '2'])
      expect(labelA).not.toBe(labelB)
    }
  })

  test('refuses to lock a pool tournament with too few entrants, naming the minimum', async ({ request }) => {
    const { sessionId } = await createLivePools(request, 3, 1)
    const response = await lockBracket(request, sessionId)
    expect(response.status()).toBe(409)
    expect((await response.json()).error).toContain('At least 4 entrants')
  })
})

test.describe('Pickleball pools: qualification', () => {
  test('no bracket slot is filled until a pool has played its LAST match', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLivePools(request, 6, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    // One match only. Second place in that pool is not knowable yet, so
    // nothing may be seated into the bracket.
    await playProposed(request, sessionId, sessionCourts[0].id)

    const main = (await getFixtures(request, sessionId)).filter((f) => f.bracket === 'MAIN')
    expect(main.every((f) => f.status === 'PENDING')).toBe(true)
    expect(main.every((f) => !f.entrantAId && !f.entrantBId)).toBe(true)
  })

  test('finishing every pool match qualifies exactly two pairs per pool and makes both semi-finals playable', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLivePools(request, 6, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const poolFixtureIds = new Set((await getFixtures(request, sessionId)).filter((f) => f.bracket === 'POOL').map((f) => f.id))
    await playUntilStuck(request, sessionId, sessionCourts[0].id)

    const fixtures = await getFixtures(request, sessionId)
    // Every pool match is done...
    expect(fixtures.filter((f) => poolFixtureIds.has(f.id)).every((f) => f.status === 'FINISHED')).toBe(true)

    // ...and the bracket has been populated from the pool tables.
    const semis = fixtures.filter((f) => f.bracket === 'MAIN' && f.roundNumber === 1)
    const qualifiers = semis.flatMap((f) => [f.entrantAId, f.entrantBId]).filter(Boolean)
    expect(qualifiers).toHaveLength(4)
    expect(new Set(qualifiers).size).toBe(4)
  })

  test('a full pool tournament plays through to a single champion', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLivePools(request, 6, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    await playUntilStuck(request, sessionId, sessionCourts[0].id)

    const fixtures = await getFixtures(request, sessionId)
    expect(fixtures.every((f) => f.status === 'FINISHED')).toBe(true)

    const final = fixtures.find((f) => f.bracket === 'MAIN' && f.roundNumber === 2)
    expect(final.winnerEntrantId).toBeTruthy()
    // 6 pool matches + 2 semis + 1 final.
    expect(fixtures).toHaveLength(9)
    expect((await assignCourt(request, sessionId, sessionCourts[0].id)).status()).toBe(409)
  })

  // The assertion that pins qualification to the ACTUAL pool table rather
  // than to "somebody plausible got through". It is what catches the deciding
  // match being missing from the standings the qualifier ranking is computed
  // from -- the last game of a pool is exactly the one still uncommitted when
  // qualification runs, so it is also exactly the one most likely to be
  // dropped, and the one most likely to decide second place.
  // Eight entrants, so each pool is four and TWO of the four miss out. With
  // pools of three only one pair is excluded, and the cut is too coarse to
  // notice a table computed from the wrong inputs.
  test('the two pairs seated from each pool are the top two of that pool, recomputed independently from the results', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLivePools(request, 8, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const played = await playUntilStuck(request, sessionId, sessionCourts[0].id)
    const scores = await getGameScores(request, sessionId, played)
    const after = await getFixtures(request, sessionId)

    let poolsChecked = 0
    for (const label of ['A', 'B']) {
      const poolFixtures = after.filter((f) => f.bracket === 'POOL' && f.poolLabel === label)
      const entrantIds = [...new Set(poolFixtures.flatMap((f) => [f.entrantAId, f.entrantBId]).filter(Boolean))]
      const ranked = rankPoolFromResults(poolFixtures, scores, entrantIds)
      if (!qualifyingCutIsDecisive(ranked)) continue

      const expectedTopTwo = ranked.slice(0, 2).map((row) => row.id)
      const semis = after.filter((f) => f.bracket === 'MAIN' && f.roundNumber === 1)
      const seatedFromThisPool = semis
        .flatMap((f) => [f.entrantAId, f.entrantBId])
        .filter((id) => id && entrantIds.includes(id))

      expect(seatedFromThisPool.slice().sort()).toEqual(expectedTopTwo.slice().sort())
      poolsChecked += 1
    }

    // Without this the test could quietly assert nothing at all if both pools
    // happened to end in a tie at the cut.
    expect(poolsChecked).toBeGreaterThan(0)
  })
})
