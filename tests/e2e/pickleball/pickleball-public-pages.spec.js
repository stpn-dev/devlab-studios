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

  // Both structural art guards below run once per public page that ships its
  // own illustrations (the landing page and the how-it-works guide), so a
  // future page in this family is checked by adding one entry here rather
  // than a whole new pair of tests. `viewBox` is a marker unique to that
  // page's art (CourtSceneArt for the landing page; every Step*Art shares
  // "0 0 120 90" on the guide page), and `htmlMarker` is real page copy that
  // could only be present in server-rendered HTML.
  const artPages = [
    { path: '/pickleball', htmlMarker: 'Operator sign in', viewBox: '0 0 320 200' },
    { path: '/pickleball/how-it-works', htmlMarker: 'How Devlab Pickleball works', viewBox: '0 0 120 90' },
  ]

  for (const { path, htmlMarker, viewBox } of artPages) {
    test(`every decorative illustration is hidden from assistive technology (${path})`, async ({ page }) => {
      await page.goto(path)

      // Scoped to exclude #request-access: a later task adds a hydrated
      // ContactForm inside main whose icons are not aria-hidden.
      const svgs = page.locator('main section:not(#request-access) svg')
      const count = await svgs.count()
      expect(count).toBeGreaterThan(0)
      for (let index = 0; index < count; index += 1) {
        await expect(svgs.nth(index)).toHaveAttribute('aria-hidden', 'true')
      }
    })

    test(`ships no artwork JavaScript (${path})`, async ({ page }) => {
      // Art is rendered statically (no client: directive), so it must be in
      // the server HTML rather than appearing after hydration. Footer.astro
      // also renders an aria-hidden <svg> outside <main> on every page, so a
      // bare `<svg>` check would still pass even if the art were switched to
      // a client:*-hydrated component that rendered nothing server-side.
      // Assert on a marker unique to this page's art, scoped to <main>.
      const response = await page.request.get(path)
      const html = await response.text()
      expect(html).toContain(htmlMarker)

      const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)
      expect(mainMatch).not.toBeNull()
      expect(mainMatch[1]).toContain(`viewBox="${viewBox}"`)
    })
  }

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

  test('a blocked sign-in offers a way to request access', async ({ page }) => {
    await page.goto('/pickleball/app?error=no_access')

    await expect(page.getByRole('alert')).toContainText('no active Pickleball membership')
    await expect(page.getByRole('link', { name: 'Request access' })).toHaveAttribute(
      'href',
      '/pickleball#request-access',
    )
  })
})
