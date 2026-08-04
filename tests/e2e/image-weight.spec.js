import { test, expect } from '@playwright/test'

// Budgets are for total image bytes transferred on first load, not full
// page weight. Tightened once the optimization pipeline (Tasks 2-6) lands;
// see docs/performance/baseline-2026-07-31/README.md for the pre-fix
// reference numbers (Home: 583 KiB total, Profile: 862 KiB total).
const IMAGE_BUDGETS_KB = {
  '/': 150,
  '/profile': 700,
}

async function measureImageBytes(page, path) {
  let totalBytes = 0

  page.on('response', async (response) => {
    const contentType = response.headers()['content-type'] || ''
    if (!contentType.startsWith('image/')) return
    const body = await response.body().catch(() => null)
    if (body) totalBytes += body.length
  })

  await page.goto(path, { waitUntil: 'networkidle' })
  return totalBytes
}

for (const [path, budgetKb] of Object.entries(IMAGE_BUDGETS_KB)) {
  test(`${path} keeps total image weight under ${budgetKb}KB`, async ({ page }) => {
    const totalBytes = await measureImageBytes(page, path)
    expect(totalBytes / 1024).toBeLessThan(budgetKb)
  })
}
