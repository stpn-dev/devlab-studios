import { test, expect } from '@playwright/test'

// The public pickleball pages are anonymous — no login helper needed. They
// are served by the worker (astro `output: 'server'`), so this file matches
// the `worker` Playwright project via the pickleball/ path convention.

/**
 * All of <main>'s copy as one string — including text inside collapsed
 * <details> (which `innerText` would drop) but excluding <script>/<style>,
 * whose minified contents would otherwise be searched as if they were page
 * copy. Used by every copy assertion below.
 */
async function mainCopy(page) {
  return page.locator('main').evaluate((element) => {
    const clone = element.cloneNode(true)
    for (const node of clone.querySelectorAll('script, style, template')) node.remove()
    return clone.textContent
  })
}

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

      // Positively scoped to the elements that actually hold this plan's
      // artwork (`data-testid="pb-artwork"` on each art container). An
      // earlier `main section:not(#request-access) svg` form excluded
      // nothing — ContactForm renders its own nested <section
      // class="form-surface"> INSIDE #request-access, which matches
      // `section:not(#request-access)` — so the guard was silently also
      // asserting on a shared component this plan does not own.
      const svgs = page.locator('main [data-testid="pb-artwork"] svg')
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

      // The server-HTML check above is necessary but NOT sufficient: Astro
      // server-renders `client:load`/`client:idle`/`client:visible` islands
      // too (only `client:only` skips SSR), so adding a client: directive to
      // an art component would ship a hydration bundle while the markup
      // above still matched. An island's SSR output is wrapped in
      // <astro-island>, so no art <svg> may have one as an ancestor. Scoped
      // to `[data-testid="pb-artwork"]`, which deliberately excludes the
      // ContactForm island #request-access mounts `client:visible` on
      // purpose.
      await page.goto(path)
      await expect(page.locator('astro-island [data-testid="pb-artwork"] svg')).toHaveCount(0)
      await expect(page.locator('[data-testid="pb-artwork"] astro-island')).toHaveCount(0)
    })
  }

  test('the landing page explains the product with a four-card feature grid', async ({ page }) => {
    await page.goto('/pickleball')

    const grid = page.getByTestId('pb-feature-grid')
    await expect(grid).toBeVisible()
    await expect(grid.locator('> article')).toHaveCount(4)

    // "Rally-by-rally scoring", never "Rally scoring": the engine is
    // side-out (recordRally.ts awards a point only to the serving team) and
    // the FAQ says so, but "rally scoring" names the OPPOSITE system to a
    // pickleball-literate reader.
    for (const heading of ['Fair queueing', 'Rally-by-rally scoring', 'Live standings', 'Share it live']) {
      await expect(grid.getByRole('heading', { name: heading })).toBeVisible()
    }
  })

  test('the landing page backs its claims with sections a reader can scan', async ({ page }) => {
    await page.goto('/pickleball')

    await expect(page.getByRole('heading', { name: 'Every match-up explains itself' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nothing is ever lost' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Everyone sees the same score' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Standings from the first minute' })).toBeVisible()
    await expect(page.getByTestId('pb-faq').locator('> details')).toHaveCount(5)
  })

  // Spec §1.3: no competitor is named and no comparative claim is made.
  // Real brand names in this market, none of which may appear. USA
  // Pickleball, DUPR and UTR-P are deliberately absent from this list: the
  // FAQ names them on purpose, to disclaim that OPI is any of them.
  const COMPETITOR_BRANDS = [
    'pickleq',
    'playbypoint',
    'courtreserve',
    'pickleplanner',
    'teamreach',
    'playtime scheduler',
    'pickleball brackets',
    'swingvision',
    'globalpickleball',
    'pickleball den',
  ]
  const COMPARATIVE_LANGUAGE = /\bunlike\b|\bbetter than\b|\bcompared to\b|\bvs\.?\s/i

  for (const path of ['/pickleball', '/pickleball/how-it-works']) {
    test(`names no competitor and makes no comparative claim (${path})`, async ({ page }) => {
      await page.goto(path)

      // Brand names are swept across the WHOLE served document, not just
      // <main>: a competitor named in the <title>, the meta description or
      // an OG tag is just as much a breach of the constraint as one in the
      // body, and those live outside <main>.
      const html = (await (await page.request.get(path)).text()).toLowerCase()
      for (const brand of COMPETITOR_BRANDS) {
        expect(html, `must not name ${brand}`).not.toContain(brand)
      }

      // Comparative language is checked against rendered <main> text only.
      // The whole-document HTML carries CMS-authored nav and footer copy this
      // plan does not own, plus class names and URLs where a bare "vs" would
      // fire constantly — matching there would produce noise, not signal.
      const text = await mainCopy(page)
      expect(text).not.toMatch(COMPARATIVE_LANGUAGE)
    })
  }

  test('the guide page walks through all nine steps', async ({ page }) => {
    const response = await page.goto('/pickleball/how-it-works')
    expect(response.status()).toBe(200)

    await expect(page.locator('main h1')).toContainText('How Devlab Pickleball works')
    await expect(page.getByTestId('pb-guide-steps').locator('> article')).toHaveCount(9)

    // "Start the game" is its own step, not an aside: assignCourt only seats
    // the teams and flips the court to ASSIGNED — play does not begin until
    // POST /api/pickleball/sessions/[id]/games/start, driven by
    // GamesListPage.jsx's start-a-game form. Without it the guide jumped
    // from "Assign a court" straight to the two rally buttons.
    for (const step of [
      'Create a session',
      'Open it for check-in',
      'Check players in',
      'The queue fills',
      'Assign a court',
      'Start the game',
      'Score the game',
      'Finish the game',
      'Complete the session',
    ]) {
      await expect(page.getByRole('heading', { name: step })).toBeVisible()
    }
  })

  test('the guide offers a jump-link row to its main sections', async ({ page }) => {
    await page.goto('/pickleball/how-it-works')

    const jumpLinks = page.getByTestId('pb-guide-jump-links').locator('> a')
    await expect(jumpLinks).toHaveCount(3)

    for (const [name, href] of [
      ['Run a session', '#run-a-session'],
      ['Fix a mistake', '#when-something-goes-wrong'],
      ['What players see', '#what-players-see'],
    ]) {
      const link = page.getByTestId('pb-guide-jump-links').getByRole('link', { name })
      await expect(link).toHaveAttribute('href', href)
      // Every target must be a real id on this page, or the row is decoration.
      await expect(page.locator(href)).toHaveCount(1)
    }
  })

  // Eight public-copy claims on this branch were rewritten because the
  // committed code did not back the original wording. Each corrected phrase
  // is pinned verbatim here so a careless copy edit fails loudly instead of
  // silently reintroducing an unbacked claim.
  const correctedClaims = [
    {
      path: '/pickleball',
      phrases: [
        // Only reopen/correct is audited, not every change.
        'reopening or correcting a game is recorded in the audit log',
        // Standings ship a confidence tier.
        'confidence tier',
        // listSessionStandings() starts from the attending roster, so every
        // checked-in player is on the board before finishing a game. This
        // claim was false until sessionStandings.js landed and was reverted
        // twice; it is pinned so it cannot drift out of step with that query
        // again in either direction.
        'The board is populated the moment players check in',
        'win-loss record and point differential',
        // recordRally.ts awards a point only to the serving team.
        'Side-out scoring',
        'Rally-by-rally scoring',
        // Repeat-avoidance is conditional (>=5 eligible candidates, and an
        // equal-gamesPlayed replacement) — never unconditional.
        'Once at least five players are eligible',
      ],
    },
    {
      path: '/pickleball/how-it-works',
      phrases: [
        // permissions.ts grants a scorekeeper only session-scoped scoring.
        "scores games within a session they've been granted access to",
        // SessionStatusChip.jsx's label, and SessionControlPage.jsx's buttons.
        'Check-in open',
        'Open check-in',
        'Start session',
        // RecommendedMatchCard.jsx renders candidates, not "the match".
        'Recommended next players',
      ],
    },
  ]

  for (const { path, phrases } of correctedClaims) {
    test(`keeps its corrected claims verbatim (${path})`, async ({ page }) => {
      await page.goto(path)
      const text = await mainCopy(page)

      for (const phrase of phrases) {
        expect(text, `corrected claim must survive: ${phrase}`).toContain(phrase)
      }
    })
  }

  // Spec §1.8: heading hierarchy has no skipped level. Fails if either page
  // ever opens with something other than an <h1>, or jumps a level (an <h2>
  // followed by an <h4>, say) — the shape a screen-reader user navigates by.
  for (const path of ['/pickleball', '/pickleball/how-it-works']) {
    test(`skips no heading level (${path})`, async ({ page }) => {
      await page.goto(path)

      const levels = await page
        .locator('main h1, main h2, main h3, main h4, main h5, main h6')
        .evaluateAll((nodes) => nodes.map((node) => Number(node.tagName.slice(1))))

      expect(levels.length).toBeGreaterThan(0)
      expect(levels[0]).toBe(1)
      for (let index = 1; index < levels.length; index += 1) {
        expect(
          levels[index],
          `heading ${index + 1} is h${levels[index]} after h${levels[index - 1]}`,
        ).toBeLessThanOrEqual(levels[index - 1] + 1)
      }
    })
  }

  // Tournaments are still inert — assignCourt refuses any session whose type
  // is not OPEN_PLAY or FIXED_PAIRS, and no fixture/bracket model exists yet
  // (spec Part C, unbuilt). Documenting it would be a lie, so 'tournament'
  // stays blocked here. 'fixed pair' was removed from this guard: fixed
  // pairs shipped (spec Part B) — pair formation, pair-aware queueing and
  // assignment, and pair statistics are all real, and the guide's fixed-pairs
  // section documents them, so the string now appears in committed copy
  // rather than describing an inert feature. Both public pages are swept,
  // not just the guide: the landing page could gain unbuilt-feature copy
  // just as easily. Do not delete this test — when tournaments ship, retire
  // it then.
  for (const path of ['/pickleball', '/pickleball/how-it-works']) {
    test(`documents no unbuilt feature (${path})`, async ({ page }) => {
      const html = (await (await page.request.get(path)).text()).toLowerCase()
      expect(html).not.toContain('tournament')
    })
  }

  // These two pages are the product's public front door and are linked from
  // /services, so they need share metadata rather than a bare <title>. Both
  // resolve it through loadPageSeo(), which falls back to src/data/
  // seoContent.js when the CMS has no row — this asserts the fallback is
  // wired, which is what a fresh environment actually serves.
  for (const [path, slugTitle] of [
    ['/pickleball', 'Devlab Pickleball'],
    ['/pickleball/how-it-works', 'How Devlab Pickleball Works'],
    ['/pickleball/methodology', 'How OPI Works'],
  ]) {
    test(`serves share metadata (${path})`, async ({ page }) => {
      const html = await (await page.request.get(path)).text()

      expect(html).toMatch(/<meta name="description" content="[^"]{60,}"/)
      expect(html).toContain('<meta property="og:image"')
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
      expect(html).toContain(slugTitle)
    })
  }

  test('the OPI methodology page is reachable from where the reader asks the question', async ({ page }) => {
    // The methodology page lost its landing-page link in the rewrite and was
    // reachable only from the guide. The FAQ's "Is OPI an official rating?"
    // answer is where a reader actually forms the question, so the link lives
    // there now.
    await page.goto('/pickleball')

    // The answer lives in a <details>, so the link is outside the
    // accessibility tree until the reader opens it — open it the way they
    // would, then assert, rather than reaching past the collapsed state.
    await page.getByText('Is OPI an official rating?').click()
    const link = page.getByRole('link', { name: 'Read how OPI works' })
    await expect(link).toHaveAttribute('href', '/pickleball/methodology')

    const response = await page.request.get('/pickleball/methodology')
    expect(response.status()).toBe(200)
  })

  test('a blocked sign-in offers a way to request access', async ({ page }) => {
    await page.goto('/pickleball/app?error=no_access')

    await expect(page.getByRole('alert')).toContainText('no active Pickleball membership')
    await expect(page.getByRole('link', { name: 'Request access' })).toHaveAttribute(
      'href',
      '/pickleball#request-access',
    )
  })

  test('the landing page offers a way to request access', async ({ page }) => {
    await page.goto('/pickleball')

    const section = page.locator('#request-access')
    await expect(section).toBeVisible()
    await expect(section.getByRole('heading', { name: 'Request early access' })).toBeVisible()
    await expect(section.getByLabel('Your name')).toBeVisible({ timeout: 10000 })
    // The subject field's label and placeholder must ask for the same thing.
    // They previously disagreed ("Your club or venue" labelling a field
    // placeheld "Pickleball early access request"), which is also the only
    // thing marking a submission as a pickleball request: ContactForm.jsx
    // hardcodes `source: 'devlabstudios-contact-form'` and api/contact.ts
    // ignores it, so without the subject these are indistinguishable from a
    // generic contact.
    await expect(section.getByLabel('Subject')).toHaveAttribute('placeholder', 'Pickleball early access request')
  })

  test('the services page links to the pickleball product', async ({ page }) => {
    await page.goto('/services')

    await expect(page.getByRole('button', { name: 'Be a beta-tester' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '/pickleball')
  })
})
