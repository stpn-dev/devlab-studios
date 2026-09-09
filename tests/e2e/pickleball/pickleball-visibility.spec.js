import { test, expect } from '@playwright/test'

// Publishing controls. A session's public link shows real player names to
// anyone holding it, so a session does NOT publish until an operator says so.
// These tests pin that default: without them, a later change could quietly
// flip publishing back on for every new session and nothing would notice.

async function createSession(request) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Visibility Venue ${unique}` } })
  const venueId = (await venueResponse.json()).venue.id

  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `Visibility Session ${unique}`,
      sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-08T18:00:00.000Z',
      scheduledEnd: '2026-09-08T22:00:00.000Z',
    },
  })
  expect(sessionResponse.status()).toBe(201)
  return (await sessionResponse.json()).session
}

const getPublicCode = async (request, sessionId) =>
  (await (await request.get(`/api/pickleball/sessions/${sessionId}/public-code`)).json()).code

const setVisibility = (request, sessionId, publicViewEnabled, publicLeaderboardEnabled = true) =>
  request.post(`/api/pickleball/sessions/${sessionId}/visibility`, {
    data: { publicViewEnabled, publicLeaderboardEnabled },
  })

async function loginAsScorekeeper(request) {
  const { activeOrgId } = await (await request.get('/api/pickleball/auth/session')).json()
  const email = `visibility-scorekeeper-${Date.now()}@example.com`
  await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
    data: { invitedEmail: email, role: 'SCOREKEEPER' },
  })
  await request.post('/api/pickleball/auth/test-login', { data: { email } })
}

test.describe('Pickleball session visibility', () => {
  test('a new session does not publish, and its public link returns nothing', async ({ request }) => {
    const session = await createSession(request)
    expect(session.publicViewEnabled).toBe(false)

    // A share code still exists -- it is minted with the session -- but it
    // resolves to nothing until publishing is turned on. That is the whole
    // point: the link is useless until somebody decides otherwise.
    const code = await getPublicCode(request, session.id)
    expect(code).toBeTruthy()
    expect((await request.get(`/api/pickleball/public/${code}/state`)).status()).toBe(404)
  })

  test('turning sharing on publishes the session, and turning it off stops publishing again', async ({ request }) => {
    const session = await createSession(request)
    const code = await getPublicCode(request, session.id)

    const onResponse = await setVisibility(request, session.id, true)
    expect(onResponse.status()).toBe(200)
    expect((await onResponse.json()).session.publicViewEnabled).toBe(true)
    expect((await request.get(`/api/pickleball/public/${code}/state`)).status()).toBe(200)

    // Reversible: an operator asked to stop showing names can actually stop.
    expect((await setVisibility(request, session.id, false)).status()).toBe(200)
    expect((await request.get(`/api/pickleball/public/${code}/state`)).status()).toBe(404)
  })

  test('the leaderboard can be withheld while the rest of the view is published', async ({ request }) => {
    const session = await createSession(request)
    const code = await getPublicCode(request, session.id)

    expect((await setVisibility(request, session.id, true, false)).status()).toBe(200)
    const view = await (await request.get(`/api/pickleball/public/${code}/state`)).json()
    expect(view.leaderboard).toBeNull()

    expect((await setVisibility(request, session.id, true, true)).status()).toBe(200)
    const withBoard = await (await request.get(`/api/pickleball/public/${code}/state`)).json()
    expect(withBoard.leaderboard).not.toBeNull()
  })

  test('a SCOREKEEPER cannot change what a session publishes', async ({ request }) => {
    const session = await createSession(request)
    await loginAsScorekeeper(request)

    // Publishing personal data is a session-management decision, not a
    // scorekeeping one.
    expect((await setVisibility(request, session.id, true)).status()).toBe(403)
  })

  test('rejects a malformed visibility payload rather than guessing', async ({ request }) => {
    const session = await createSession(request)
    const response = await request.post(`/api/pickleball/sessions/${session.id}/visibility`, {
      data: { publicViewEnabled: 'yes please' },
    })
    expect(response.status()).toBe(400)
  })

  test('the public view carries a privacy notice telling viewers what is published', async ({ page, request }) => {
    const session = await createSession(request)
    const code = await getPublicCode(request, session.id)
    expect((await setVisibility(request, session.id, true)).status()).toBe(200)

    await page.goto(`/pickleball/live/${code}`)
    const notice = page.getByTestId('live-privacy-notice')
    await expect(notice).toBeVisible({ timeout: 15000 })
    await expect(notice).toContainText('player names')
  })
})
