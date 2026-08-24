import { test, expect } from '@playwright/test'

test.describe('Pickleball auth', () => {
  test('unauthenticated session check returns 401', async ({ request }) => {
    const response = await request.get('/api/pickleball/auth/session')
    expect(response.status()).toBe(401)
  })

  test('OAuth start redirects to Google with PKCE and state params', async ({ request }) => {
    // Inspect the 302 response directly instead of letting a browser follow
    // it — this asserts our own redirect construction without making a real
    // network request to Google (avoids CI flakiness/external dependency).
    const response = await request.get('/api/pickleball/auth/google/start', { maxRedirects: 0 })
    expect(response.status()).toBe(302)

    const location = new URL(response.headers()['location'])
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('state')).toBeTruthy()
  })

  test('login page renders for an unauthenticated visit to /pickleball/app', async ({ page }) => {
    await page.goto('/pickleball/app')
    await expect(page.getByText('Sign in with Google')).toBeVisible()
  })

  test('test-login issues a working session for an invited email', async ({ request }) => {
    // Requires a membership for this email to already exist locally — seeded via
    // `npm run pickleball:create-organization -- "Test Club" "test-club" "operator@example.com"`
    // applied to the local D1 before running this suite (documented in docs/pickleball/runbook.md).
    const loginResponse = await request.post('/api/pickleball/auth/test-login', {
      data: { email: 'operator@example.com' },
    })
    expect(loginResponse.ok()).toBe(true)

    const sessionResponse = await request.get('/api/pickleball/auth/session')
    expect(sessionResponse.ok()).toBe(true)
    const body = await sessionResponse.json()
    expect(body.role).toBe('ADMIN')
  })
})
