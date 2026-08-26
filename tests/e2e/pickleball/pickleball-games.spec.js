import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// This is Phase 4's hardening-pass e2e suite -- the FIRST time any of
// startGame/recordRally/undoLastRally/finishGame/abandonGame/reopenGame/
// correctGame, or the operator-grant routes, get exercised against a real
// `wrangler dev` + local D1 rather than in isolated review. Setup follows
// pickleball-queue.spec.js's established convention exactly: every fixture is
// created through the REAL API (session -> OPEN_FOR_CHECKIN -> LIVE ->
// checked-in/queued players -> assignCourt), never via a direct D1 write.

// ---------------------------------------------------------------------------
// player_game_stats and matchmaking_history have no read API anywhere in this
// phase, so the only way to verify their CONTENTS (required by this task's
// brief) is a direct, READ-ONLY local D1 query. This mirrors
// scripts/pickleball/apply-e2e-fixtures.mjs's own `wrangler d1 execute`
// invocation technique exactly (resolve the wrangler package's bin/wrangler.js
// and run it under the current `node` binary, rather than through `npx` --
// npx's Windows .cmd shim needs `shell: true`, which reintroduces the
// quoting problems `--file=<path>` exists to avoid) and the Phase 3 plan's
// explicit convention ("D1 access during verification: --local only, never
// --remote"). Nothing in this file ever WRITES to the database directly --
// every mutation goes through the real API, same as pickleball-queue.spec.js.
function resolveWranglerBin() {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js')
}

// Each of these reads is a SECOND process opening the local SQLite file
// miniflare already holds open (exactly the hazard playwright.config.js's own
// webServer comment describes), so it contends with in-flight worker writes:
// the reader can come back SQLITE_BUSY, and -- worse, because it fails a test
// that never touched D1 -- a worker write racing the reader can fail and
// surface as a 500 from an unrelated API call in another spec. Two guards, both
// pure test infrastructure with no bearing on any assertion:
//
//   * a cross-process lock directory, so at most ONE of these reader processes
//     exists at a time no matter how many Playwright workers are running;
//   * a bounded SQLITE_BUSY retry for the reader itself.
//
// The lock gives up waiting rather than hanging forever, so a crashed holder
// degrades this to the unlocked behavior instead of wedging the suite.
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
  const sqlPath = join(mkdtempSync(join(tmpdir(), 'pb-games-e2e-')), 'query.sql')
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

// ---------------------------------------------------------------------------
// Setup helpers, modeled directly on pickleball-queue.spec.js's
// createSessionWithCheckedInPlayers (same session -> OPEN_FOR_CHECKIN -> LIVE
// -> register/check-in/queue sequence), extended to also hand back
// `activeOrgId` (needed for the RBAC test's membership creation).

async function createLiveSessionWithPlayers(request, playerCount, courtCount = 1) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const venueResponse = await request.post('/api/pickleball/venues', {
    data: { name: `Games Test Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
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
      name: `Games Test Session ${Date.now()}`,
      sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-08-30T18:00:00.000Z',
      scheduledEnd: '2026-08-30T22:00:00.000Z',
    },
  })
  expect(sessionResponse.ok()).toBe(true)
  const sessionId = (await sessionResponse.json()).session.id

  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  const courtsListResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
  const sessionCourts = (await courtsListResponse.json()).courts

  const sessionPlayerIds = []
  for (let i = 0; i < playerCount; i += 1) {
    const playerResponse = await request.post('/api/pickleball/players', {
      data: { displayName: `Games Player ${Date.now()}-${i}-${Math.random().toString(36).slice(2)}` },
    })
    const playerId = (await playerResponse.json()).player.id
    const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
    const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
    sessionPlayerIds.push(sessionPlayerId)
  }

  const sessionInfoResponse = await request.get('/api/pickleball/auth/session')
  const activeOrgId = (await sessionInfoResponse.json()).activeOrgId

  return { sessionId, sessionCourts, sessionPlayerIds, activeOrgId }
}

async function assignCourt(request, sessionId, sessionCourtId) {
  const response = await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })
  expect(response.status()).toBe(200)
  return response.json()
}

// Which of assignBody's two rosters ends up labeled game.teamA vs
// game.teamB is resolved by SessionCoordinatorDO.startGame from team
// MEMBERSHIP of teamAStartingServerSessionPlayerId, not from assignCourt's
// own teamA/teamB labels -- see that method's block comment. `servingTeam`
// is the only thing this helper varies across call sites.
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

async function rally(request, sessionId, gameId, winningTeam, idempotencyKey) {
  const data = idempotencyKey ? { winningTeam, idempotencyKey } : { winningTeam }
  return request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, { data })
}

// Posts a whole sequence of rallies, asserting every single one succeeds
// (200) along the way -- a failure mid-sequence would otherwise silently
// leave the game in an unexpected state for whatever assertion runs next.
async function playSequence(request, sessionId, gameId, winningTeamSequence) {
  let lastResponse
  for (const winningTeam of winningTeamSequence) {
    lastResponse = await rally(request, sessionId, gameId, winningTeam)
    expect(lastResponse.status()).toBe(200)
  }
  return lastResponse
}

async function finishGame(request, sessionId, gameId, idempotencyKey) {
  const data = idempotencyKey ? { idempotencyKey } : {}
  return request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/finish`, { data })
}

async function abandonGame(request, sessionId, gameId) {
  return request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/abandon`, { data: {} })
}

async function reopenGame(request, sessionId, gameId) {
  return request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/reopen`, { data: {} })
}

async function correctGame(request, sessionId, gameId, correctedState) {
  return request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/correct`, { data: correctedState })
}

async function releaseCourt(request, sessionId, sessionCourtId) {
  return request.post(`/api/pickleball/sessions/${sessionId}/courts/release`, { data: { sessionCourtId } })
}

// `teams.session_court_id` is the ONLY representation of "this occupancy owns
// this court", and there is no read API for it -- so the court-clobbering
// tests below verify it through the same read-only local-D1 helper the
// stats/matchmaking assertions use.
function teamIdsBoundToCourt(sessionCourtId) {
  return queryD1(`SELECT id FROM teams WHERE session_court_id = '${sessionCourtId}'`)
    .map((row) => row.id)
    .sort()
}

test.describe('Pickleball games', () => {
  test('happy path: explicit non-default serving team, legal final score, atomic finish+release, stats/matchmaking/games_played', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id

    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'B')
    expect(startResponse.status()).toBe(201)
    const startBody = await startResponse.json()
    // Proves the old hardcoded-'A' bug is really gone: the response echoes
    // the EXPLICITLY requested non-default serving team, not always 'A'.
    expect(startBody.game.servingTeam).toBe('B')
    const gameId = startBody.game.id

    // games/index.ts -- one of this hardening pass's previously-missing
    // routes -- lists the just-started game.
    const listResponse = await request.get(`/api/pickleball/sessions/${sessionId}/games`)
    expect(listResponse.status()).toBe(200)
    expect((await listResponse.json()).games.map((g) => g.id)).toContain(gameId)

    // Team B serves and wins every single rally -- a real, physically
    // reachable sequence (no side-outs at all: recordRally only changes
    // servingTeam/serverNumber when the RECEIVING team wins) ending at a
    // legal final score, 11-0.
    await playSequence(request, sessionId, gameId, Array(11).fill('B'))

    const finishResponse = await finishGame(request, sessionId, gameId)
    expect(finishResponse.status()).toBe(200)
    const finishBody = await finishResponse.json()
    expect(finishBody.finalScoreA).toBe(0)
    expect(finishBody.finalScoreB).toBe(11)
    expect(finishBody.winningTeamId).toBe(startBody.game.teamBId)
    expect(finishBody.releasedSessionPlayerIds).toHaveLength(4)
    expect(finishBody.requeued).toBe(true)
    expect(finishBody.game.status).toBe('FINISHED')

    // Atomic finish+release: court AVAILABLE + game FINISHED + queue
    // consistent, all read strictly AFTER the single finish call above --
    // there is nothing to observe in between.
    const courtsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
    const court = (await courtsResponse.json()).courts.find((c) => c.id === sessionCourtId)
    expect(court.status).toBe('AVAILABLE')

    const queueResponse = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const queue = (await queueResponse.json()).queue
    expect(queue.filter((e) => e.status === 'QUEUED')).toHaveLength(4)

    // games_played: +1 per participant, not +2 (the base plan's original
    // happy-path assertion).
    const playersResponse = await request.get(`/api/pickleball/sessions/${sessionId}/players`)
    const players = (await playersResponse.json()).players
    for (const player of players) {
      expect(player.gamesPlayed).toBe(1)
    }

    // player_game_stats: exactly one row per participant (4), split 2 wins /
    // 2 losses (team B won). No read API exists for this table -- see the
    // queryD1 helper's comment above.
    const stats = queryD1(`SELECT player_id, is_win FROM player_game_stats WHERE game_id = '${gameId}'`)
    expect(stats).toHaveLength(4)
    expect(stats.filter((row) => row.is_win === 1)).toHaveLength(2)
    expect(stats.filter((row) => row.is_win === 0)).toHaveLength(2)

    // matchmaking_history, both directions: 2 PARTNER pairs (one per team) x
    // 2 directions = 4 rows; 2x2 cross-team OPPONENT pairs x 2 directions = 8
    // rows. 12 total.
    const matchmaking = queryD1(`SELECT player_id, other_player_id, relation FROM matchmaking_history WHERE session_id = '${sessionId}'`)
    expect(matchmaking).toHaveLength(12)
    expect(matchmaking.filter((row) => row.relation === 'PARTNER')).toHaveLength(4)
    expect(matchmaking.filter((row) => row.relation === 'OPPONENT')).toHaveLength(8)
  })

  test('terminal-score rejection: a rally past a valid final score is rejected, finish still succeeds', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'B')
    const gameId = (await startResponse.json()).game.id

    // B serves first and wins 9 straight (server stays 2 throughout -- no
    // side-out yet), then A wins once while B is still server 2 -- an
    // IMMEDIATE side-out (there's no serverNumber-1 intermediate step to
    // pass through, since B never dropped to server 1) -- then A wins 11
    // straight to reach the legal final 11-9.
    await playSequence(request, sessionId, gameId, [...Array(9).fill('B'), 'A', ...Array(11).fill('A')])

    const extraRallyResponse = await rally(request, sessionId, gameId, 'A')
    expect(extraRallyResponse.status()).toBe(409)
    const extraRallyBody = await extraRallyResponse.json()
    expect(extraRallyBody.error).toContain('already has a final score')

    const finishResponse = await finishGame(request, sessionId, gameId)
    expect(finishResponse.status()).toBe(200)
    const finishBody = await finishResponse.json()
    expect(finishBody.finalScoreA).toBe(11)
    expect(finishBody.finalScoreB).toBe(9)
  })

  test('unreachable final-score rejection via correction: reopen, correct to an unreachable score, finish rejects it', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'A')
    const gameId = (await startResponse.json()).game.id

    await playSequence(request, sessionId, gameId, Array(11).fill('A'))
    expect((await finishGame(request, sessionId, gameId)).status()).toBe(200)

    expect((await reopenGame(request, sessionId, gameId)).status()).toBe(200)

    // 12-9 in an 11/2 ruleset: the OLD lenient rule (max >= target && diff >=
    // winBy) would have accepted this, but it is not a LEGALLY REACHABLE
    // final score -- real sequential play would have already ended the game
    // at 11-9. correctGame itself does not final-score-validate (a
    // correction may legitimately set a mid-game, non-final state), so it
    // must succeed -- but finish must then reject it.
    const correctResponse = await correctGame(request, sessionId, gameId, { scoreA: 12, scoreB: 9, servingTeam: 'A', serverNumber: 1 })
    expect(correctResponse.status()).toBe(200)

    const finishAfterCorrectionResponse = await finishGame(request, sessionId, gameId)
    expect(finishAfterCorrectionResponse.status()).toBe(409)
    const finishAfterCorrectionBody = await finishAfterCorrectionResponse.json()
    expect(finishAfterCorrectionBody.error).toContain('not a valid final score')
  })

  test('undo across a correction: undo returns to the corrected baseline, not a state that ignores the correction', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'A')
    const gameId = (await startResponse.json()).game.id

    // Corrects a game that is STILL live -- never finished, never reopened.
    // This is correctGame's OTHER documented use ("whether that game is
    // genuinely still live ... or was reopened"), and deliberately not the
    // reopen-then-correct path: SessionCoordinatorDO.recordRally
    // unconditionally rejects (409) any rally on a game with
    // correction_pending=1, and only finishGame's correctionPending branch
    // ever clears that flag (see reopenGame's/correctGame's own comments,
    // and the "correction-only lifecycle" test above, which asserts exactly
    // that 409). So "reopen, correct, record ONE MORE rally, undo" as a
    // literal sequence -- the wording this task's brief uses -- is not
    // reachable through the real API: the rally step would always 409. That
    // looks like an inconsistency in the brief rather than a code bug, since
    // the "correction-only lifecycle" scenario elsewhere in the SAME brief
    // independently requires the opposite (rally always 409s once
    // correction_pending is set) and the implementation is self-consistent
    // with THAT scenario. This test instead exercises the mid-game
    // correction path to the same effect and with the same numbers (8-6 ->
    // 9-6 -> undo -> 8-6), which really is reachable and exercises the same
    // replayEvents/SCORE_CORRECTED-folding property the brief is after.
    const correctResponse = await correctGame(request, sessionId, gameId, { scoreA: 8, scoreB: 6, servingTeam: 'A', serverNumber: 1 })
    expect(correctResponse.status()).toBe(200)
    expect((await correctResponse.json()).game.scoreA).toBe(8)

    const rallyResponse = await rally(request, sessionId, gameId, 'A')
    expect(rallyResponse.status()).toBe(200)
    const rallyBody = await rallyResponse.json()
    expect(rallyBody.state.scoreA).toBe(9)
    expect(rallyBody.state.scoreB).toBe(6)

    const undoResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/undo`, { data: {} })
    expect(undoResponse.status()).toBe(200)
    const undoBody = await undoResponse.json()
    // Back to EXACTLY the corrected baseline (8-6, A, server 1) -- not a
    // state derived by folding only the pre-correction score_events history,
    // which is what the pre-Ruling-5 duplicated-fold bug would have produced.
    expect(undoBody.state.scoreA).toBe(8)
    expect(undoBody.state.scoreB).toBe(6)
    expect(undoBody.state.servingTeam).toBe('A')
    expect(undoBody.state.serverNumber).toBe(1)
  })

  test('idempotency: a failed finish attempt is not cached, a retry with the same key after reaching a real final succeeds', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'A')
    const gameId = (await startResponse.json()).game.id

    const key = `finish-key-${Date.now()}`
    const earlyFinishResponse = await finishGame(request, sessionId, gameId, key)
    expect(earlyFinishResponse.status()).toBe(409)

    await playSequence(request, sessionId, gameId, Array(11).fill('A'))

    // Same key, now that the score is genuinely final -- must succeed rather
    // than being poisoned by the earlier failed attempt's key.
    const retryFinishResponse = await finishGame(request, sessionId, gameId, key)
    expect(retryFinishResponse.status()).toBe(200)
    const retryFinishBody = await retryFinishResponse.json()
    expect(retryFinishBody.finalScoreA).toBe(11)
    expect(retryFinishBody.finalScoreB).toBe(0)
  })

  test('idempotency: the same key value used for a rally and a finish on the same game does not collide', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'A')
    const gameId = (await startResponse.json()).game.id

    const sharedKey = `shared-key-${Date.now()}`
    const rallyResponse = await rally(request, sessionId, gameId, 'A', sharedKey)
    expect(rallyResponse.status()).toBe(200)
    expect((await rallyResponse.json()).state.scoreA).toBe(1)

    await playSequence(request, sessionId, gameId, Array(10).fill('A'))

    const finishResponse = await finishGame(request, sessionId, gameId, sharedKey)
    expect(finishResponse.status()).toBe(200)
    const finishBody = await finishResponse.json()
    // idempotency_keys is scoped by (game_id, command_type, key) since
    // migration 0008 -- if RECORD_RALLY and FINISH_GAME collided on this
    // key, this call would either fail outright or come back shaped like
    // the cached RALLY result instead of a FINISH result. Assert the
    // FINISH-shaped fields are genuinely present.
    expect(finishBody.finalScoreA).toBe(11)
    expect(finishBody.finalScoreB).toBe(0)
    expect(finishBody.winningTeamId).toBeTruthy()
  })

  test('abandon: ABANDONED status, court released, zero stats/matchmaking rows, games_played unchanged', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'A')
    const gameId = (await startResponse.json()).game.id

    // A couple of real points first -- proves abandon works from a live,
    // scored-but-unfinished state, not just from 0-0.
    await playSequence(request, sessionId, gameId, ['A', 'A'])

    const beforePlayersResponse = await request.get(`/api/pickleball/sessions/${sessionId}/players`)
    const beforeGamesPlayed = Object.fromEntries((await beforePlayersResponse.json()).players.map((p) => [p.id, p.gamesPlayed]))

    const abandonResponse = await abandonGame(request, sessionId, gameId)
    expect(abandonResponse.status()).toBe(200)
    const abandonBody = await abandonResponse.json()
    expect(abandonBody.game.status).toBe('ABANDONED')
    expect(abandonBody.releasedSessionPlayerIds).toHaveLength(4)

    const courtsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
    const court = (await courtsResponse.json()).courts.find((c) => c.id === sessionCourtId)
    expect(court.status).toBe('AVAILABLE')

    // Edge case #18: an abandoned game is explicitly excluded from OPI --
    // zero player_game_stats and zero matchmaking_history rows.
    expect(queryD1(`SELECT id FROM player_game_stats WHERE game_id = '${gameId}'`)).toHaveLength(0)
    expect(queryD1(`SELECT id FROM matchmaking_history WHERE session_id = '${sessionId}'`)).toHaveLength(0)

    const afterPlayersResponse = await request.get(`/api/pickleball/sessions/${sessionId}/players`)
    for (const player of (await afterPlayersResponse.json()).players) {
      expect(player.gamesPlayed).toBe(beforeGamesPlayed[player.id])
    }
  })

  test('abandon on a REOPENED game does not clobber the different live game that court now hosts', async ({ request }) => {
    // 8 players / 1 court: the four who sit out game 1 are the four the
    // queue's fewest-games-played fairness rule then picks for game 2, so
    // game 2 is a genuinely DIFFERENT occupancy of the same court.
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 8)
    const sessionCourtId = sessionCourts[0].id

    const firstAssignBody = await assignCourt(request, sessionId, sessionCourtId)
    const game1Id = (await (await startGame(request, sessionId, sessionCourtId, firstAssignBody, 'A')).json()).game.id
    await playSequence(request, sessionId, game1Id, Array(11).fill('A'))
    expect((await finishGame(request, sessionId, game1Id)).status()).toBe(200)

    const secondAssignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startGame2Response = await startGame(request, sessionId, sessionCourtId, secondAssignBody, 'A')
    expect(startGame2Response.status()).toBe(201)
    const game2 = (await startGame2Response.json()).game

    // A reopened game is `status = 'IN_PROGRESS'` again, which used to be
    // abandonGame's ONLY guard -- so abandoning it released whatever game was
    // physically on its court at that moment, i.e. game 2.
    expect((await reopenGame(request, sessionId, game1Id)).status()).toBe(200)

    const abandonResponse = await abandonGame(request, sessionId, game1Id)
    expect(abandonResponse.status()).toBe(200)
    const abandonBody = await abandonResponse.json()
    // Game 1 itself still transitions -- only the court-release side effect is
    // skipped, because that court is no longer game 1's to hand back.
    expect(abandonBody.game.status).toBe('ABANDONED')
    expect(abandonBody.releasedSessionPlayerIds).toEqual([])
    expect(abandonBody.requeued).toBe(false)

    // Game 2's occupancy is completely untouched: court status, team-court
    // binding, game status, and its players' PLAYING queue entries.
    const courtsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
    expect((await courtsResponse.json()).courts.find((c) => c.id === sessionCourtId).status).toBe('PLAYING')
    expect(teamIdsBoundToCourt(sessionCourtId)).toEqual([game2.teamAId, game2.teamBId].sort())

    const gamesResponse = await request.get(`/api/pickleball/sessions/${sessionId}/games`)
    expect((await gamesResponse.json()).games.find((g) => g.id === game2.id).status).toBe('IN_PROGRESS')

    const queueResponse = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const queue = (await queueResponse.json()).queue
    expect(queue.filter((e) => e.status === 'PLAYING')).toHaveLength(4)
  })

  test('finish on a game whose court was already released and reassigned skips the release without erroring', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 8)
    const sessionCourtId = sessionCourts[0].id

    const firstAssignBody = await assignCourt(request, sessionId, sessionCourtId)
    const game1Id = (await (await startGame(request, sessionId, sessionCourtId, firstAssignBody, 'A')).json()).game.id
    await playSequence(request, sessionId, game1Id, Array(11).fill('A'))

    // A facilitator releases the court out from under the still-unfinished
    // game 1 (releaseCourt accepts a PLAYING court), and the court is then
    // reassigned to game 2. Game 1's own finish call must NOT then fire its
    // release composition against game 2's occupancy.
    expect((await releaseCourt(request, sessionId, sessionCourtId)).status()).toBe(200)

    const secondAssignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startGame2Response = await startGame(request, sessionId, sessionCourtId, secondAssignBody, 'A')
    expect(startGame2Response.status()).toBe(201)
    const game2 = (await startGame2Response.json()).game

    const finishResponse = await finishGame(request, sessionId, game1Id)
    expect(finishResponse.status()).toBe(200)
    const finishBody = await finishResponse.json()
    expect(finishBody.game.status).toBe('FINISHED')
    expect(finishBody.finalScoreA).toBe(11)
    expect(finishBody.releasedSessionPlayerIds).toEqual([])
    expect(finishBody.requeued).toBe(false)

    const courtsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
    expect((await courtsResponse.json()).courts.find((c) => c.id === sessionCourtId).status).toBe('PLAYING')
    expect(teamIdsBoundToCourt(sessionCourtId)).toEqual([game2.teamAId, game2.teamBId].sort())

    const gamesResponse = await request.get(`/api/pickleball/sessions/${sessionId}/games`)
    expect((await gamesResponse.json()).games.find((g) => g.id === game2.id).status).toBe('IN_PROGRESS')

    // Game 2's four players still hold PLAYING entries; game 1's four are
    // still QUEUED from the facilitator's release, not swept up a second time.
    const queueResponse = await request.get(`/api/pickleball/sessions/${sessionId}/queue`)
    const queue = (await queueResponse.json()).queue
    expect(queue.filter((e) => e.status === 'PLAYING')).toHaveLength(4)
    expect(queue.filter((e) => e.status === 'QUEUED')).toHaveLength(4)
  })

  test('correction-only lifecycle: a reopened game blocks ordinary rallies, correct+re-finish succeeds without touching a later court reassignment', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'A')
    const gameId = (await startResponse.json()).game.id

    await playSequence(request, sessionId, gameId, Array(11).fill('A'))
    expect((await finishGame(request, sessionId, gameId)).status()).toBe(200)

    // finish auto-requeues (session default postGameRotationPolicy is
    // AUTO_REQUEUE_ALL) -- reassign the SAME court to a second, unrelated
    // game BEFORE touching game 1's history, so this test can prove the
    // reopen/correct/re-finish cycle below leaves that occupancy alone.
    const secondAssignBody = await assignCourt(request, sessionId, sessionCourtId)
    const secondStartResponse = await startGame(request, sessionId, sessionCourtId, secondAssignBody, 'A')
    expect(secondStartResponse.status()).toBe(201)
    const game2Id = (await secondStartResponse.json()).game.id

    const reopenResponse = await reopenGame(request, sessionId, gameId)
    expect(reopenResponse.status()).toBe(200)
    expect((await reopenResponse.json()).game.correctionPending).toBe(true)

    // Correction-pending blocks an ORDINARY rally -- a domain-level 409, not
    // an RBAC 403 (the caller here is the ADMIN, fully entitled to SCORE_GAME).
    const blockedRallyResponse = await rally(request, sessionId, gameId, 'A')
    expect(blockedRallyResponse.status()).toBe(409)
    expect((await blockedRallyResponse.json()).error).toContain('correction')

    const correctResponse = await correctGame(request, sessionId, gameId, { scoreA: 11, scoreB: 6, servingTeam: 'A', serverNumber: 1 })
    expect(correctResponse.status()).toBe(200)

    const refinishResponse = await finishGame(request, sessionId, gameId)
    expect(refinishResponse.status()).toBe(200)
    const refinishBody = await refinishResponse.json()
    expect(refinishBody.finalScoreA).toBe(11)
    expect(refinishBody.finalScoreB).toBe(6)
    // The re-finish path must NOT release a court (it was already released,
    // and reassigned, back when this game first finished).
    expect(refinishBody.releasedSessionPlayerIds).toEqual([])
    expect(refinishBody.requeued).toBe(false)

    // Game 2's court occupancy is untouched by game 1's reopen/correct/re-finish.
    const courtsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
    const court = (await courtsResponse.json()).courts.find((c) => c.id === sessionCourtId)
    expect(court.status).toBe('PLAYING')

    const gamesResponse = await request.get(`/api/pickleball/sessions/${sessionId}/games`)
    const game2 = (await gamesResponse.json()).games.find((g) => g.id === game2Id)
    expect(game2.status).toBe('IN_PROGRESS')
  })

  test('matchmaking_history is exactly right after a reopen -> correct -> re-finish cycle, not stale, doubled, or missing', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const gameId = (await (await startGame(request, sessionId, sessionCourtId, assignBody, 'A')).json()).game.id

    const matchmakingRows = () =>
      queryD1(`SELECT player_id, other_player_id, relation, pairing_count FROM matchmaking_history WHERE session_id = '${sessionId}'`)

    await playSequence(request, sessionId, gameId, Array(11).fill('A'))
    expect((await finishGame(request, sessionId, gameId)).status()).toBe(200)

    // Doubles, one game: 2 PARTNER pairs x 2 directions = 4, plus 2x2
    // OPPONENT pairs x 2 directions = 8. Every pair seen exactly once.
    const afterFirstFinish = matchmakingRows()
    expect(afterFirstFinish).toHaveLength(12)
    expect(afterFirstFinish.filter((r) => r.relation === 'PARTNER')).toHaveLength(4)
    expect(afterFirstFinish.filter((r) => r.relation === 'OPPONENT')).toHaveLength(8)
    expect(afterFirstFinish.every((r) => r.pairing_count === 1)).toBe(true)

    // Reopen: this game stops counting as FINISHED, so it contributes NOTHING
    // -- and it is this session's only game, so the table must be empty. The
    // recompute used to read `status = 'FINISHED'` live, BEFORE its own
    // batch's status transition committed, and so re-inserted all 12 rows it
    // was supposed to remove.
    expect((await reopenGame(request, sessionId, gameId)).status()).toBe(200)
    expect(matchmakingRows()).toHaveLength(0)

    expect((await correctGame(request, sessionId, gameId, { scoreA: 11, scoreB: 6, servingTeam: 'A', serverNumber: 1 })).status()).toBe(200)

    // Re-finish: the same 12 pairs come back, each still counted ONCE -- the
    // symmetric half of the same stale-read bug, which used to see the game as
    // not-yet-FINISHED and omit every one of them, leaving the table
    // permanently empty for this game with no rebuild path.
    expect((await finishGame(request, sessionId, gameId)).status()).toBe(200)
    const afterRefinish = matchmakingRows()
    expect(afterRefinish).toHaveLength(12)
    expect(afterRefinish.filter((r) => r.relation === 'PARTNER')).toHaveLength(4)
    expect(afterRefinish.filter((r) => r.relation === 'OPPONENT')).toHaveLength(8)
    expect(afterRefinish.every((r) => r.pairing_count === 1)).toBe(true)
    // Same pair set as the original finish, not a different or partial one.
    const pairKey = (r) => `${r.player_id}|${r.other_player_id}|${r.relation}`
    expect(afterRefinish.map(pairKey).sort()).toEqual(afterFirstFinish.map(pairKey).sort())
  })

  test('serving-player derivation: rally responses report the correct currently-serving player through SIDE_OUT and SERVE_CHANGED transitions', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const [a1, a2] = assignBody.teamA.players.map((p) => p.sessionPlayerId)
    const [b1, b2] = assignBody.teamB.players.map((p) => p.sessionPlayerId)

    const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
      data: {
        sessionCourtId,
        servingTeam: 'B',
        teamAStartingServerSessionPlayerId: a1,
        teamBStartingServerSessionPlayerId: b1,
      },
    })
    expect(startResponse.status()).toBe(201)
    const gameId = (await startResponse.json()).game.id

    // Doubles always OPENS at server 2 (initialGameState), so the very FIRST
    // receiving-team win is unavoidably an immediate SIDE_OUT -- there is no
    // way to reach a SERVE_CHANGED transition before the first side-out has
    // happened at least once. This sequence demonstrates SIDE_OUT, then
    // SERVE_CHANGED, then a second SIDE_OUT, with servingPlayerId rotating
    // correctly through all three (per serverRotation.ts's nextServerIdentity).
    const rally1 = await rally(request, sessionId, gameId, 'A') // B serving/server 2, A wins -> SIDE_OUT
    expect(rally1.status()).toBe(200)
    const rally1Body = await rally1.json()
    expect(rally1Body.outcome).toBe('SIDE_OUT')
    expect(rally1Body.servingPlayerId).toBe(a2)

    const rally2 = await rally(request, sessionId, gameId, 'B') // A serving/server 1, B wins -> SERVE_CHANGED
    expect(rally2.status()).toBe(200)
    const rally2Body = await rally2.json()
    expect(rally2Body.outcome).toBe('SERVE_CHANGED')
    expect(rally2Body.servingPlayerId).toBe(a1)

    const rally3 = await rally(request, sessionId, gameId, 'B') // A serving/server 2, B wins -> SIDE_OUT
    expect(rally3.status()).toBe(200)
    const rally3Body = await rally3.json()
    expect(rally3Body.outcome).toBe('SIDE_OUT')
    expect(rally3Body.servingPlayerId).toBe(b2)
  })

  test('RBAC: a SCOREKEEPER needs a session-operator grant for start/rally/finish, and can never reopen or correct', async ({ request }) => {
    const { sessionId, sessionCourts, activeOrgId } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)

    const scorekeeperEmail = `scorekeeper-games-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
    await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
      data: { invitedEmail: scorekeeperEmail, role: 'SCOREKEEPER' },
    })

    await request.post('/api/pickleball/auth/test-login', { data: { email: scorekeeperEmail } })
    const scorekeeperSessionResponse = await request.get('/api/pickleball/auth/session')
    const scorekeeperUserId = (await scorekeeperSessionResponse.json()).userId

    // Without a grant: SCORE_GAME/FINISH_GAME are ROLE permissions SCOREKEEPER
    // does hold, but the session-scoped operator grant is a SEPARATE gate --
    // start/rally/finish must all still 403. The role/grant check happens
    // before any gameId lookup in every one of these routes, so a bogus
    // gameId for rally/finish is fine here.
    expect((await startGame(request, sessionId, sessionCourtId, assignBody, 'A')).status()).toBe(403)
    expect((await rally(request, sessionId, 'nonexistent-game-id', 'A')).status()).toBe(403)
    expect((await finishGame(request, sessionId, 'nonexistent-game-id')).status()).toBe(403)

    // Grant, issued by the ADMIN (who holds MANAGE_SESSIONS).
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
    const grantResponse = await request.post(`/api/pickleball/sessions/${sessionId}/operators/grant`, {
      data: { userId: scorekeeperUserId },
    })
    expect(grantResponse.status()).toBe(200)

    await request.post('/api/pickleball/auth/test-login', { data: { email: scorekeeperEmail } })

    // The court is still just ASSIGNED (the no-grant start attempt above
    // 403'd before ever reaching the DO), so the same assignBody is reusable.
    const startWithGrantResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'A')
    expect(startWithGrantResponse.status()).toBe(201)
    const gameId = (await startWithGrantResponse.json()).game.id

    expect((await rally(request, sessionId, gameId, 'A')).status()).toBe(200)
    await playSequence(request, sessionId, gameId, Array(10).fill('A'))
    expect((await finishGame(request, sessionId, gameId)).status()).toBe(200)

    // REOPEN_GAME/CORRECT_GAME are never held by SCOREKEEPER at all -- no
    // grant can unlock them, unlike SCORE_GAME/FINISH_GAME above.
    expect((await reopenGame(request, sessionId, gameId)).status()).toBe(403)
    expect((await correctGame(request, sessionId, gameId, { scoreA: 5, scoreB: 5, servingTeam: 'A', serverNumber: 1 })).status()).toBe(403)
  })

  // Phase 5 (Performance/OPI): proves player_performance_snapshots stays in
  // sync with player_game_stats across the full finish -> reopen -> correct
  // -> re-finish cycle, all inside the SAME db.batch() as the write/delete
  // that changed player_game_stats (SessionCoordinatorDO's finishGame and
  // reopenGame). GET /api/pickleball/players/:id/stats is built by Task 7 of
  // this same plan and does not exist yet, so this is written against its
  // documented contract and skipped until that route lands.
  // enabled once Task 7's GET /api/pickleball/players/:id/stats route exists
  test.skip('finishing a game creates a snapshot, reopening it removes the snapshot contribution, and re-finishing restores it', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const assignBody = await assignCourt(request, sessionId, sessionCourtId)
    const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'A')
    expect(startResponse.status()).toBe(201)
    const gameId = (await startResponse.json()).game.id
    const teamAPlayerIds = assignBody.teamA.players.map((p) => p.playerId)

    await playSequence(request, sessionId, gameId, Array(11).fill('A'))
    const finishResponse = await finishGame(request, sessionId, gameId)
    expect(finishResponse.ok()).toBe(true)

    const beforeReopen = await request.get(`/api/pickleball/players/${teamAPlayerIds[0]}/stats`)
    expect((await beforeReopen.json()).allTime.eligibleGamesCount).toBe(1)

    await reopenGame(request, sessionId, gameId)
    const afterReopen = await request.get(`/api/pickleball/players/${teamAPlayerIds[0]}/stats`)
    const afterReopenBody = await afterReopen.json()
    expect(afterReopenBody.allTime).toBeNull()

    await correctGame(request, sessionId, gameId, { scoreA: 11, scoreB: 3, servingTeam: 'A', serverNumber: 2 })
    const refinishResponse = await finishGame(request, sessionId, gameId)
    expect(refinishResponse.ok()).toBe(true)

    const afterRefinish = await request.get(`/api/pickleball/players/${teamAPlayerIds[0]}/stats`)
    const afterRefinishBody = await afterRefinish.json()
    expect(afterRefinishBody.allTime.eligibleGamesCount).toBe(1)
    expect(afterRefinishBody.allTime.opi).toBeCloseTo((11 / 14) * 100, 5)
  })

  // Phase 5 (Performance/OPI), Task 5: proves assignCourt's real OPI-balanced
  // pairing (queueEngine.ts's balanceTeams, wired in by this same task)
  // actually drives court assignment end-to-end -- not just the isolated
  // unit test. Two throwaway players are seeded, TOGETHER as one team, to a
  // real ALL_TIME opi of 100 (a clean 11-0 shutout win), and two more,
  // together as one team, to a real ALL_TIME opi of 0 (a clean 0-11 shutout
  // loss) -- via just two isolated one-off seeding sessions (not four; the
  // two players sharing each seeding game don't need to be kept apart from
  // each other, only from the OTHER pair's seeding game and from the later
  // shared session, so pairing them up here keeps this test's own request
  // volume down against the local D1 concurrency this file's header already
  // documents as fragile under parallel workers). player_performance_snapshots
  // is keyed by player_id alone (playerPerformanceSnapshots.js's
  // getPlayerSnapshot takes no session filter), so those snapshots persist
  // and are visible from a completely different session afterward -- exactly
  // what assignCourt's getPlayerSnapshot(db, player.playerId, 'ALL_TIME',
  // null) call reads.
  test('assignCourt splits players by real OPI balance, not queue order', async ({ request }) => {
    function uniqueName(prefix) {
      return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2)}`
    }

    async function createThrowawaySession() {
      await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
      const venueResponse = await request.post('/api/pickleball/venues', { data: { name: uniqueName('Balance Venue') } })
      expect(venueResponse.ok()).toBe(true)
      const venueId = (await venueResponse.json()).venue.id
      const courtResponse = await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
      expect(courtResponse.ok()).toBe(true)
      const sessionResponse = await request.post('/api/pickleball/sessions', {
        data: {
          venueId,
          name: uniqueName('Balance Session'),
          sessionType: 'OPEN_PLAY',
          scoringRulesetId: 'usap-2026-sideout-11-doubles',
          scheduledStart: '2026-08-30T18:00:00.000Z',
          scheduledEnd: '2026-08-30T22:00:00.000Z',
        },
      })
      expect(sessionResponse.ok()).toBe(true)
      const sessionId = (await sessionResponse.json()).session.id
      await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
      await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
      const courtsListResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts`)
      const sessionCourtId = (await courtsListResponse.json()).courts[0].id
      return { sessionId, sessionCourtId }
    }

    // Creates one brand-new player and registers/checks-in/queues it into
    // `sessionId`, in that call order -- matching createLiveSessionWithPlayers'
    // own per-player sequence above. Returns both ids: callers need `playerId`
    // to re-register the SAME underlying player into a later session, and
    // `sessionPlayerId` to queue/assign it in THIS one.
    async function createAndQueuePlayer(sessionId, label) {
      const playerResponse = await request.post('/api/pickleball/players', { data: { displayName: uniqueName(label) } })
      expect(playerResponse.ok()).toBe(true)
      const playerId = (await playerResponse.json()).player.id
      const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
      expect(registerResponse.ok()).toBe(true)
      const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
      await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
      await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
      return { playerId, sessionPlayerId }
    }

    // Seeds TWO players, as partners on the same team, to a real ALL_TIME opi
    // of 100 (`won: true`) or 0 (`won: false`) via one isolated, throwaway
    // session -- a clean 11-0 shutout either way. The two targets are always
    // queued FIRST among 4 brand-new (opi-default-50) players, so
    // assignCourt's own degenerate tie (every candidate at 50 -- see
    // balanceTeams' partitions[0]-wins-ties fallback) deterministically seats
    // BOTH of them on team A together; `won` then just picks which team
    // serves and sweeps every rally.
    async function seedAllTimeOpiPair(won, label) {
      const { sessionId, sessionCourtId } = await createThrowawaySession()
      const target1 = await createAndQueuePlayer(sessionId, `${label} Target1`)
      const target2 = await createAndQueuePlayer(sessionId, `${label} Target2`)
      await createAndQueuePlayer(sessionId, `${label} OppA`)
      await createAndQueuePlayer(sessionId, `${label} OppB`)

      const assignBody = await assignCourt(request, sessionId, sessionCourtId)
      const servingTeam = won ? 'A' : 'B'
      const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, servingTeam)
      expect(startResponse.status()).toBe(201)
      const gameId = (await startResponse.json()).game.id

      await playSequence(request, sessionId, gameId, Array(11).fill(servingTeam))
      expect((await finishGame(request, sessionId, gameId)).status()).toBe(200)

      return [target1.playerId, target2.playerId]
    }

    const [winner1, winner2] = await seedAllTimeOpiPair(true, 'Winners')
    const [loser1, loser2] = await seedAllTimeOpiPair(false, 'Losers')

    const { sessionId, sessionCourtId } = await createThrowawaySession()

    async function registerExisting(playerId) {
      const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
      expect(registerResponse.ok()).toBe(true)
      const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
      await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
      await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
      return sessionPlayerId
    }

    // Registration order IS queue order here (each call queues immediately
    // after registering), and every one of these session_players starts at
    // games_played = 0 regardless of what the underlying player did in its
    // own throwaway session above -- so selectNextPlayers' fairness selection
    // ties on games_played and falls straight through to its queue-order
    // tiebreak, in exactly this sequence: [winner1, winner2, loser1, loser2].
    const winner1SessionPlayerId = await registerExisting(winner1)
    const winner2SessionPlayerId = await registerExisting(winner2)
    const loser1SessionPlayerId = await registerExisting(loser1)
    const loser2SessionPlayerId = await registerExisting(loser2)

    const assignResponse = await assignCourt(request, sessionId, sessionCourtId)
    expect(assignResponse.ok).toBe(true)

    const teamsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourtId}/teams`)
    expect(teamsResponse.status()).toBe(200)
    const teams = (await teamsResponse.json()).teams
    expect(teams).toHaveLength(2)

    const memberSets = teams.map((team) => team.members.map((m) => m.sessionPlayerId).sort())
    // The old placeholder midpoint split would have grouped [winner1, winner2]
    // (both opi 100) against [loser1, loser2] (both opi 0) -- a maximally
    // lopsided 200-vs-0 "team". The real balanceTeams instead finds the
    // OPI-neutral partition (100 vs 100): one winner paired with one loser on
    // each side. Per balanceTeams' own tie-break order (queueEngine.ts checks
    // [a,c|b,d] -- strictly beating the first partition's 200-vs-0 diff --
    // before its equally-good [a,d|b,c] partition is ever reached, and a tie
    // never overwrites the current best), that partition is specifically
    // [winner1, loser1] vs [winner2, loser2].
    expect(memberSets).toContainEqual([winner1SessionPlayerId, loser1SessionPlayerId].sort())
    expect(memberSets).toContainEqual([winner2SessionPlayerId, loser2SessionPlayerId].sort())
  })

  // Phase 5 (Performance/OPI), Task 6: proves assignCourt's repeat-avoidance
  // tiebreak (queueEngine.ts's selectNextPlayers 4th argument, wired in by
  // this task from a real matchmaking_history read) actually stops a pair
  // who just finished a game together from being re-selected together --
  // not just the isolated unit test.
  //
  // Setup, in order:
  //   1. TargetA/TargetB finish a real doubles game as PARTNERS (the same
  //      OPI-tie first-partition-wins convention the test above documents
  //      deterministically seats the first two queued players, TargetA and
  //      TargetB, on the same team), creating a real matchmaking_history
  //      PARTNER row scoped to this session. AUTO_REQUEUE_ALL (this
  //      session's default policy) puts both straight back in the queue.
  //   2. Their two opponents are removed from the queue entirely with
  //      queue/leave. This isn't cleanup -- it's load-bearing: those
  //      opponents' same-timestamp OPPONENT rows against TargetA/TargetB
  //      would otherwise sit in matchmaking_history at the exact same
  //      last_game_at as the TargetA/TargetB PARTNER row, and nothing in
  //      this test wants to depend on how SQLite orders a tie there.
  //      Excluding them from the eligible pool entirely sidesteps the
  //      question: assignCourt's own query only resolves relations between
  //      CURRENTLY eligible candidates, so an excluded player's rows never
  //      match.
  //   3. A completely unrelated player, SpareKeeper, is separately seeded to
  //      the SAME games_played value (1) via its own isolated throwaway
  //      game -- its own disposable opponents removed the same way -- so it
  //      carries no matchmaking_history relation to anyone still eligible.
  //      It's the one clean, equally-tied candidate the tiebreak can swap
  //      in.
  //   4. Two brand-new, never-played players (games_played 0) are added
  //      last, purely to occupy the two fewest-games slots ahead of the
  //      tied group. Without the tiebreak, fairness selection alone would
  //      land on exactly [Fresh1, Fresh2, TargetA, TargetB] -- reproducing
  //      the exact repeat pairing this task exists to prevent.
  test('assignCourt avoids reselecting two players who just finished a game together', async ({ request }) => {
    test.setTimeout(120_000)

    function uniqueName(prefix) {
      return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2)}`
    }

    async function addQueuedPlayer(sessionId, label) {
      const playerResponse = await request.post('/api/pickleball/players', { data: { displayName: uniqueName(label) } })
      expect(playerResponse.ok()).toBe(true)
      const playerId = (await playerResponse.json()).player.id
      const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
      expect(registerResponse.ok()).toBe(true)
      const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
      await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
      await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
      return sessionPlayerId
    }

    async function leaveTheQueue(sessionId, sessionPlayerId) {
      const response = await request.post(`/api/pickleball/sessions/${sessionId}/queue/leave`, { data: { sessionPlayerId } })
      expect(response.ok()).toBe(true)
    }

    // Plays a full 4-player doubles game (team A sweeping every rally) to a
    // clean 11-0 finish on the given court, using this file's own
    // startGame/playSequence/finishGame helpers exactly as the happy-path
    // test above does.
    async function playFullGame(sessionId, sessionCourtId, assignBody) {
      const startResponse = await startGame(request, sessionId, sessionCourtId, assignBody, 'A')
      expect(startResponse.status()).toBe(201)
      const gameId = (await startResponse.json()).game.id
      await playSequence(request, sessionId, gameId, Array(11).fill('A'))
      const finishResponse = await finishGame(request, sessionId, gameId)
      expect(finishResponse.status()).toBe(200)
    }

    // Step 1: TargetA/TargetB finish a doubles game as partners.
    const { sessionId, sessionCourts, sessionPlayerIds } = await createLiveSessionWithPlayers(request, 4)
    const sessionCourtId = sessionCourts[0].id
    const [targetASessionPlayerId, targetBSessionPlayerId, throwCSessionPlayerId, throwDSessionPlayerId] = sessionPlayerIds

    const assignBody1 = await assignCourt(request, sessionId, sessionCourtId)
    // Sanity-check the premise before relying on it: TargetA/TargetB really
    // did land on the same team (the OPI-tie first-partition-wins
    // convention documented on the test above).
    const team1MemberSets = [assignBody1.teamA, assignBody1.teamB].map((t) => t.players.map((p) => p.sessionPlayerId).sort())
    expect(team1MemberSets).toContainEqual([targetASessionPlayerId, targetBSessionPlayerId].sort())

    await playFullGame(sessionId, sessionCourtId, assignBody1)

    // Step 2: remove their opponents from the queue entirely.
    await leaveTheQueue(sessionId, throwCSessionPlayerId)
    await leaveTheQueue(sessionId, throwDSessionPlayerId)

    // Step 3: seed one completely unrelated player, SpareKeeper, to the same
    // games_played value via its own isolated throwaway game.
    const spareKeeperSessionPlayerId = await addQueuedPlayer(sessionId, 'Spare Keeper')
    const disposableSessionPlayerIds = [
      await addQueuedPlayer(sessionId, 'Disposable 1'),
      await addQueuedPlayer(sessionId, 'Disposable 2'),
      await addQueuedPlayer(sessionId, 'Disposable 3'),
    ]
    // All four are the only games_played=0 candidates in the pool right now
    // (TargetA/TargetB are already at 1), so this assignCourt call is
    // guaranteed to seat exactly this foursome regardless of any tiebreak.
    const assignBody2 = await assignCourt(request, sessionId, sessionCourtId)
    await playFullGame(sessionId, sessionCourtId, assignBody2)
    for (const disposableSessionPlayerId of disposableSessionPlayerIds) {
      await leaveTheQueue(sessionId, disposableSessionPlayerId)
    }

    // Step 4: two brand-new, never-played players join last.
    const fresh1SessionPlayerId = await addQueuedPlayer(sessionId, 'Fresh1')
    const fresh2SessionPlayerId = await addQueuedPlayer(sessionId, 'Fresh2')

    // The eligible pool is now exactly 5: Fresh1/Fresh2 (0 games), and
    // TargetA/TargetB/SpareKeeper (1 game each, tied) -- the repeat-avoidance
    // tiebreak's own 5-candidate degradation threshold, satisfied for real.
    const finalAssignResponse = await assignCourt(request, sessionId, sessionCourtId)
    expect(finalAssignResponse.ok).toBe(true)

    const teamsResponse = await request.get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourtId}/teams`)
    expect(teamsResponse.status()).toBe(200)
    const teams = (await teamsResponse.json()).teams
    const selectedSessionPlayerIds = teams.flatMap((team) => team.members.map((m) => m.sessionPlayerId))

    // Without the tiebreak, fairness selection alone (fewest games played,
    // then longest wait) would have picked exactly [Fresh1, Fresh2, TargetA,
    // TargetB] -- re-pairing the two players who just played together. The
    // tiebreak instead swaps TargetB out for SpareKeeper (the one equally
    // -tied, conflict-free candidate): TargetA is still selected (rule 1/2
    // is never overridden), but TargetB is not, so the two of them are never
    // selected together again.
    expect(selectedSessionPlayerIds).toContain(targetASessionPlayerId)
    expect(selectedSessionPlayerIds).toContain(fresh1SessionPlayerId)
    expect(selectedSessionPlayerIds).toContain(fresh2SessionPlayerId)
    expect(selectedSessionPlayerIds).toContain(spareKeeperSessionPlayerId)
    expect(selectedSessionPlayerIds).not.toContain(targetBSessionPlayerId)
  })
})
