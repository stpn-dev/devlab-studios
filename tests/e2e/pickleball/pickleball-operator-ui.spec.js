import { test, expect } from '@playwright/test'
import { loginAsOperator, loginAs } from './helpers.js'

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

  const cancelledPlayerName = `Checkin UI Cancelled Player ${Date.now()}`
  const cancelledPlayerId = (await (await request.post('/api/pickleball/players', { data: { displayName: cancelledPlayerName } })).json()).player.id
  await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId: cancelledPlayerId } })
  await page.reload()
  await expect(page.getByTestId('register-player-select').getByRole('option', { name: cancelledPlayerName })).toHaveCount(0)

  const cancelResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players/cancel`, { data: { playerId: cancelledPlayerId } })
  expect(cancelResponse.ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByTestId('checkin-list').getByText(cancelledPlayerName)).toBeVisible()
  await expect(page.getByTestId('register-player-select').getByRole('option', { name: cancelledPlayerName })).toHaveCount(1)
})

test('a queued player appears on the Queue page and can leave the queue', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Queue UI Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Queue UI Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  const playerName = `Queue UI Player ${Date.now()}`
  const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: playerName } })).json()).player.id
  const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
  await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })

  await page.goto(`/pickleball/app/sessions/${sessionId}/queue`)
  await expect(page.getByTestId('queue-waiting-list').getByText('Nobody waiting.')).toBeVisible()

  await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
  await expect(page.getByTestId('queue-waiting-list').getByText(playerName)).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Leave queue' }).click()
  await expect(page.getByTestId('queue-waiting-list').getByText('Nobody waiting.')).toBeVisible({ timeout: 10000 })
})

test('assigns and releases a court through the Courts page', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Courts UI Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Courts UI Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  for (let i = 0; i < 4; i += 1) {
    const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `Courts UI Player ${i}-${Date.now()}` } })).json()).player.id
    const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
  }

  await page.goto(`/pickleball/app/sessions/${sessionId}/courts`)
  await expect(page.getByTestId('courts-grid').getByText('AVAILABLE')).toBeVisible()

  await page.getByRole('button', { name: 'Assign' }).click()
  await expect(page.getByTestId('courts-grid').getByText('ASSIGNED')).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Release' }).click()
  await expect(page.getByTestId('courts-grid').getByText('AVAILABLE')).toBeVisible({ timeout: 10000 })
})

test('enables and disables a court through the Courts page', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Courts UI Enable Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Courts UI Enable Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  await page.goto(`/pickleball/app/sessions/${sessionId}/courts`)
  await expect(page.getByTestId('courts-grid').getByText('AVAILABLE')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Disable' })).toBeVisible()

  await page.getByRole('button', { name: 'Disable' }).click()
  await expect(page.getByRole('button', { name: 'Enable' })).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Enable' }).click()
  await expect(page.getByRole('button', { name: 'Disable' })).toBeVisible({ timeout: 10000 })
})

test('starts a game through the Games page and it appears in the games list', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Games UI Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Games UI Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
  const sessionCourtId = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts[0].id

  for (let i = 0; i < 4; i += 1) {
    const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `Games UI Player ${i}-${Date.now()}` } })).json()).player.id
    const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
  }
  await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })

  await page.goto(`/pickleball/app/sessions/${sessionId}/games`)
  await expect(page.getByText('Court 1 — assigned, no game started')).toBeVisible()
  await page.getByText('Court 1 — assigned, no game started').click()

  await expect(page.getByTestId('team-a-server-select')).toBeVisible()
  await page.getByTestId('team-a-server-select').selectOption({ index: 1 })
  await page.getByTestId('team-b-server-select').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Start game' }).click()

  await expect(page.getByTestId('games-list').getByText('IN_PROGRESS')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('games-list').getByText('0 – 0')).toBeVisible()
})

test('StartGameForm does not re-fetch teams when an unrelated broadcast re-renders the games list', async ({ page, request, context }) => {
  // Coverage for the render-body-fetch bug fixed in StartGameForm: the form
  // used to call its teams-fetch directly in the render body, so it would
  // re-fire on every re-render while `teams` was still null -- including
  // re-renders driven by unrelated WebSocket broadcasts landing on
  // GamesListPage's parent snapshot, since StartGameForm is a child of that
  // list.
  //
  // The brief allows either (a) forcing a genuine server-side error on the
  // teams fetch (e.g. by racing a court release) or (b) proving the
  // correct-path behavior directly: no duplicate GET .../teams calls when
  // another broadcast fires while the form is open. Approach (a) requires
  // winning a race against the server that isn't guaranteed to land the
  // same way every run in this harness (the release could complete before
  // or after the teams fetch, non-deterministically flipping between a 404
  // and a normal load), so it risks being flaky. Approach (b) is fully
  // deterministic -- it uses a real, unrelated mutation (registering a new
  // player) to trigger a real broadcast and snapshot update while directly
  // counting the actual network calls Playwright observes -- so that's the
  // one used here.
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Games UI No-Refetch Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Games UI No-Refetch Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
  const sessionCourtId = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts[0].id

  for (let i = 0; i < 4; i += 1) {
    const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `No-Refetch Player ${i}-${Date.now()}` } })).json()).player.id
    const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
  }
  await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })

  const teamsRequestUrl = `/api/pickleball/sessions/${sessionId}/courts/${sessionCourtId}/teams`
  let teamsRequestCount = 0
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes(teamsRequestUrl)) {
      teamsRequestCount += 1
    }
  })

  // Listen for inbound WebSocket frames directly, rather than relying on a
  // UI element elsewhere in the app, so we have independent proof that a
  // broadcast actually reached this page (and therefore re-rendered
  // GamesListPage/StartGameForm) rather than just assuming it did.
  let wsMessageCount = 0
  page.on('websocket', (ws) => {
    ws.on('framereceived', () => {
      wsMessageCount += 1
    })
  })

  await page.goto(`/pickleball/app/sessions/${sessionId}/games`)
  await expect(page.getByTestId('realtime-status')).toHaveText('Live', { timeout: 10000 })
  await expect(page.getByText('Court 1 — assigned, no game started')).toBeVisible()
  await page.getByText('Court 1 — assigned, no game started').click()

  // Confirm the form actually finished its one legitimate load.
  await expect(page.getByTestId('team-a-server-select')).toBeVisible()
  expect(teamsRequestCount).toBe(1)

  const wsMessageCountBeforeBroadcast = wsMessageCount

  // Fire an unrelated mutation so a broadcast lands on the session snapshot
  // while the start-game form is still open, forcing GamesListPage (and its
  // StartGameForm child) to re-render.
  const extraPlayerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `No-Refetch Extra Player ${Date.now()}` } })).json()).player.id
  const extraSessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId: extraPlayerId } })).json()).sessionPlayer.id
  await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId: extraPlayerId } })
  await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId: extraSessionPlayerId } })

  // Prove the broadcast actually reached this page's WebSocket before
  // asserting on the request count -- otherwise a lack of re-fetch would be
  // meaningless (it could just mean the broadcast never arrived).
  await expect.poll(() => wsMessageCount, { timeout: 10000 }).toBeGreaterThan(wsMessageCountBeforeBroadcast)

  // Give any errant re-fetch a chance to fire, then assert it didn't.
  await page.waitForTimeout(1000)
  expect(teamsRequestCount).toBe(1)

  // The form itself should still be intact and usable, not stuck reloading.
  await expect(page.getByTestId('team-a-server-select')).toBeVisible()
  await page.getByTestId('team-a-server-select').selectOption({ index: 1 })
  await page.getByTestId('team-b-server-select').selectOption({ index: 1 })
  await expect(page.getByRole('button', { name: 'Start game' })).toBeEnabled()
})

test('opens the Scorekeeper page for an in-progress game from the Games list', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Scorekeeper Nav Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Scorekeeper Nav Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
  const sessionCourtId = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts[0].id

  for (let i = 0; i < 4; i += 1) {
    const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `Scorekeeper Nav Player ${i}-${Date.now()}` } })).json()).player.id
    const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
  }
  await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })

  const teams = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourtId}/teams`)).json()).teams
  const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
    data: {
      sessionCourtId,
      servingTeam: 'A',
      teamAStartingServerSessionPlayerId: teams[0].members[0].sessionPlayerId,
      teamBStartingServerSessionPlayerId: teams[1].members[0].sessionPlayerId,
    },
  })
  expect(startResponse.ok()).toBe(true)

  await page.goto(`/pickleball/app/sessions/${sessionId}/games`)
  await expect(page.getByTestId('games-list').getByText('0 – 0')).toBeVisible()
  await page.getByTestId('games-list').getByRole('link').click()

  await expect(page).toHaveURL(new RegExp(`/games/[^/]+$`))
  await expect(page.getByTestId('scorekeeper-score')).toHaveText('0 – 0')
})

test('shows the official score call and contextual banner on the Scorekeeper page', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Scorekeeper Display Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Scorekeeper Display Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
  const sessionCourtId = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts[0].id

  for (let i = 0; i < 4; i += 1) {
    const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `Scorekeeper Display Player ${i}-${Date.now()}` } })).json()).player.id
    const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
  }
  await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })
  const teams = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourtId}/teams`)).json()).teams
  const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
    data: {
      sessionCourtId, servingTeam: 'A',
      teamAStartingServerSessionPlayerId: teams[0].members[0].sessionPlayerId,
      teamBStartingServerSessionPlayerId: teams[1].members[0].sessionPlayerId,
    },
  })
  const gameId = (await startResponse.json()).game.id

  await page.goto(`/pickleball/app/sessions/${sessionId}/games/${gameId}`)
  await expect(page.getByTestId('scorekeeper-score')).toHaveText('0 – 0')
  await expect(page.getByTestId('scorekeeper-official-call')).toContainText('Call: 0-0-2')
  await expect(page.getByTestId('contextual-banner')).toHaveCount(0)

  for (let i = 0; i < 10; i += 1) {
    const rallyResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, { data: { winningTeam: 'A' } })
    expect(rallyResponse.ok()).toBe(true)
  }

  await expect(page.getByTestId('scorekeeper-score')).toHaveText('10 – 0', { timeout: 10000 })
  await expect(page.getByTestId('contextual-banner')).toHaveText('Game point', { timeout: 10000 })
})

test('records rallies, undoes the last one, and finishes a game from the Scorekeeper page', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Scorekeeper Controls Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Scorekeeper Controls Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
  const sessionCourtId = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts[0].id

  for (let i = 0; i < 4; i += 1) {
    const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `Scorekeeper Controls Player ${i}-${Date.now()}` } })).json()).player.id
    const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
  }
  await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })
  const teams = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourtId}/teams`)).json()).teams
  const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
    data: {
      sessionCourtId, servingTeam: 'A',
      teamAStartingServerSessionPlayerId: teams[0].members[0].sessionPlayerId,
      teamBStartingServerSessionPlayerId: teams[1].members[0].sessionPlayerId,
    },
  })
  const gameId = (await startResponse.json()).game.id

  await page.goto(`/pickleball/app/sessions/${sessionId}/games/${gameId}`)
  await expect(page.getByTestId('scorekeeper-score')).toHaveText('0 – 0')

  await page.getByRole('button', { name: 'TEAM A WON RALLY' }).click()
  await expect(page.getByTestId('scorekeeper-score')).toHaveText('1 – 0', { timeout: 10000 })

  await page.getByRole('button', { name: 'UNDO LAST RALLY' }).click()
  await expect(page.getByTestId('scorekeeper-score')).toHaveText('0 – 0', { timeout: 10000 })

  for (let i = 0; i < 11; i += 1) {
    const rallyResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, { data: { winningTeam: 'A' } })
    expect(rallyResponse.ok()).toBe(true)
  }

  await expect(page.getByTestId('scorekeeper-score')).toHaveText('11 – 0', { timeout: 10000 })
  await expect(page.getByRole('button', { name: 'Finish game' })).toBeVisible()
  await page.getByRole('button', { name: 'Finish game' }).click()
  await expect(page.getByText('Game finished: 11 – 0.')).toBeVisible({ timeout: 10000 })
})

test('the correction panel is visible to an ADMIN, hidden from a SCOREKEEPER, and reopen/correct work', async ({ page, request, context, browser }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Correction Panel Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Correction Panel Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
  const sessionCourtId = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts[0].id

  for (let i = 0; i < 4; i += 1) {
    const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `Correction Panel Player ${i}-${Date.now()}` } })).json()).player.id
    const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
  }
  await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })
  const teams = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourtId}/teams`)).json()).teams
  const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
    data: {
      sessionCourtId, servingTeam: 'A',
      teamAStartingServerSessionPlayerId: teams[0].members[0].sessionPlayerId,
      teamBStartingServerSessionPlayerId: teams[1].members[0].sessionPlayerId,
    },
  })
  const gameId = (await startResponse.json()).game.id

  for (let i = 0; i < 11; i += 1) {
    await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, { data: { winningTeam: 'A' } })
  }
  const finishResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/finish`, { data: {} })
  expect(finishResponse.ok()).toBe(true)

  await page.goto(`/pickleball/app/sessions/${sessionId}/games/${gameId}`)
  await expect(page.getByTestId('correction-panel')).toBeVisible()

  await page.getByRole('button', { name: 'Reopen game' }).click()
  await expect(page.getByText('This game is under correction.')).toBeVisible({ timeout: 10000 })

  await page.getByTestId('correction-score-a').fill('9')
  await page.getByTestId('correction-score-b').fill('7')
  await page.getByRole('button', { name: 'Save correction' }).click()
  await expect(page.getByTestId('scorekeeper-score')).toHaveText('9 – 7', { timeout: 10000 })

  const sessionInfo = await (await request.get('/api/pickleball/auth/session')).json()
  const inviteResponse = await request.post(`/api/pickleball/organizations/${sessionInfo.activeOrgId}/memberships`, {
    data: { invitedEmail: 'scorekeeper@example.com', role: 'SCOREKEEPER' },
  })
  expect(inviteResponse.ok()).toBe(true)

  const scorekeeperContext = await browser.newContext()
  const scorekeeperPage = await scorekeeperContext.newPage()
  await loginAs(request, scorekeeperContext, baseURL, 'scorekeeper@example.com')
  await scorekeeperPage.goto(`/pickleball/app/sessions/${sessionId}/games/${gameId}`)
  await expect(scorekeeperPage.getByTestId('scorekeeper-score')).toBeVisible({ timeout: 10000 })
  await expect(scorekeeperPage.getByTestId('correction-panel')).toHaveCount(0)
  await scorekeeperContext.close()
})

test('the public live view shows a session\'s courts and games without authentication', async ({ request, context }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Public View Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Public View Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id

  const codeResponse = await request.get(`/api/pickleball/sessions/${sessionId}/public-code`)
  expect(codeResponse.ok()).toBe(true)
  const { code } = await codeResponse.json()

  // A brand-new, unauthenticated browser context -- no cookies at all --
  // proves this page genuinely needs no login.
  const publicContext = await context.browser().newContext()
  const publicPage = await publicContext.newPage()
  await publicPage.goto(`/pickleball/live/${code}`)

  await expect(publicPage.getByText('Court 1')).toBeVisible({ timeout: 10000 })
  await expect(publicPage.getByTestId('live-courts').getByText('No game in progress.')).toBeVisible()
  await publicContext.close()
})

test('a rally recorded by an operator through the Scorekeeper page appears on the public live view without a reload', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  await loginAsOperator(request, context, baseURL)

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Two Context Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })
  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Two Context Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-01T18:00:00.000Z', scheduledEnd: '2026-09-01T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })
  const sessionCourtId = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts[0].id

  for (let i = 0; i < 4; i += 1) {
    const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `Two Context Player ${i}-${Date.now()}` } })).json()).player.id
    const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
  }
  await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })
  const teams = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourtId}/teams`)).json()).teams
  const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
    data: {
      sessionCourtId, servingTeam: 'A',
      teamAStartingServerSessionPlayerId: teams[0].members[0].sessionPlayerId,
      teamBStartingServerSessionPlayerId: teams[1].members[0].sessionPlayerId,
    },
  })
  const gameId = (await startResponse.json()).game.id

  const code = (await (await request.get(`/api/pickleball/sessions/${sessionId}/public-code`)).json()).code

  // Second, fully independent browser context: no cookies, no shared state
  // with the operator's `page`/`context` at all -- this is the "second
  // connected client" the spec's Testing section describes.
  const publicContext = await context.browser().newContext()
  const publicPage = await publicContext.newPage()
  await publicPage.goto(`/pickleball/live/${code}`)
  // Wait for the court to be visible to confirm the public view is loaded
  await expect(publicPage.getByText('Court 1')).toBeVisible({ timeout: 10000 })
  // Capture the baseline score on the public view before any rally is recorded,
  // so the later assertion proves a transition rather than a post-hoc snapshot.
  await expect(publicPage.getByTestId('live-courts').getByText('0 – 0')).toBeVisible({ timeout: 10000 })

  // First, navigate the operator's page to the Scorekeeper so its WebSocket connects
  await page.goto(`/pickleball/app/sessions/${sessionId}/games/${gameId}`)
  await expect(page.getByTestId('scorekeeper-score')).toHaveText('0 – 0', { timeout: 10000 })

  // The operator records a rally through the actual Scorekeeper UI.
  await page.getByRole('button', { name: 'TEAM A WON RALLY' }).click()
  await expect(page.getByTestId('scorekeeper-score')).toHaveText('1 – 0', { timeout: 10000 })

  // The public viewer's own DOM updates from its own broadcast -- no reload
  // anywhere in this test, and no interaction with `publicPage` at all
  // between its initial `goto` and this assertion.
  // The broadcast updates the live-courts element with the new score
  await expect(publicPage.getByTestId('live-courts').getByText('1 – 0')).toBeVisible({ timeout: 10000 })

  await publicContext.close()
})
