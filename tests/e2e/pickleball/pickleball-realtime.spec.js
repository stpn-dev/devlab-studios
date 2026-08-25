import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

// Playwright's `request` and `page` fixtures do NOT share a cookie jar in
// this project's Playwright version -- confirmed by a diagnostic run where
// `page.request.get('/api/pickleball/auth/session')` came back 401 right
// after `request.post('/api/pickleball/auth/test-login', ...)` had already
// succeeded. The brief's Step 4 anticipated exactly this and named the
// fallback: pull the Set-Cookie header off the login response and hand it to
// `page.context().addCookies([...])` explicitly before the WebSocket ever
// opens in the page. Every later realtime spec that logs in via `request`
// and then opens a socket via `page` should reuse this same helper.
async function createLiveSessionForRealtimeTests(request, context, baseURL) {
  const loginResponse = await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
  const setCookie = loginResponse.headers()['set-cookie']
  const [nameValue] = setCookie.split(';')
  const separatorIndex = nameValue.indexOf('=')
  const name = nameValue.slice(0, separatorIndex)
  const value = nameValue.slice(separatorIndex + 1)
  await context.addCookies([{ name, value, url: baseURL }])

  const venueResponse = await request.post('/api/pickleball/venues', {
    data: { name: `Realtime Test Venue ${Date.now()}-${Math.random().toString(36).slice(2)}` },
  })
  const venueId = (await venueResponse.json()).venue.id

  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `Realtime Test Session ${Date.now()}`,
      sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-08-30T18:00:00.000Z',
      scheduledEnd: '2026-08-30T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id

  return sessionId
}

test('operator channel completes a real WebSocket upgrade through the Astro route and the DO', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  const sessionId = await createLiveSessionForRealtimeTests(request, context, baseURL)

  // The cookie is SameSite=Strict (see src/worker/pickleball/session.js), so
  // it is only attached to a request whose initiating page is already on
  // this same origin -- an un-navigated `page` starts at about:blank, an
  // opaque origin the browser treats as cross-site, and the WebSocket
  // handshake would go out with no cookie at all. A real scorekeeper always
  // opens this socket from a page already on http://localhost:8787, so this
  // mirrors that rather than working around it.
  await page.goto('/pickleball/app')

  const received = await page.evaluate(
    ({ url }) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(url)
        ws.onmessage = (event) => resolve(event.data)
        ws.onerror = () => reject(new Error('WebSocket error'))
        setTimeout(() => reject(new Error('Timed out waiting for a message.')), 5000)
      }),
    { url: `${baseURL.replace('http', 'ws')}/pickleball/rt/${sessionId}` },
  )

  const parsed = JSON.parse(received)
  expect(parsed.type).toBe('STATE')
  expect(parsed.sessionId).toBe(sessionId)
  expect(parsed.payload.session.id).toBe(sessionId)
  expect(parsed.payload.courts).toEqual([])
  expect(parsed.payload.queue).toEqual([])
  expect(parsed.payload.games).toEqual([])
})

test('public channel resolves a code to a sanitized snapshot with no queue data', async ({ page, request, context }) => {
  const baseURL = test.info().project.use.baseURL
  const sessionId = await createLiveSessionForRealtimeTests(request, context, baseURL)
  const sessionResponse = await request.get(`/api/pickleball/sessions/${sessionId}`)
  expect(sessionResponse.ok()).toBe(true)

  // The public code isn't exposed on the session detail response yet (no
  // route surfaces it -- that's a later sub-project's UI concern); read it
  // straight from D1 via wrangler for this test only.
  const output = execSync(
    `npx wrangler d1 execute devlab-pickleball --local --json --command "SELECT public_code FROM public_session_tokens WHERE session_id = '${sessionId}'"`,
  ).toString()
  const code = JSON.parse(output)[0].results[0].public_code

  const received = await page.evaluate(
    ({ url }) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(url)
        ws.onmessage = (event) => resolve(event.data)
        ws.onerror = () => reject(new Error('WebSocket error'))
        setTimeout(() => reject(new Error('Timed out waiting for a message.')), 5000)
      }),
    { url: `${baseURL.replace('http', 'ws')}/pickleball/rt/public/${code}` },
  )

  const parsed = JSON.parse(received)
  expect(parsed.payload.session.id).toBe(sessionId)
  expect(parsed.payload.queue).toBeUndefined()
})

test('a rally recorded via REST broadcasts an updated snapshot to a connected operator client', async ({ page, request }) => {
  const baseURL = test.info().project.use.baseURL

  // Same SameSite=Strict cookie requirement as the operator-channel test
  // above: the WebSocket handshake below is initiated from `page`, which
  // never shares a cookie jar with `request` (see this file's top-of-file
  // comment) and starts at about:blank (an opaque, cross-site origin). Pull
  // the login cookie onto `page`'s context explicitly and navigate `page`
  // to same-origin content before opening the socket, exactly like
  // createLiveSessionForRealtimeTests does above.
  const loginResponse = await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
  const setCookie = loginResponse.headers()['set-cookie']
  const [nameValue] = setCookie.split(';')
  const separatorIndex = nameValue.indexOf('=')
  const cookieName = nameValue.slice(0, separatorIndex)
  const cookieValue = nameValue.slice(separatorIndex + 1)
  await page.context().addCookies([{ name: cookieName, value: cookieValue, url: baseURL }])

  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Broadcast Venue ${Date.now()}` } })
  const venueId = (await venueResponse.json()).venue.id
  await request.post('/api/pickleball/courts', { data: { venueId, name: 'Court 1' } })

  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId, name: `Broadcast Session ${Date.now()}`, sessionType: 'OPEN_PLAY',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-08-30T18:00:00.000Z', scheduledEnd: '2026-08-30T22:00:00.000Z',
    },
  })
  const sessionId = (await sessionResponse.json()).session.id
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  const sessionCourtId = (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts[0].id

  const sessionPlayerIds = []
  for (let i = 0; i < 4; i += 1) {
    const playerId = (await (await request.post('/api/pickleball/players', { data: { displayName: `Broadcast Player ${i}-${Date.now()}` } })).json()).player.id
    const sessionPlayerId = (await (await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })).json()).sessionPlayer.id
    await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    await request.post(`/api/pickleball/sessions/${sessionId}/queue`, { data: { sessionPlayerId } })
    sessionPlayerIds.push(sessionPlayerId)
  }

  await request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })
  const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
    data: { sessionCourtId, servingTeam: 'A', teamAStartingServerSessionPlayerId: sessionPlayerIds[0], teamBStartingServerSessionPlayerId: sessionPlayerIds[2] },
  })
  const gameId = (await startResponse.json()).game.id

  // Navigate to a same-origin page before opening the WebSocket, so the
  // SameSite=Strict cookie added above is actually attached to the upgrade
  // request (see the comment on the login step above).
  await page.goto('/pickleball/app')

  const wsUrl = `${baseURL.replace('http', 'ws')}/pickleball/rt/${sessionId}`

  const nextMessage = page.evaluate(
    ({ url }) =>
      new Promise((resolve) => {
        const ws = new WebSocket(url)
        let seenFirst = false
        ws.onmessage = (event) => {
          if (!seenFirst) {
            seenFirst = true // the accept-time snapshot; wait for the NEXT one
            return
          }
          resolve(event.data)
        }
      }),
    { url: wsUrl },
  )

  // Give the socket a moment to finish its handshake and receive the
  // accept-time snapshot before triggering the rally that should produce a
  // SECOND message.
  await page.waitForTimeout(500)
  const rallyResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, { data: { winningTeam: 'A' } })
  expect(rallyResponse.ok()).toBe(true)

  const received = await nextMessage
  const parsed = JSON.parse(received)
  expect(parsed.payload.games[0].scoreA).toBe(1)
})
