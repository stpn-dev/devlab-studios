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
