import { test, expect } from '@playwright/test'

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

  test('registered-but-not-arrived player cannot check in twice, and blocks nothing else', async ({ request }) => {
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
