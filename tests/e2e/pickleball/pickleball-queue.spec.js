import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'

// Mirrors scripts/pickleball/apply-e2e-fixtures.mjs's wrangler-bin resolution:
// invoked as a plain JS entry under the current node binary rather than via
// `npx`, since Node refuses to spawn a Windows `.cmd` shim without `shell:
// true` (EINVAL), and a shell would only add path-quoting problems here.
function resolveWranglerBin() {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js')
}

// Phase 3 has no API route that transitions a session's status, and none that
// creates `session_courts` rows — confirmed by grep across
// src/pages/api/pickleball, and independently confirmed in Task 6's and Task
// 7's own verification reports, which call this out explicitly as an accepted
// gap ("session_courts and the session LIVE status transition have no API
// route yet ... those belong to later tasks per the plan") and work around it
// in their own manual HTTP verification the same way this does: writing
// directly to local D1 via `wrangler d1 execute --local` while `wrangler dev`
// is already running. This is the one piece of setup no route in this phase
// can perform, so it is done here exactly once per fixture (a single batched
// `--file` execution, not one call per statement) to keep the number of
// external writes against the shared SQLite file as small as possible.
//
// Measured directly while writing this spec: this second process racing
// wrangler dev's own open handle on the same SQLite file intermittently fails
// with `SQLITE_BUSY: database is locked` — a transient lock-contention error
// from two processes touching one file, not anything to do with the code
// under test. A short retry-with-backoff is the correct, honest response to
// that specific error; anything else (e.g. treating a resulting test failure
// as a DO concurrency signal) would be misdiagnosing infrastructure flakiness
// as a product bug. This retry loop must NEVER swallow any other error.
function applyDirectD1Sql(sql, attemptsRemaining = 5) {
  const sqlPath = join(mkdtempSync(join(tmpdir(), 'pb-queue-e2e-')), 'setup.sql')
  writeFileSync(sqlPath, sql, 'utf8')

  try {
    execFileSync(
      process.execPath,
      [resolveWranglerBin(), 'd1', 'execute', 'devlab-pickleball', '--local', `--file=${sqlPath}`],
      { stdio: 'pipe', windowsHide: true },
    )
  } catch (error) {
    const output = `${error?.stdout || ''}${error?.stderr || ''}`
    const isLockContention = output.includes('SQLITE_BUSY') || output.includes('database is locked')
    if (!isLockContention || attemptsRemaining <= 1) throw error

    const backoffMs = 200 * (6 - attemptsRemaining)
    const deadline = Date.now() + backoffMs
    while (Date.now() < deadline) {
      // Synchronous busy-wait: execFileSync's call site here has no
      // async-friendly retry path, and the backoff windows involved (200ms
      // to 1s total) are short enough that this is not worth restructuring
      // every caller to async/await around a setTimeout for.
    }
    applyDirectD1Sql(sql, attemptsRemaining - 1)
  }
}

async function createSessionWithCheckedInPlayers(request, playerCount) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const venueResponse = await request.post('/api/pickleball/venues', {
    data: { name: `Queue Test Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
  })
  const venueId = (await venueResponse.json()).venue.id

  const courtIds = []
  for (let i = 0; i < 2; i += 1) {
    const courtResponse = await request.post('/api/pickleball/courts', { data: { venueId, name: `Court ${i + 1}` } })
    courtIds.push((await courtResponse.json()).court.id)
  }

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
  const sessionId = (await sessionResponse.json()).session.id

  // SessionCoordinatorDO.assignCourt requires session.status === 'LIVE'
  // (SessionCoordinatorDO.ts:72), and assignCourt/replaceAssignedPlayer/
  // releaseCourt all require an existing session_courts row for the court in
  // question (getSessionCourt lookups). Neither can be produced through the
  // API in this phase, so both are set directly below.
  const timestamp = new Date().toISOString()
  const sessionCourtInserts = courtIds
    .map((courtId) => {
      const sessionCourtId = crypto.randomUUID()
      return `INSERT INTO session_courts (id, session_id, court_id, enabled, status, created_at, updated_at) VALUES ('${sessionCourtId}', '${sessionId}', '${courtId}', 1, 'AVAILABLE', '${timestamp}', '${timestamp}');`
    })
    .join('\n')
  applyDirectD1Sql(
    `UPDATE pickleball_sessions SET status = 'LIVE', updated_at = '${timestamp}' WHERE id = '${sessionId}';\n${sessionCourtInserts}`,
  )

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

// Serial rather than fullyParallel: each test's setup shells out once to
// `wrangler d1 execute --local` against the same local D1 SQLite file that
// the already-running `wrangler dev` webServer has open (see
// applyDirectD1Sql above and apply-e2e-fixtures.mjs's header comment on why
// that combination is risky under concurrent load). Serializing this file's
// tests keeps those writes from overlapping each other; it does not affect
// the CONCURRENCY test below, whose two simultaneous requests are ordinary
// HTTP calls into the already-running worker, not D1 writes from a second
// process.
test.describe.configure({ mode: 'serial' })

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
