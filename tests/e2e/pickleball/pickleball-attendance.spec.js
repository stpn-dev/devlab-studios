import { test, expect } from '@playwright/test'
import { ORG_B_ID, ORG_B_ADMIN_EMAIL, ORG_B_RULESET_ID, GLOBAL_RULESET_ID } from '../../../scripts/pickleball/apply-e2e-fixtures.mjs'

test.describe('Pickleball attendance', () => {
  let venueId
  let sessionId
  let playerId

  test.beforeEach(async ({ request }) => {
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

    const venueResponse = await request.post('/api/pickleball/venues', {
      data: { name: 'Attendance Test Venue' },
    })
    venueId = (await venueResponse.json()).venue.id

    const sessionResponse = await request.post('/api/pickleball/sessions', {
      data: {
        venueId,
        name: 'Attendance Test Session',
        sessionType: 'OPEN_PLAY',
        scoringRulesetId: 'usap-2026-sideout-11-doubles',
        scheduledStart: '2026-08-30T18:00:00.000Z',
        scheduledEnd: '2026-08-30T22:00:00.000Z',
      },
    })
    sessionId = (await sessionResponse.json()).session.id

    const playerResponse = await request.post('/api/pickleball/players', {
      data: { displayName: `Attendance Player ${Date.now()}` },
    })
    playerId = (await playerResponse.json()).player.id
  })

  test('a registered player cannot check in twice, and check-in state is reflected correctly in counts', async ({ request }) => {
    const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
    expect(registerResponse.status()).toBe(201)

    const listBefore = await request.get(`/api/pickleball/sessions/${sessionId}/players`)
    const bodyBefore = await listBefore.json()
    expect(bodyBefore.counts.registered).toBe(1)
    expect(bodyBefore.counts.notArrived).toBe(1)
    expect(bodyBefore.counts.checkedIn).toBe(0)

    const checkInResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    expect(checkInResponse.status()).toBe(200)
    const checkedInBody = await checkInResponse.json()
    expect(checkedInBody.sessionPlayer.attendanceStatus).toBe('CHECKED_IN')

    const secondCheckIn = await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    expect(secondCheckIn.status()).toBe(409)

    const listAfter = await request.get(`/api/pickleball/sessions/${sessionId}/players`)
    const bodyAfter = await listAfter.json()
    expect(bodyAfter.counts.checkedIn).toBe(1)
    expect(bodyAfter.counts.notArrived).toBe(0)
  })

  test('late arrival: check-in timestamp is set at check-in time, not registration time', async ({ request }) => {
    await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
    const before = Date.now()
    const checkInResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    const body = await checkInResponse.json()
    const checkedInAtMs = new Date(body.sessionPlayer.checkedInAt).getTime()
    expect(checkedInAtMs).toBeGreaterThanOrEqual(before)
  })

  test('bulk check-in is idempotent and skips ineligible players', async ({ request }) => {
    const secondPlayerResponse = await request.post('/api/pickleball/players', { data: { displayName: `Bulk Player ${Date.now()}` } })
    const secondPlayerId = (await secondPlayerResponse.json()).player.id

    await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId: secondPlayerId } })

    const firstBulk = await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in-bulk`, {
      data: { playerIds: [playerId, secondPlayerId] },
    })
    const firstBody = await firstBulk.json()
    expect(firstBody.checkedInPlayerIds.sort()).toEqual([playerId, secondPlayerId].sort())

    const secondBulk = await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in-bulk`, {
      data: { playerIds: [playerId, secondPlayerId] },
    })
    const secondBody = await secondBulk.json()
    expect(secondBody.checkedInPlayerIds).toEqual([])
  })

  // bulkCheckIn's eligibility SELECT binds 1 + playerIds.length parameters and
  // D1 caps bound parameters at 100, so the schema caps the array at 90. Past
  // that the request must fail as a clean validation error, not as a raw D1
  // error surfaced through the route's generic catch as a 500.
  test('bulk check-in rejects an over-limit playerIds array with a 400 validation error', async ({ request }) => {
    const tooManyIds = Array.from({ length: 91 }, () => crypto.randomUUID())

    const response = await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in-bulk`, {
      data: { playerIds: tooManyIds },
    })
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body.error).toBe('Validation failed.')
    expect(Array.isArray(body.issues)).toBe(true)
    expect(body.issues.length).toBeGreaterThan(0)
    expect(body.issues[0].path).toEqual(['playerIds'])

    // ...while exactly 90 ids is still accepted by validation (none of these
    // are registered, so the repository simply reports nothing checked in).
    const atLimit = await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in-bulk`, {
      data: { playerIds: Array.from({ length: 90 }, () => crypto.randomUUID()) },
    })
    expect(atLimit.status()).toBe(200)
    expect((await atLimit.json()).checkedInPlayerIds).toEqual([])
  })

  test('availability requires check-in first, then transitions correctly', async ({ request }) => {
    await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })

    const beforeCheckIn = await request.post(`/api/pickleball/sessions/${sessionId}/players/availability`, {
      data: { playerId, status: 'RESTING' },
    })
    expect(beforeCheckIn.status()).toBe(409)

    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })

    const afterCheckIn = await request.post(`/api/pickleball/sessions/${sessionId}/players/availability`, {
      data: { playerId, status: 'RESTING' },
    })
    expect(afterCheckIn.status()).toBe(200)
    const body = await afterCheckIn.json()
    expect(body.sessionPlayer.availabilityStatus).toBe('RESTING')
  })

  test('a player who leaves is excluded from checked-in counts and cannot re-check-in without facilitator override', async ({ request }) => {
    await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })

    const leaveResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players/leave`, { data: { playerId } })
    expect(leaveResponse.status()).toBe(200)

    const list = await request.get(`/api/pickleball/sessions/${sessionId}/players`)
    const body = await list.json()
    expect(body.counts.leftSession).toBe(1)
    expect(body.counts.checkedIn).toBe(0)

    const reCheckIn = await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    expect(reCheckIn.status()).toBe(409)
  })

  test('cancelling a registration before check-in works; cancelling after check-in is rejected', async ({ request }) => {
    await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })

    const cancelResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players/cancel`, { data: { playerId } })
    expect(cancelResponse.status()).toBe(200)

    const secondPlayerResponse = await request.post('/api/pickleball/players', { data: { displayName: `Cancel Player ${Date.now()}` } })
    const secondPlayerId = (await secondPlayerResponse.json()).player.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId: secondPlayerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId: secondPlayerId } })

    const cancelAfterCheckIn = await request.post(`/api/pickleball/sessions/${sessionId}/players/cancel`, { data: { playerId: secondPlayerId } })
    expect(cancelAfterCheckIn.status()).toBe(409)
  })

  test('a SCOREKEEPER cannot check in players', async ({ request }) => {
    const sessionResponse = await request.get('/api/pickleball/auth/session')
    const { activeOrgId } = await sessionResponse.json()

    await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
      data: { invitedEmail: 'scorekeeper-attendance@example.com', role: 'SCOREKEEPER' },
    })
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'scorekeeper-attendance@example.com' } })

    const response = await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    expect(response.status()).toBe(403)
  })
})

// session_players carries no organization_id: tenancy is transitive through
// session_id, and the player_id FK only proves the player row exists. That made
// the register route the one place in this phase where a caller could name
// another org's row and have it accepted — so it gets its own isolation spec,
// mirroring the Phase 1 cross-organization block in pickleball-crud.spec.js.
// Org B and its ADMIN are seeded by scripts/pickleball/apply-e2e-fixtures.mjs
// (there is no org-creation API by design), which playwright.config.js runs
// before `wrangler dev` starts; the ids come from that same module.
test.describe('Pickleball attendance cross-organization isolation', () => {
  test('org B cannot register org A players into its own session', async ({ playwright, baseURL }) => {
    // Two cookie jars — both orgs use the same session cookie name, so one
    // request context could only ever hold a single identity.
    const orgA = await playwright.request.newContext({ baseURL })
    const orgB = await playwright.request.newContext({ baseURL })

    try {
      const orgALogin = await orgA.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
      expect(orgALogin.ok()).toBe(true)
      const { activeOrgId: orgAId } = await orgALogin.json()

      const orgBLogin = await orgB.post('/api/pickleball/auth/test-login', { data: { email: ORG_B_ADMIN_EMAIL } })
      expect(orgBLogin.ok()).toBe(true)
      const { activeOrgId: orgBId } = await orgBLogin.json()

      expect(orgBId).toBe(ORG_B_ID)
      expect(orgBId).not.toBe(orgAId)

      // --- Org A: a venue, a session, and a player of its own ---
      const orgAVenue = await orgA.post('/api/pickleball/venues', {
        data: { name: 'Org A Attendance Venue', address: '1 A St', timezone: 'America/Denver' },
      })
      expect(orgAVenue.ok()).toBe(true)
      const orgAVenueId = (await orgAVenue.json()).venue.id

      const orgASession = await orgA.post('/api/pickleball/sessions', {
        data: {
          venueId: orgAVenueId,
          name: 'Org A Attendance Session',
          sessionType: 'OPEN_PLAY',
          scoringRulesetId: GLOBAL_RULESET_ID,
          scheduledStart: '2026-09-02T18:00:00.000Z',
          scheduledEnd: '2026-09-02T22:00:00.000Z',
        },
      })
      expect(orgASession.ok()).toBe(true)
      const orgASessionId = (await orgASession.json()).session.id

      // A distinctive display name, so the PII assertion below cannot pass by
      // coincidence against some other org's roster entry.
      const orgAPlayerName = `Org A Confidential Player ${Date.now()}`
      const orgAPlayer = await orgA.post('/api/pickleball/players', { data: { displayName: orgAPlayerName } })
      expect(orgAPlayer.ok()).toBe(true)
      const orgAPlayerId = (await orgAPlayer.json()).player.id

      // Org A can of course register its own player into its own session.
      const orgAOwnRegister = await orgA.post(`/api/pickleball/sessions/${orgASessionId}/players`, {
        data: { playerId: orgAPlayerId },
      })
      expect(orgAOwnRegister.status()).toBe(201)

      // --- Org B: a venue and session of its own, via the CRUD API ---
      const orgBVenue = await orgB.post('/api/pickleball/venues', {
        data: { name: 'Org B Attendance Venue', address: '1 B St', timezone: 'America/Denver' },
      })
      expect(orgBVenue.ok()).toBe(true)
      const orgBVenueId = (await orgBVenue.json()).venue.id

      const orgBSession = await orgB.post('/api/pickleball/sessions', {
        data: {
          venueId: orgBVenueId,
          name: 'Org B Attendance Session',
          sessionType: 'OPEN_PLAY',
          scoringRulesetId: ORG_B_RULESET_ID,
          scheduledStart: '2026-09-02T18:00:00.000Z',
          scheduledEnd: '2026-09-02T22:00:00.000Z',
        },
      })
      expect(orgBSession.status()).toBe(201)
      const orgBSessionId = (await orgBSession.json()).session.id

      // Regression guard for the cross-tenant IDOR on playerId: org B owns the
      // session here, so the ownership check on session_id passes and a 400 can
      // only come from the player tenancy check.
      const smuggled = await orgB.post(`/api/pickleball/sessions/${orgBSessionId}/players`, {
        data: { playerId: orgAPlayerId },
      })
      expect(smuggled.status()).toBe(400)
      expect((await smuggled.json()).error).toBe('Player not found in this organization.')

      // The actual leak this prevents: listSessionPlayers JOINs players and
      // selects display_name, so a smuggled row would hand org B org A's PII.
      const orgBRoster = await orgB.get(`/api/pickleball/sessions/${orgBSessionId}/players`)
      expect(orgBRoster.status()).toBe(200)
      const orgBRosterBody = await orgBRoster.json()
      expect(orgBRosterBody.players.map((p) => p.playerId)).not.toContain(orgAPlayerId)
      expect(orgBRosterBody.players.map((p) => p.displayName)).not.toContain(orgAPlayerName)
      expect(orgBRosterBody.counts.registered).toBe(0)

      // ...and org B must not reach org A's session roster at all — 404 from
      // the session ownership check, never 200 with org A's roster in it.
      //
      // Only the GET is asserted here. The matching POST (org B registering
      // into org A's session) also answers 404 correctly, but a POST that
      // carries a JSON body and returns 404 without reading it crashes the
      // local `wrangler dev` host outright ("Network connection lost" on every
      // later request), so it cannot be exercised in-suite. That affects all
      // six Phase 2 routes identically and is a local-harness bug, not a
      // route bug — see the final-review fix report for the repro.
      expect((await orgB.get(`/api/pickleball/sessions/${orgASessionId}/players`)).status()).toBe(404)

      // Org B may still register its own player, so the check is a tenancy
      // filter rather than a blanket rejection of client-supplied player ids.
      const orgBPlayer = await orgB.post('/api/pickleball/players', { data: { displayName: `Org B Player ${Date.now()}` } })
      expect(orgBPlayer.ok()).toBe(true)
      const orgBPlayerId = (await orgBPlayer.json()).player.id

      const orgBOwnRegister = await orgB.post(`/api/pickleball/sessions/${orgBSessionId}/players`, {
        data: { playerId: orgBPlayerId },
      })
      expect(orgBOwnRegister.status()).toBe(201)
    } finally {
      await orgA.dispose()
      await orgB.dispose()
    }
  })

})

// The same route edit that added the player tenancy check also started honoring
// players.active, which registerPlayer's INSERT ignores entirely.
test.describe('Pickleball attendance registration guards', () => {
  test('a deactivated player cannot be registered into a session', async ({ request }) => {
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

    const venueResponse = await request.post('/api/pickleball/venues', { data: { name: 'Deactivated Player Venue' } })
    const deactivatedVenueId = (await venueResponse.json()).venue.id

    const sessionResponse = await request.post('/api/pickleball/sessions', {
      data: {
        venueId: deactivatedVenueId,
        name: 'Deactivated Player Session',
        sessionType: 'OPEN_PLAY',
        scoringRulesetId: GLOBAL_RULESET_ID,
        scheduledStart: '2026-09-03T18:00:00.000Z',
        scheduledEnd: '2026-09-03T22:00:00.000Z',
      },
    })
    const deactivatedSessionId = (await sessionResponse.json()).session.id

    const playerResponse = await request.post('/api/pickleball/players', {
      data: { displayName: `Deactivated Player ${Date.now()}` },
    })
    const deactivatedPlayerId = (await playerResponse.json()).player.id

    const deactivate = await request.put(`/api/pickleball/players/${deactivatedPlayerId}`, { data: { active: false } })
    expect(deactivate.status()).toBe(200)
    expect((await deactivate.json()).player.active).toBe(false)

    const register = await request.post(`/api/pickleball/sessions/${deactivatedSessionId}/players`, {
      data: { playerId: deactivatedPlayerId },
    })
    expect(register.status()).toBe(400)
    expect((await register.json()).error).toBe('Player is not active.')
  })
})
