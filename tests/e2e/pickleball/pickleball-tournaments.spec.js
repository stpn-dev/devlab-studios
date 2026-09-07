import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loginAsOperator } from './helpers.js'

// A tournament is a FIXED_PAIRS session carrying `tournamentFormat` -- NOT a
// third session type (migration 0014's header, and this phase's own docs).
// These helpers therefore reuse the ordinary session-creation and
// fixed-pairs-formation flow, only adding `tournamentFormat` to the create
// call.

// ---------------------------------------------------------------------------
// player_game_stats.eligible_for_opi has no read API anywhere in this app
// (Task 7's own brief requires asserting it directly), so the only way to
// verify it is a direct, READ-ONLY local D1 query -- mirrors
// pickleball-games.spec.js's queryD1 helper exactly (module-local there too,
// so duplicated rather than imported). Nothing in this file ever WRITES to
// the database directly; every mutation goes through the real API.
function resolveWranglerBin() {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js')
}

const D1_BUSY_RETRIES = 5
const D1_LOCK_DIR = join(tmpdir(), 'pb-e2e-d1-read-lock')
const D1_LOCK_WAIT_ATTEMPTS = 400

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function withD1ReadLock(read) {
  let held = false
  for (let attempt = 0; attempt < D1_LOCK_WAIT_ATTEMPTS; attempt += 1) {
    try {
      mkdirSync(D1_LOCK_DIR)
      held = true
      break
    } catch {
      sleepSync(50)
    }
  }

  try {
    return read()
  } finally {
    if (held) {
      try {
        rmSync(D1_LOCK_DIR, { recursive: true, force: true })
      } catch {
        // Nothing to recover: the next caller's wait loop times out and
        // proceeds anyway.
      }
    }
  }
}

function queryD1(sql) {
  const sqlPath = join(mkdtempSync(join(tmpdir(), 'pb-tournaments-e2e-')), 'query.sql')
  writeFileSync(sqlPath, sql, 'utf8')

  return withD1ReadLock(() => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const out = execFileSync(
          process.execPath,
          [resolveWranglerBin(), 'd1', 'execute', 'devlab-pickleball', '--local', '--json', `--file=${sqlPath}`],
          { encoding: 'utf-8', windowsHide: true },
        )
        const parsed = JSON.parse(out)
        return parsed[0]?.results || []
      } catch (error) {
        const busy = String(error?.message || '').includes('SQLITE_BUSY')
        if (!busy || attempt >= D1_BUSY_RETRIES) throw error
        sleepSync(200 * (attempt + 1))
      }
    }
  })
}

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

async function rally(request, sessionId, gameId, winningTeam) {
  return request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, { data: { winningTeam } })
}

async function playSequence(request, sessionId, gameId, winningTeamSequence) {
  let lastResponse
  for (const winningTeam of winningTeamSequence) {
    lastResponse = await rally(request, sessionId, gameId, winningTeam)
    expect(lastResponse.status()).toBe(200)
  }
  return lastResponse
}

async function finishGame(request, sessionId, gameId) {
  return request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/finish`, { data: {} })
}

async function reopenGame(request, sessionId, gameId) {
  return request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/reopen`, { data: {} })
}

async function correctGame(request, sessionId, gameId, correctedState) {
  return request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/correct`, { data: correctedState })
}

function assignCourt(request, sessionId, sessionCourtId) {
  return request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })
}

// Plays a full, physically reachable 11-0 game (team A serves and wins every
// rally, same shape pickleball-fixed-pairs.spec.js's own pair-statistics test
// uses) then finishes it -- the shortest path from "court assigned" to
// "fixture FINISHED" this suite's Task 7 tests need repeatedly.
async function playAndFinish(request, sessionId, sessionCourtId, assignBody, winningTeam = 'A') {
  const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, winningTeam)
  expect(startResponse.status()).toBe(201)
  const gameId = (await startResponse.json()).game.id
  await playSequence(request, sessionId, gameId, Array(11).fill(winningTeam))
  const finishResponse = await finishGame(request, sessionId, gameId)
  expect(finishResponse.status()).toBe(200)
  return { gameId, finishBody: await finishResponse.json() }
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

// ---------------------------------------------------------------------------
// Task 7's non-tournament control needs an ORDINARY (non-tournament)
// FIXED_PAIRS session -- the exact ambiguous case, since a tournament is
// ALSO a FIXED_PAIRS session. This mirrors pickleball-fixed-pairs.spec.js's
// own setup (session -> OPEN_FOR_CHECKIN -> LIVE -> checked-in players ->
// formAndQueuePair -> assignCourt), duplicated rather than imported for the
// same module-local reason as every other helper here.
async function createOrdinaryFixedPairsSessionWithCourts(request, playerCount, courtCount) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const venueResponse = await request.post('/api/pickleball/venues', {
    data: { name: `Tourney Control Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
  })
  const venueId = (await venueResponse.json()).venue.id

  for (let i = 0; i < courtCount; i += 1) {
    await request.post('/api/pickleball/courts', { data: { venueId, name: `Court ${i + 1}` } })
  }

  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `Tourney Control Session ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sessionType: 'FIXED_PAIRS',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-08T18:00:00.000Z',
      scheduledEnd: '2026-09-08T22:00:00.000Z',
      // Deliberately no tournamentFormat -- this IS the control session.
    },
  })
  expect(sessionResponse.status()).toBe(201)
  const sessionId = (await sessionResponse.json()).session.id

  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  const sessionCourts = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts

  const sessionPlayerIds = []
  const playerIds = []
  for (let i = 0; i < playerCount; i += 1) {
    const playerResponse = await request.post('/api/pickleball/players', {
      data: { displayName: `Tourney Control Player ${Date.now()}-${i}-${Math.random().toString(36).slice(2)}` },
    })
    const playerId = (await playerResponse.json()).player.id
    const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
    const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    sessionPlayerIds.push(sessionPlayerId)
    playerIds.push(playerId)
  }

  return { sessionId, sessionCourts, sessionPlayerIds, playerIds }
}

async function formPair(request, sessionId, sessionPlayerAId, sessionPlayerBId) {
  const response = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
    data: { sessionPlayerAId, sessionPlayerBId },
  })
  return (await response.json()).pair
}

async function formAndQueuePair(request, sessionId, sessionPlayerAId, sessionPlayerBId) {
  const pair = await formPair(request, sessionId, sessionPlayerAId, sessionPlayerBId)
  const joinResponse = await request.post(`/api/pickleball/sessions/${sessionId}/queue`, {
    data: { sessionPlayerId: sessionPlayerAId },
  })
  expect(joinResponse.status()).toBe(201)
  return pair
}

// Plays a full ORDINARY (non-tournament) fixed-pairs game to completion --
// the control this suite's OPI/eligible_for_opi tests need. Returns the
// gameId and the WINNING side's first player's real playerId, whose
// ALL_TIME OPI is now a real, non-null 100 (an 11-0 shutout) -- reused by
// the tournament OPI test below to prove a SEPARATE tournament game leaves
// that value untouched.
async function createFinishedOrdinaryFixedPairsGame(request) {
  const { sessionId, sessionCourts, sessionPlayerIds, playerIds } = await createOrdinaryFixedPairsSessionWithCourts(request, 4, 1)
  const [p1, p2, p3, p4] = sessionPlayerIds
  await formAndQueuePair(request, sessionId, p1, p2)
  await formAndQueuePair(request, sessionId, p3, p4)

  const assignResponse = await assignCourt(request, sessionId, sessionCourts[0].id)
  expect(assignResponse.status()).toBe(200)
  const assignBody = await assignResponse.json()

  const { gameId } = await playAndFinish(request, sessionId, sessionCourts[0].id, assignBody, 'A')

  const playerIdBySessionPlayerId = new Map(sessionPlayerIds.map((id, index) => [id, playerIds[index]]))
  const winnerSessionPlayerId = assignBody.teamA.players[0].sessionPlayerId
  const winnerPlayerId = playerIdBySessionPlayerId.get(winnerSessionPlayerId)

  return { sessionId, gameId, winnerPlayerId }
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

test.describe('Pickleball tournaments: finish a fixture without feeding OPI', () => {
  // The non-tournament control this task's own brief requires: an ordinary
  // FIXED_PAIRS game (NOT a tournament -- the exact ambiguous case, since a
  // tournament is ALSO a FIXED_PAIRS session) must still write
  // eligible_for_opi = 1. Without this, a test asserting 0 on a tournament
  // game cannot distinguish "the flag is conditional on tournamentFormat"
  // from "the flag is unconditionally 0".
  test('control: an ordinary fixed-pairs game in a non-tournament session still writes eligible_for_opi = 1', async ({ request }) => {
    const { gameId } = await createFinishedOrdinaryFixedPairsGame(request)

    const rows = queryD1(`SELECT eligible_for_opi FROM player_game_stats WHERE game_id = '${gameId}'`)
    expect(rows.length).toBe(4)
    expect(rows.every((row) => row.eligible_for_opi === 1)).toBe(true)
  })

  test('finishing a tournament game marks its fixture FINISHED with the correct winner, writes eligible_for_opi = 0 for every participant, and leaves ALL_TIME OPI unchanged', async ({ request }) => {
    // Establish a REAL, non-null ALL_TIME OPI for one real player via an
    // ordinary (non-tournament) game first -- player_performance_snapshots
    // is keyed by player_id, not session_id, so this value persists into
    // whatever session that same player next appears in. This is what lets
    // the assertion below be a genuine non-null-to-non-null "unchanged"
    // check, rather than a vacuous null-to-null one.
    const { winnerPlayerId } = await createFinishedOrdinaryFixedPairsGame(request)
    const beforeStats = await (await request.get(`/api/pickleball/players/${winnerPlayerId}/stats`)).json()
    expect(beforeStats.allTime.opi).toBe(100)
    expect(beforeStats.allTime.eligibleGamesCount).toBe(1)

    const sessionResponse = await createTournamentSession(request, {}, 1)
    expect(sessionResponse.status()).toBe(201)
    const sessionId = (await sessionResponse.json()).session.id
    await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
    await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
    const sessionCourts = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts

    const registerReusedResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId: winnerPlayerId } })
    const reusedSessionPlayerId = (await registerReusedResponse.json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId: winnerPlayerId } })

    async function freshCheckedInSessionPlayer(label) {
      const playerResponse = await request.post('/api/pickleball/players', {
        data: { displayName: `Tourney OPI ${label} ${Date.now()}-${Math.random().toString(36).slice(2)}` },
      })
      const playerId = (await playerResponse.json()).player.id
      const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
      const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
      await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
      return sessionPlayerId
    }

    const partnerSessionPlayerId = await freshCheckedInSessionPlayer('partner')
    const opponentASessionPlayerId = await freshCheckedInSessionPlayer('opp-a')
    const opponentBSessionPlayerId = await freshCheckedInSessionPlayer('opp-b')

    const reusedPairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: reusedSessionPlayerId, sessionPlayerBId: partnerSessionPlayerId },
    })
    const reusedPair = (await reusedPairResponse.json()).pair
    const opponentPairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: opponentASessionPlayerId, sessionPlayerBId: opponentBSessionPlayerId },
    })
    const opponentPair = (await opponentPairResponse.json()).pair

    expect((await enterPair(request, sessionId, reusedPair.id)).status()).toBe(201)
    expect((await enterPair(request, sessionId, opponentPair.id)).status()).toBe(201)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const assignResponse = await assignCourt(request, sessionId, sessionCourts[0].id)
    expect(assignResponse.status()).toBe(200)
    const assignBody = await assignResponse.json()

    // Whichever side the reused player landed on -- "team A" here is
    // whichever pair the fixture called entrant A, an implementation detail
    // -- have THAT side win, so the fixture's winner_entrant_id is
    // unambiguous to assert below.
    const reusedSide = assignBody.teamA.players.some((p) => p.sessionPlayerId === reusedSessionPlayerId) ? 'A' : 'B'
    const winningPair = reusedSide === 'A' ? reusedPair : opponentPair

    const { gameId } = await playAndFinish(request, sessionId, sessionCourts[0].id, assignBody, reusedSide)

    const rows = queryD1(`SELECT eligible_for_opi FROM player_game_stats WHERE game_id = '${gameId}'`)
    expect(rows.length).toBe(4)
    expect(rows.every((row) => row.eligible_for_opi === 0)).toBe(true)

    const afterStats = await (await request.get(`/api/pickleball/players/${winnerPlayerId}/stats`)).json()
    expect(afterStats.allTime.opi).toBe(beforeStats.allTime.opi)
    expect(afterStats.allTime.eligibleGamesCount).toBe(beforeStats.allTime.eligibleGamesCount)

    const fixtures = await getFixtures(request, sessionId)
    expect(fixtures).toHaveLength(1)
    const finishedFixture = fixtures[0]
    expect(finishedFixture.status).toBe('FINISHED')

    const entrants = await getEntrants(request, sessionId)
    const winningEntrant = entrants.find((entrant) => entrant.sessionPairId === winningPair.id)
    expect(finishedFixture.winnerEntrantId).toBe(winningEntrant.id)
  })

  test('reopening and re-finishing a tournament game does not double-count anything and leaves the fixture FINISHED with the same winner', async ({ request }) => {
    const { sessionId, sessionCourts, pairs } = await createLiveTournamentWithPairs(request, 2, 1)
    await enterAllPairs(request, sessionId, pairs)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const assignResponse = await assignCourt(request, sessionId, sessionCourts[0].id)
    expect(assignResponse.status()).toBe(200)
    const assignBody = await assignResponse.json()

    const { gameId } = await playAndFinish(request, sessionId, sessionCourts[0].id, assignBody, 'A')

    const fixturesAfterFirstFinish = await getFixtures(request, sessionId)
    const fixture = fixturesAfterFirstFinish[0]
    expect(fixture.status).toBe('FINISHED')
    expect(fixture.winnerEntrantId).toBeTruthy()
    const winnerEntrantId = fixture.winnerEntrantId

    const reopenResponse = await reopenGame(request, sessionId, gameId)
    expect(reopenResponse.status()).toBe(200)

    const refinishResponse = await finishGame(request, sessionId, gameId)
    expect(refinishResponse.status()).toBe(200)

    const fixturesAfterRefinish = await getFixtures(request, sessionId)
    const fixtureAfterRefinish = fixturesAfterRefinish.find((f) => f.id === fixture.id)
    expect(fixtureAfterRefinish.status).toBe('FINISHED')
    expect(fixtureAfterRefinish.winnerEntrantId).toBe(winnerEntrantId)

    // Not double-counted: still exactly one stat row per participant (4),
    // all still eligible_for_opi = 0.
    const rows = queryD1(`SELECT eligible_for_opi FROM player_game_stats WHERE game_id = '${gameId}'`)
    expect(rows.length).toBe(4)
    expect(rows.every((row) => row.eligible_for_opi === 0)).toBe(true)

    // A stronger check than "same winner unchanged" alone: reopen again, and
    // this time actually CORRECT the score so the OTHER entrant wins, then
    // re-finish. If the fixture-completion statement were only applied on a
    // FRESH finish (never re-applied on a re-finish), the fixture would keep
    // reporting the ORIGINAL winner even though the game itself now says the
    // opposite side won -- a real, silent scoring-page bug this proves does
    // not happen.
    const entrants = await getEntrants(request, sessionId)
    const otherEntrantId = entrants.find((entrant) => entrant.id !== winnerEntrantId).id

    expect((await reopenGame(request, sessionId, gameId)).status()).toBe(200)
    expect((await correctGame(request, sessionId, gameId, { scoreA: 3, scoreB: 11, servingTeam: 'B', serverNumber: 1 })).status()).toBe(200)
    expect((await finishGame(request, sessionId, gameId)).status()).toBe(200)

    const fixturesAfterCorrection = await getFixtures(request, sessionId)
    const fixtureAfterCorrection = fixturesAfterCorrection.find((f) => f.id === fixture.id)
    expect(fixtureAfterCorrection.status).toBe('FINISHED')
    expect(fixtureAfterCorrection.winnerEntrantId).toBe(otherEntrantId)

    // Still exactly one stat row per participant -- a correction replaces
    // the row (reopenGame deletes, the re-finish recreates), never adds a
    // second one on top.
    const rowsAfterCorrection = queryD1(`SELECT eligible_for_opi FROM player_game_stats WHERE game_id = '${gameId}'`)
    expect(rowsAfterCorrection.length).toBe(4)
    expect(rowsAfterCorrection.every((row) => row.eligible_for_opi === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Task 8: tournament standings -- and the trap spec §3.7 names explicitly.
//
// listSessionStandings (sessionStandings.js) filters its win/loss aggregate
// on `pgs.eligible_for_opi = 1`. Every tournament game writes that flag `0`
// (Task 7), so reusing the query unchanged for a tournament reports every
// entrant 0-0 -- silently, not an error. The two describes below cover both
// halves of the fix: the per-PLAYER leaderboard (sessionStandings.js itself,
// the file the brief names) and the new per-ENTRANT tournament standings
// endpoint (tournaments.js's listTournamentStandings, which Task 4/5 already
// wrote clear of the trap, but which had no ordering or API route yet).

async function getLeaderboard(request, sessionId) {
  const response = await request.get(`/api/pickleball/sessions/${sessionId}/leaderboard`)
  expect(response.status()).toBe(200)
  return (await response.json()).leaderboard
}

async function getTournamentStandings(request, sessionId) {
  const response = await request.get(`/api/pickleball/sessions/${sessionId}/tournament/standings`)
  return response
}

// Which of `pairs` (by identity) a court-assignment "team" belongs to --
// matched by sessionPlayerId, same technique the assign-a-court describe
// block above already uses for `reusedSide`.
function pairForTeam(pairs, teamPlayers) {
  const ids = new Set(teamPlayers.map((p) => p.sessionPlayerId))
  return pairs.find((pair) => ids.has(pair.sessionPlayerAId) || ids.has(pair.sessionPlayerBId))
}

// Plays whichever fixture assignCourt proposes on sessionCourtId to a
// specific, real final score -- shutout (11-0) if the winner is expected to
// dominate, or a controlled 11-9 (the exact rally pattern
// pickleball-games.spec.js's own "terminal-score rejection" test already
// proves reaches a legal, non-shutout final score) when the scenario needs a
// real, non-coincidental point differential. `winnerPairIndex`/`loserPairIndex`
// index into the `pairs` array the caller already holds.
async function playFixture(request, sessionId, sessionCourtId, pairs, winnerPairIndex, loserPairIndex, mode) {
  const assignResponse = await assignCourt(request, sessionId, sessionCourtId)
  expect(assignResponse.status()).toBe(200)
  const assignBody = await assignResponse.json()

  const teamAPair = pairForTeam(pairs, assignBody.teamA.players)
  const winnerLabel = teamAPair.id === pairs[winnerPairIndex].id ? 'A' : 'B'
  const loserLabel = winnerLabel === 'A' ? 'B' : 'A'

  const servingLabel = mode === 'shutout' ? winnerLabel : loserLabel
  const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, servingLabel)
  expect(startResponse.status()).toBe(201)
  const gameId = (await startResponse.json()).game.id

  const sequence = mode === 'shutout' ? Array(11).fill(winnerLabel) : [...Array(9).fill(loserLabel), winnerLabel, ...Array(11).fill(winnerLabel)]
  await playSequence(request, sessionId, gameId, sequence)

  const finishResponse = await finishGame(request, sessionId, gameId)
  expect(finishResponse.status()).toBe(200)
  const finishBody = await finishResponse.json()

  const winnerScore = winnerLabel === 'A' ? finishBody.finalScoreA : finishBody.finalScoreB
  const loserScore = winnerLabel === 'A' ? finishBody.finalScoreB : finishBody.finalScoreA
  return { gameId, winnerScore, loserScore }
}

test.describe('Pickleball tournaments: standings (per-player leaderboard, sessionStandings.js)', () => {
  test('control: a finished ordinary fixed-pairs game shows real (non-default) wins/losses on the session leaderboard', async ({ request }) => {
    const { sessionId, gameId } = await createFinishedOrdinaryFixedPairsGame(request)
    const rows = await getLeaderboard(request, sessionId)
    expect(rows).toHaveLength(4)
    // 4 players, 2 wins / 2 losses, each with a real +/-11 differential --
    // never a coincidental zero.
    expect(rows.filter((r) => r.wins === 1 && r.losses === 0 && r.pointDifferential === 11)).toHaveLength(2)
    expect(rows.filter((r) => r.wins === 0 && r.losses === 1 && r.pointDifferential === -11)).toHaveLength(2)
    void gameId
  })

  test('a finished TOURNAMENT game still shows real wins/losses on the session leaderboard, while OPI stays null (the OPI asymmetry, both halves at once)', async ({ request }) => {
    const { sessionId, sessionCourts, pairs } = await createLiveTournamentWithPairs(request, 2, 1)
    await enterAllPairs(request, sessionId, pairs)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const { winnerScore, loserScore } = await playFixture(request, sessionId, sessionCourts[0].id, pairs, 0, 1, 'shutout')
    expect(winnerScore).toBe(11)
    expect(loserScore).toBe(0)

    const rows = await getLeaderboard(request, sessionId)
    expect(rows).toHaveLength(4)

    // The trap this task exists for: without the fix, EVERY row here reads
    // wins: 0, losses: 0, pointDifferential: 0 -- these two assertions are
    // exactly what a naive (unfixed) run fails on. See task-8-9-report.md for
    // the real captured output.
    expect(rows.filter((r) => r.wins === 1 && r.losses === 0 && r.pointDifferential === 11)).toHaveLength(2)
    expect(rows.filter((r) => r.wins === 0 && r.losses === 1 && r.pointDifferential === -11)).toHaveLength(2)

    // The OTHER half of the asymmetry must stay intact: OPI itself (a
    // SEPARATE table, playerPerformanceSnapshots.js, filtered independently)
    // remains null/0-eligible-games for every one of these players --
    // proving the fix only unblocked win/loss counting, not OPI.
    expect(rows.every((r) => r.opi === null && r.eligibleGamesCount === 0)).toBe(true)
  })
})

test.describe('Pickleball tournaments: standings (per-entrant, tournament/standings)', () => {
  test('a full 3-entrant round robin played to completion produces real per-entrant W-L and point differential, ranked by wins', async ({ request }) => {
    const { sessionId, sessionCourts, pairs } = await createLiveTournamentWithPairs(request, 3, 1)
    await enterAllPairs(request, sessionId, pairs)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    // pairs[0] beats everyone (2-0); pairs[1] splits (1-1, beating the
    // weakest entrant); pairs[2] loses every fixture (0-2) -- the entrant
    // that must be distinguishable from an absent/zeroed row. Single court:
    // fixtures are played strictly one at a time (assignCourt proposes
    // whichever is next-playable; finishGame releases the court atomically,
    // proven by pickleball-games.spec.js's own regression), so this loop
    // does not need to know round-robin's internal ordering.
    for (let i = 0; i < 3; i += 1) {
      const fixturesNow = await getFixtures(request, sessionId)
      const remaining = fixturesNow.filter((f) => f.status !== 'FINISHED').length
      expect(remaining).toBeGreaterThan(0)

      const entrants = await getEntrants(request, sessionId)
      const pairIdByEntrantId = new Map(entrants.map((e) => [e.id, e.sessionPairId]))
      const next = fixturesNow.find((f) => f.status === 'READY')
      const pairAId = pairIdByEntrantId.get(next.entrantAId)
      const pairBId = pairIdByEntrantId.get(next.entrantBId)
      const indexA = pairs.findIndex((p) => p.id === pairAId)
      const indexB = pairs.findIndex((p) => p.id === pairBId)
      const winnerIndex = Math.min(indexA, indexB)
      const loserIndex = Math.max(indexA, indexB)
      // Only the pairs[1] vs pairs[2] fixture gets a non-shutout score --
      // every fixture involving pairs[0] is a shutout.
      const mode = winnerIndex === 1 && loserIndex === 2 ? 'partial' : 'shutout'
      await playFixture(request, sessionId, sessionCourts[0].id, pairs, winnerIndex, loserIndex, mode)
    }

    const finalFixtures = await getFixtures(request, sessionId)
    expect(finalFixtures).toHaveLength(3)
    expect(finalFixtures.every((f) => f.status === 'FINISHED')).toBe(true)

    const entrants = await getEntrants(request, sessionId)
    const entrantIdByPairId = new Map(entrants.map((e) => [e.sessionPairId, e.id]))

    const standingsResponse = await getTournamentStandings(request, sessionId)
    expect(standingsResponse.status()).toBe(200)
    const standings = (await standingsResponse.json()).standings
    expect(standings).toHaveLength(3)

    const s0 = standings.find((s) => s.entrantId === entrantIdByPairId.get(pairs[0].id))
    const s1 = standings.find((s) => s.entrantId === entrantIdByPairId.get(pairs[1].id))
    const s2 = standings.find((s) => s.entrantId === entrantIdByPairId.get(pairs[2].id))

    // pairs[0]: beat pairs[1] 11-0 and pairs[2] 11-0.
    expect(s0.wins).toBe(2)
    expect(s0.losses).toBe(0)
    expect(s0.pointsFor).toBe(22)
    expect(s0.pointsAgainst).toBe(0)
    expect(s0.pointDifferential).toBe(22)

    // pairs[1]: lost to pairs[0] 0-11, beat pairs[2] 11-9.
    expect(s1.wins).toBe(1)
    expect(s1.losses).toBe(1)
    expect(s1.pointsFor).toBe(11)
    expect(s1.pointsAgainst).toBe(20)
    expect(s1.pointDifferential).toBe(-9)

    // pairs[2]: THE ENTRANT THAT LOST EVERY FIXTURE. 0 wins paired with a
    // real (non-zero) 2 losses and a real negative differential -- proves
    // this row is genuinely present and aggregated, not silently absent.
    expect(s2.wins).toBe(0)
    expect(s2.losses).toBe(2)
    expect(s2.pointsFor).toBe(9)
    expect(s2.pointsAgainst).toBe(22)
    expect(s2.pointDifferential).toBe(-13)

    // Ordered by wins descending (spec §3.7's primary key) -- rank 1..3.
    expect(standings.map((s) => s.entrantId)).toEqual([s0.entrantId, s1.entrantId, s2.entrantId])
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3])
  })

  test('before any fixture is played, every entrant shows a real 0-0 row (not absent) -- the same shape as after, just with real zeroes', async ({ request }) => {
    const { sessionId, pairs } = await createLiveTournamentWithPairs(request, 2, 0)
    await enterAllPairs(request, sessionId, pairs)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const standingsResponse = await getTournamentStandings(request, sessionId)
    expect(standingsResponse.status()).toBe(200)
    const standings = (await standingsResponse.json()).standings
    expect(standings).toHaveLength(2)
    expect(standings.every((s) => s.wins === 0 && s.losses === 0 && s.pointDifferential === 0)).toBe(true)
    expect(standings.every((s) => typeof s.rank === 'number')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Task 9: operator UI. Branches on `tournamentFormat`, NEVER on session type
// -- a tournament is ALSO a FIXED_PAIRS session, so branching on the type
// alone would catch ordinary pair sessions too (the exact ordering hazard
// Task 6 named for assignCourt, now on the UI side). Regression coverage for
// "a non-tournament session is unchanged" is the existing
// pickleball-operator-ui.spec.js and pickleball-fixed-pairs.spec.js suites,
// re-run unmodified.

test.describe('Pickleball tournaments: operator UI', () => {
  test('the create form offers a tournament format; only a tournament session shows a Tournament nav entry', async ({ page, request, context }) => {
    const baseURL = test.info().project.use.baseURL
    await loginAsOperator(request, context, baseURL)

    const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Tourney UI Venue ${Date.now()}` } })
    const venueId = (await venueResponse.json()).venue.id
    const rulesetsResponse = await request.get('/api/pickleball/scoring-rulesets')
    const doublesRuleset = (await rulesetsResponse.json()).rulesets.find((r) => r.id === 'usap-2026-sideout-11-doubles')
    expect(doublesRuleset).toBeTruthy()

    await page.goto('/pickleball/app/sessions')
    await page.getByRole('button', { name: 'New Session' }).click()

    const tournamentSessionName = `Tourney UI Session ${Date.now()}`
    await page.getByLabel('Name', { exact: true }).fill(tournamentSessionName)
    await page.getByTestId('session-type-select').selectOption('FIXED_PAIRS')
    // The tournament-format control only appears for a FIXED_PAIRS session --
    // asserting it is present here is itself part of "the create form offers
    // a tournament format".
    await expect(page.getByTestId('session-tournament-format-select')).toBeVisible()
    await page.getByTestId('session-tournament-format-select').selectOption('ROUND_ROBIN')
    await page.getByTestId('session-venue-select').selectOption(venueId)
    await page.getByTestId('session-ruleset-select').selectOption('usap-2026-sideout-11-doubles')
    await page.getByLabel('Start', { exact: true }).fill('2026-09-08T18:00')
    await page.getByLabel('End', { exact: true }).fill('2026-09-08T22:00')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('Session created.')).toBeVisible()

    await page.getByTestId('sessions-list').getByText(tournamentSessionName).click()
    await expect(page.getByRole('link', { name: 'Tournament' })).toBeVisible()

    // The control: an ordinary FIXED_PAIRS session (tournament format left at
    // "Not a tournament") must NOT show the Tournament nav entry -- proves
    // the branch is on tournamentFormat, not on FIXED_PAIRS itself.
    await page.goto('/pickleball/app/sessions')
    await page.getByRole('button', { name: 'New Session' }).click()
    const ordinarySessionName = `Tourney UI Control Session ${Date.now()}`
    await page.getByLabel('Name', { exact: true }).fill(ordinarySessionName)
    await page.getByTestId('session-type-select').selectOption('FIXED_PAIRS')
    await expect(page.getByTestId('session-tournament-format-select')).toBeVisible()
    // Deliberately leave it at "Not a tournament".
    await page.getByTestId('session-venue-select').selectOption(venueId)
    await page.getByTestId('session-ruleset-select').selectOption('usap-2026-sideout-11-doubles')
    await page.getByLabel('Start', { exact: true }).fill('2026-09-08T18:00')
    await page.getByLabel('End', { exact: true }).fill('2026-09-08T22:00')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('Session created.')).toBeVisible()

    await page.getByTestId('sessions-list').getByText(ordinarySessionName).click()
    await expect(page.getByRole('heading', { name: ordinarySessionName })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tournament' })).not.toBeVisible()

    // And OPEN_PLAY never even offers the control at all.
    await page.goto('/pickleball/app/sessions')
    await page.getByRole('button', { name: 'New Session' }).click()
    await expect(page.getByTestId('session-tournament-format-select')).not.toBeVisible()
  })

  test('TournamentPage lists entrants in seed order, enters a pair before lock, disables entry after lock, and renders fixtures grouped by round with status', async ({ page, request, context }) => {
    const baseURL = test.info().project.use.baseURL
    await loginAsOperator(request, context, baseURL)

    const { sessionId, sessionCourts, pairs: createdPairs } = await createLiveTournamentWithPairs(request, 2, 1)
    void sessionCourts

    // createLiveTournamentWithPairs' own return value comes straight off the
    // formPair response (toPair -- no display names). GET .../pairs is
    // listSessionPairs, which DOES join in playerADisplayName/
    // playerBDisplayName -- fetch it once so the UI assertions below have
    // real names to match against, same shape TournamentPage itself fetches.
    const pairsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/pairs`)
    const pairsWithNames = (await pairsResponse.json()).pairs
    const pairs = createdPairs.map((pair) => pairsWithNames.find((p) => p.id === pair.id))
    expect(pairs.every(Boolean)).toBe(true)

    await page.goto(`/pickleball/app/sessions/${sessionId}/tournament`)
    // `exact: true` matters here: the test session's own name is
    // "Tournament Session ..." (createTournamentSession's default), so a
    // non-exact match against SessionLayout's own session-name heading can
    // collide with this page's real <h1>Tournament</h1> once both have
    // rendered -- and race harmlessly-looking-green when only one has.
    await expect(page.getByRole('heading', { name: 'Tournament', exact: true })).toBeVisible()

    // Nothing entered yet -- both formed pairs are selectable, neither is
    // listed as an entrant.
    await expect(page.getByTestId('tournament-entrants-list')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('tournament-enter-pair-select')).toBeEnabled()
    await expect(page.getByTestId('tournament-enter-pair-button')).toBeDisabled()

    // Enter pairs[0] first, then pairs[1] -- pre-lock "seed order" is
    // created_at order (every seed is still null), so the entrants list must
    // render pairs[0] above pairs[1].
    await page.getByTestId('tournament-enter-pair-select').selectOption(pairs[0].id)
    await page.getByTestId('tournament-enter-pair-button').click()
    await expect(page.getByTestId('tournament-entrants-list').getByText(`${pairs[0].playerADisplayName} / ${pairs[0].playerBDisplayName}`)).toBeVisible()

    await page.getByTestId('tournament-enter-pair-select').selectOption(pairs[1].id)
    await page.getByTestId('tournament-enter-pair-button').click()
    await expect(page.getByTestId('tournament-entrants-list').getByText(`${pairs[1].playerADisplayName} / ${pairs[1].playerBDisplayName}`)).toBeVisible()

    const entrantRows = page.getByTestId('tournament-entrants-list').locator('[data-testid^="tournament-entrant-"]')
    await expect(entrantRows).toHaveCount(2)
    await expect(entrantRows.nth(0)).toContainText(pairs[0].playerADisplayName)
    await expect(entrantRows.nth(1)).toContainText(pairs[1].playerADisplayName)

    // Both pairs are now entered -- the select has nothing left to offer, so
    // "enter" is disabled even though the bracket isn't locked yet.
    await expect(page.getByTestId('tournament-enter-pair-button')).toBeDisabled()

    await page.getByTestId('tournament-lock-bracket-button').click()

    // After lock: the whole entry control is disabled, never removed --
    // an operator should still be able to see it, just not use it.
    await expect(page.getByTestId('tournament-enter-pair-select')).toBeDisabled()
    await expect(page.getByTestId('tournament-lock-bracket-button')).not.toBeVisible()

    // Locking a 2-entrant round robin generates exactly one fixture, in
    // round 1 -- grouped fixture list shows it with its real status.
    await expect(page.getByTestId('tournament-fixtures')).toContainText('Round 1')
    const fixtureRows = page.getByTestId('tournament-fixtures').locator('[data-testid^="tournament-fixture-"]')
    await expect(fixtureRows).toHaveCount(1)
    await expect(fixtureRows.first()).toContainText(pairs[0].playerADisplayName)
    await expect(fixtureRows.first()).toContainText(pairs[1].playerADisplayName)
    await expect(fixtureRows.first()).toContainText('Ready')
  })
})
