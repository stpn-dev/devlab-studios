import { test, expect } from '@playwright/test'

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
})
