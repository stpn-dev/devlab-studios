import { test, expect } from '@playwright/test'

// Budgets are for total image bytes transferred once the page has been
// scrolled through, which is what triggers loading="lazy" image fetches
// and client:visible island hydration below the fold — not a strict
// "first paint, no scroll" measurement. Tightened once the optimization
// pipeline (Tasks 2-6) lands; see docs/performance/baseline-2026-07-31/README.md
// for the pre-fix reference numbers (Home: 583 KiB total, Profile: 862 KiB total).
const IMAGE_BUDGETS_KB = {
  '/': 150,
  '/profile': 174,
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
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState('networkidle')

  await Promise.all(pending)
  return totalBytes
}

for (const [path, budgetKb] of Object.entries(IMAGE_BUDGETS_KB)) {
  test(`${path} keeps total image weight under ${budgetKb}KB`, async ({ page }) => {
    const totalBytes = await measureImageBytes(page, path)
    expect(totalBytes / 1024).toBeLessThan(budgetKb)
  })
}
