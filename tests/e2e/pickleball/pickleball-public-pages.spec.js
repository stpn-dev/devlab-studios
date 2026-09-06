import { test, expect } from '@playwright/test'

// The public pickleball pages are anonymous — no login helper needed. They
// are served by the worker (astro `output: 'server'`), so this file matches
// the `worker` Playwright project via the pickleball/ path convention.

test.describe('Pickleball public pages', () => {
  test('the landing page renders a hero with both calls to action', async ({ page }) => {
    const response = await page.goto('/pickleball')
    expect(response.status()).toBe(200)

    await expect(page.locator('main h1')).toContainText('Devlab Pickleball')
    await expect(page.getByRole('link', { name: 'Operator sign in' })).toHaveAttribute('href', '/pickleball/app')
    await expect(page.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '/pickleball/how-it-works')
  })

  test('every decorative illustration is hidden from assistive technology', async ({ page }) => {
    await page.goto('/pickleball')

    // Scoped to exclude #request-access: a later task adds a hydrated
    // ContactForm inside main whose icons are not aria-hidden.
    const svgs = page.locator('main section:not(#request-access) svg')
    const count = await svgs.count()
    expect(count).toBeGreaterThan(0)
    for (let index = 0; index < count; index += 1) {
      await expect(svgs.nth(index)).toHaveAttribute('aria-hidden', 'true')
    }
  })

  test('the landing page ships no artwork JavaScript', async ({ page }) => {
    // Art is rendered statically (no client: directive), so the hero must be
    // in the server HTML rather than appearing after hydration. Footer.astro
    // also renders an aria-hidden <svg> outside <main> on every page, so a
    // bare `<svg>` check would still pass even if CourtSceneArt were switched
    // to a client:*-hydrated component that rendered nothing server-side.
    // Assert on a marker unique to CourtSceneArt's viewBox, scoped to <main>.
    const response = await page.request.get('/pickleball')
    const html = await response.text()
    expect(html).toContain('Operator sign in')

    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)
    expect(mainMatch).not.toBeNull()
    expect(mainMatch[1]).toContain('viewBox="0 0 320 200"')
  })

  test('the landing page explains the product with a four-card feature grid', async ({ page }) => {
    await page.goto('/pickleball')

    const grid = page.getByTestId('pb-feature-grid')
    await expect(grid).toBeVisible()
    await expect(grid.locator('> article')).toHaveCount(4)

    for (const heading of ['Fair queueing', 'Rally scoring', 'Live standings', 'Share it live']) {
      await expect(grid.getByRole('heading', { name: heading })).toBeVisible()
    }
  })

  test('the landing page backs its claims with sections a reader can scan', async ({ page }) => {
    await page.goto('/pickleball')

    await expect(page.getByRole('heading', { name: 'Every match-up explains itself' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nothing is ever lost' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Everyone sees the same score' })).toBeVisible()
    await expect(page.getByTestId('pb-faq').locator('> details')).toHaveCount(5)
  })

  test('the landing page names no competitor', async ({ page }) => {
    const html = (await (await page.request.get('/pickleball')).text()).toLowerCase()
    expect(html).not.toContain('pickleq')
    expect(html).not.toContain('unlike other')
  })

  test('the guide page walks through all eight steps', async ({ page }) => {
    const response = await page.goto('/pickleball/how-it-works')
    expect(response.status()).toBe(200)

    await expect(page.locator('main h1')).toContainText('How Devlab Pickleball works')
    await expect(page.getByTestId('pb-guide-steps').locator('> article')).toHaveCount(8)

    for (const step of [
      'Create a session',
      'Open it for check-in',
      'Check players in',
      'The queue fills',
      'Assign a court',
      'Score the game',
      'Finish the game',
      'Complete the session',
    ]) {
      await expect(page.getByRole('heading', { name: step })).toBeVisible()
    }
  })

  test('the guide does not document features that do not work yet', async ({ page }) => {
    // Fixed pairs and tournaments are inert today — assignCourt refuses any
    // session whose type is not OPEN_PLAY. Documenting them would be a lie.
    const html = (await (await page.request.get('/pickleball/how-it-works')).text()).toLowerCase()
    expect(html).not.toContain('fixed pair')
    expect(html).not.toContain('tournament')
  })
})
