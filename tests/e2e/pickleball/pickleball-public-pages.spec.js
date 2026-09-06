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
})
