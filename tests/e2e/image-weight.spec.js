import { test, expect } from '@playwright/test'

// Budgets are for total image bytes transferred once the page has been
// scrolled through, which is what triggers loading="lazy" image fetches
// and client:visible island hydration below the fold — not a strict
// "first paint, no scroll" measurement. Tightened once the optimization
// pipeline (Tasks 2-6) lands; see docs/performance/baseline-2026-07-31/README.md
// for the pre-fix reference numbers (Home: 583 KiB total, Profile: 862 KiB total).
//
// This spec runs across all three Playwright projects (`static` at DPR 1,
// `desktop-safari` at DPR 2, `mobile-safari` at DPR 3); the `densities: [1, 2]`
// srcset variants mean higher-DPR projects can legitimately download larger
// `2x` images. Verified directly (2026-08-04) that all three projects still
// pass under these numbers with current headroom — re-check headroom on all
// three projects if these budgets are ever tightened further.
const IMAGE_BUDGETS_KB = {
  '/': 150,
  // Raised from 174 for the Profile page redesign (2026-08). Root-caused
  // via diagnostic scripts, not guessed:
  //
  // 1. The "Automation" category alone has 13 projects, not the ~5 visible
  //    in the carousel at a glance. Every project in the active category
  //    was rendered as a real `<img>` in the DOM at once inside the
  //    carousel's `overflow: hidden` track (Embla, Task 8); native
  //    `loading="lazy"` doesn't account for that clipping, so browsers
  //    loaded a non-deterministic subset of them (observed 5-11 of 13
  //    across runs) instead of just the 2-3 actually visible — a real
  //    architectural bug, not a test-measurement issue. Fixed at the
  //    source in `PortfolioGallery.jsx`/`PortfolioCard.jsx`: a slide now
  //    only gets a real cover image once it's within `NEAR_WINDOW` (2) of
  //    the currently-selected slide (tracked via Embla's own
  //    `selectedScrollSnap()`); farther slides render a lightweight
  //    placeholder until autoplay/navigation brings them close. This
  //    bounds the carousel to at most 5 real images loaded at once,
  //    regardless of how many projects a category holds.
  // 2. Separately, CertificationsGallery uses `client:visible`, so its 4
  //    badge images only start loading once that island's JS chunk
  //    fetches, hydrates, and its own IntersectionObserver fires — several
  //    async steps beyond a plain `<img loading="lazy">`. This suite's old
  //    fixed-timing scroll+settle logic sometimes raced past that,
  //    non-deterministically undercounting by ~74KB regardless of
  //    concurrency (this pre-dates this branch — a latent gap the
  //    carousel's added weight simply removed the headroom that had been
  //    quietly absorbing it). `measureImageBytes` now polls the DOM's own
  //    real `<img>` count until it's actually stable instead of guessing
  //    with a fixed wait.
  //
  // With both fixed, /profile measures a stable ~256KB on desktop-safari
  // (DPR 2, the worst case of the three projects) — verified consistent
  // across repeated isolated AND concurrent 3-project runs. 280 leaves
  // real headroom. Re-check if `NEAR_WINDOW` changes or more categories/
  // projects are added.
  '/profile': 280,
}

async function measureImageBytes(page, path) {
  let totalBytes = 0
  const pending = []

  page.on('response', (response) => {
    const contentType = response.headers()['content-type'] || ''
    if (!contentType.startsWith('image/')) return
    pending.push(
      response.body().then((body) => {
        totalBytes += body.length
      }).catch(() => {}),
    )
  })

  await page.goto(path, { waitUntil: 'networkidle' })

  await page.evaluate(async () => {
    const step = window.innerHeight
    // 500ms dwell per step (not 200ms): `client:visible` islands need time
    // to fetch their JS chunk, hydrate, and have their own IntersectionObserver
    // fire before their images start loading — a plain `<img loading="lazy">`
    // reacts to scroll almost immediately, but a hydrating island doesn't.
    // A too-short dwell here previously raced past that and undercounted.
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState('networkidle')

  // Wait deterministically for the DOM's own real `<img>` count to settle,
  // polled entirely inside the browser (no Node round-trip lag). Multiple
  // `client:visible` islands here (PortfolioGallery, CertificationsGallery)
  // each hydrate and render their images on their own schedule; a fixed
  // settle time unpredictably raced past one or another under slower/
  // contended conditions and silently undercounted (this is what previously
  // looked like flaky over/under-counting). Resolves once the count is
  // unchanged across 3 consecutive 300ms polls, or after ~15s regardless.
  await page.waitForFunction(
    () => {
      const w = window
      const count = document.querySelectorAll('img[src]:not([src^="data:"])').length
      if (count !== w.__imgCountLast) {
        w.__imgCountLast = count
        w.__imgCountStableSince = Date.now()
      }
      return Date.now() - (w.__imgCountStableSince || 0) > 900
    },
    { timeout: 15000, polling: 300 },
  ).catch(() => {})

  // The DOM's `<img>` count settling doesn't guarantee every corresponding
  // network response has arrived yet — give in-flight requests a moment to
  // land, then wait for the count of responses actually captured to catch
  // up to what the DOM says should exist.
  for (let i = 0; i < 10; i++) {
    const expectedImgCount = await page.evaluate(
      () => document.querySelectorAll('img[src]:not([src^="data:"])').length,
    )
    if (pending.length >= expectedImgCount) break
    await page.waitForTimeout(400)
  }

  await Promise.all(pending)
  return totalBytes
}

for (const [path, budgetKb] of Object.entries(IMAGE_BUDGETS_KB)) {
  test(`${path} keeps total image weight under ${budgetKb}KB`, async ({ page }) => {
    const totalBytes = await measureImageBytes(page, path)
    expect(totalBytes / 1024).toBeLessThan(budgetKb)
  })
}
