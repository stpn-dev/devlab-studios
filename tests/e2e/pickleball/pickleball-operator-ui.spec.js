import { test, expect } from '@playwright/test'

test('creates a player through the Players page and it appears in the list', async ({ page, request, baseURL }) => {
  const loginResponse = await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  // The `request` fixture uses its own APIRequestContext and does not share
  // cookies with the browser context behind `page`, so the session cookie
  // set by test-login has to be copied over explicitly. Only the name=value
  // pair matters here — the browser context enforces its own attributes.
  const setCookieHeader = loginResponse.headers()['set-cookie']
  const nameValuePair = setCookieHeader.split(';')[0]
  const separatorIndex = nameValuePair.indexOf('=')
  const cookieName = nameValuePair.slice(0, separatorIndex)
  const cookieValue = nameValuePair.slice(separatorIndex + 1)
  await page.context().addCookies([{ name: cookieName, value: cookieValue, url: baseURL }])

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
  const loginResponse = await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const setCookieHeader = loginResponse.headers()['set-cookie']
  const nameValuePair = setCookieHeader.split(';')[0]
  const separatorIndex = nameValuePair.indexOf('=')
  const cookieName = nameValuePair.slice(0, separatorIndex)
  const cookieValue = nameValuePair.slice(separatorIndex + 1)
  await page.context().addCookies([{ name: cookieName, value: cookieValue, url: baseURL }])

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
  const loginResponse = await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const setCookieHeader = loginResponse.headers()['set-cookie']
  const nameValuePair = setCookieHeader.split(';')[0]
  const separatorIndex = nameValuePair.indexOf('=')
  const cookieName = nameValuePair.slice(0, separatorIndex)
  const cookieValue = nameValuePair.slice(separatorIndex + 1)
  await page.context().addCookies([{ name: cookieName, value: cookieValue, url: baseURL }])

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
  // the Venue select's "...Attendance..." option text; Venue/Scoring
  // ruleset must stay non-exact (substring) since their own accessible name
  // is never exactly their label text.
  await page.getByLabel('Name', { exact: true }).fill(sessionName)
  await page.getByLabel('Venue').selectOption(venue.id)
  await page.getByLabel('Scoring ruleset').selectOption('usap-2026-sideout-11-doubles')
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
