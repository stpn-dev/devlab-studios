import { test, expect } from '@playwright/test'
import { loginAsOperator } from './helpers.js'

test('creates a player through the Players page and it appears in the list', async ({ page, request, baseURL }) => {
  // The `request` fixture uses its own APIRequestContext and does not share
  // cookies with the browser context behind `page`, so the session cookie
  // set by test-login has to be copied over explicitly. See ./helpers.js.
  await loginAsOperator(request, page.context(), baseURL)

  await page.goto('/pickleball/app/players')
  await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible()

  await page.getByRole('button', { name: 'Add Player' }).click()
  const name = `UI Test Player ${Date.now()}`
  await page.getByLabel('Display name').fill(name)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.getByTestId('players-list').getByText(name)).toBeVisible()

  // Reload to prove it was actually persisted server-side, not just held in
  // local component state.
  await page.reload()
  await expect(page.getByTestId('players-list').getByText(name)).toBeVisible()
})

test('creates a venue and adds a court to it through the Venues page', async ({ page, request, baseURL }) => {
  await loginAsOperator(request, page.context(), baseURL)

  await page.goto('/pickleball/app/venues')
  await expect(page.getByRole('heading', { name: 'Venues' })).toBeVisible()

  const venueName = `UI Test Venue ${Date.now()}`
  await page.getByPlaceholder('New venue name').fill(venueName)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByTestId('venues-list').getByText(venueName)).toBeVisible()

  await expect(page.getByRole('heading', { name: `${venueName} — Courts` })).toBeVisible()
  const courtName = `Court ${Date.now()}`
  await page.getByPlaceholder('New court name').fill(courtName)
  await page.getByRole('button', { name: 'Add Court' }).click()
  await expect(page.getByTestId('courts-list').getByText(courtName)).toBeVisible()

  // Reload and re-select the venue to prove both the venue and the court
  // were actually persisted server-side, not just held in local component
  // state.
  await page.reload()
  await expect(page.getByTestId('venues-list').getByText(venueName)).toBeVisible()
  await page.getByTestId('venues-list').getByText(venueName).click()
  await expect(page.getByRole('heading', { name: `${venueName} — Courts` })).toBeVisible()
  await expect(page.getByTestId('courts-list').getByText(courtName)).toBeVisible()
})

test('creates a session through the Sessions page with a real venue and ruleset', async ({ page, request, baseURL }) => {
  await loginAsOperator(request, page.context(), baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Session UI Venue ${Date.now()}` } })
  const venue = (await venueResponse.json()).venue

  await page.goto('/pickleball/app/sessions')
  await page.getByRole('button', { name: 'New Session' }).click()

  const sessionName = `UI Test Session ${Date.now()}`
  // Playwright's getByLabel computes a wrapping <label>'s accessible name
  // from its full text content, which for the Venue/Scoring ruleset
  // <select> elements includes every <option>'s text — i.e. the names of
  // every venue/ruleset already in the local dev DB, including fixture data
  // from other specs (e.g. "Attendance Test Venue"). That makes the Venue
  // label's own computed name never exactly equal "Venue" (so `exact: true`
  // finds nothing), while its polluted content can substring-collide with
  // an unrelated short label like "End" (so non-exact matching on "End"
  // hits 2 elements). Name/Start/End are plain inputs with no such
  // pollution, so exact matching them is safe and disambiguates "End" from
  // the Venue select's "...Attendance..." option text; the Venue/Scoring
  // ruleset selects instead use dedicated data-testid attributes
  // (session-venue-select/session-ruleset-select) so matching them doesn't
  // depend on option-text pollution at all.
  await page.getByLabel('Name', { exact: true }).fill(sessionName)
  await page.getByTestId('session-venue-select').selectOption(venue.id)
  await page.getByTestId('session-ruleset-select').selectOption('usap-2026-sideout-11-doubles')
  await page.getByLabel('Start', { exact: true }).fill('2026-09-01T18:00')
  await page.getByLabel('End', { exact: true }).fill('2026-09-01T22:00')
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByText('Session created.')).toBeVisible()
  await expect(page.getByTestId('sessions-list').getByText(sessionName)).toBeVisible()

  // Reload to prove it was actually persisted server-side, not just held in
  // local component state.
  await page.reload()
  await expect(page.getByTestId('sessions-list').getByText(sessionName)).toBeVisible()
})

test('SessionControlPage shows Live status and its queue count updates from a broadcast without a reload', async ({ page, request, baseURL }) => {
  // Same cookie-bridging requirement as every other test in this file (see
  // the comment on the first test above): `request` and `page` don't share
  // a cookie jar, so the session cookie has to be copied over explicitly
  // before `page.goto` navigates to the session route and its layout opens
  // the WebSocket.
  await loginAsOperator(request, page.context(), baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Control UI Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `Control UI Session ${Date.now()}`,
      sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z',
      scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id

  await page.goto(`/pickleball/app/sessions/${sessionId}`)
  await expect(page.getByTestId('realtime-status')).toHaveText('Live', { timeout: 10000 })
  await expect(page.getByTestId('queue-count')).toHaveText('0')

  // Trigger the mutation from a SEPARATE `request` context after the page's
  // own WebSocket has already reached 'open' (asserted above) -- this is
  // the actual proof that a live broadcast, not a reload or an initial
  // fetch, is what updates the on-screen count.
  const playerResponse = await request.post('/api/pickleball/players', { data: { displayName: `Control UI Player ${Date.now()}` } })
  const playerId = (await playerResponse.json()).player.id
  const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
  const sessionPlayerId = (await registerResponse.json()).sessionPlayer.id
  await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
  await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })

  await expect(page.getByTestId('queue-count')).toHaveText('1', { timeout: 10000 })
})

test('checks in a registered player through the Check-in page', async ({ page, request, baseURL }) => {
  await loginAsOperator(request, page.context(), baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Checkin UI Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Checkin UI Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  const playerName = `Checkin UI Player ${Date.now()}`
  const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: playerName } })).json()).player.id
  await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })

  await page.goto(`/pickleball/app/sessions/${sessionId}/check-in`)
  await expect(page.getByTestId('checkin-list').getByText(playerName)).toBeVisible()
  await expect(page.getByTestId('checkin-list').getByText('NOT_CHECKED_IN')).toBeVisible()

  await page.getByRole('button', { name: 'Check in' }).click()
  await expect(page.getByTestId('checkin-list').getByText('CHECKED_IN')).toBeVisible({ timeout: 10000 })
})
