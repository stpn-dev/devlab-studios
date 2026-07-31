import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = 'smoke-test@devlabstudios.com'
const ADMIN_PASSWORD = 'smoke-test-password-123'

async function login(page) {
  await page.goto('/admin')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('button', { name: /log ?out/i })).toBeVisible({ timeout: 10_000 })
}

test('health endpoint reports DB and media bucket bindings', async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/api/health`)
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(body.hasDb).toBe(true)
  expect(body.hasMediaBucket).toBe(true)
})

test('rejects an invalid login', async ({ page }) => {
  await page.goto('/admin')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText(/invalid email or password/i)).toBeVisible()
})

test('logs in and can open Site Settings', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Site Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Site Settings', level: 2 })).toBeVisible()
})

test('site settings save round-trip persists across reload', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Site Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Site Settings', level: 2 })).toBeVisible()

  const taglineInput = page.getByLabel(/tagline/i).first()
  const marker = `Smoke test tagline ${Date.now()}`
  await taglineInput.fill(marker)
  await page.getByRole('button', { name: /^save/i }).first().click()
  await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 })

  await page.reload()
  await page.getByRole('link', { name: 'Site Settings' }).click()
  await expect(page.getByLabel(/tagline/i).first()).toHaveValue(marker)
})

test('testimonials collection round-trip persists across reload', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Testimonials' }).click()
  await expect(page.getByRole('heading', { name: 'Testimonials', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: /^add testimonial/i }).click()
  const marker = `Smoke test quote ${Date.now()}`
  // sortOrder 0 guarantees this item sorts first (ASC) regardless of what
  // other items already exist, so `.first()` reliably targets it below —
  // `.last()` isn't safe here since ties break on most-recently-updated.
  await page.getByLabel('Quote').last().fill(marker)
  await page.getByLabel('Author Name').last().fill('Smoke Test Author')
  await page.getByLabel('Sort Order').last().fill('0')
  await page.getByRole('button', { name: /^save all/i }).click()
  await expect(page.getByText(/^saved/i)).toBeVisible({ timeout: 10_000 })

  await page.reload()
  await expect(page.getByLabel('Quote').first()).toHaveValue(marker)

  // Clean up so repeated runs don't accumulate smoke-test rows.
  await page.getByRole('button', { name: 'Remove' }).first().click()
  await page.getByRole('button', { name: /^save all/i }).click()
  await expect(page.getByText(/^saved/i)).toBeVisible({ timeout: 10_000 })
})

test('redirects collection: create, verify in list, then delete', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Redirects' }).click()
  await expect(page.getByRole('heading', { name: 'Redirects', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: /^add new/i }).click()
  const fromPath = `/smoke-test-${Date.now()}`
  await page.getByLabel('From Path').fill(fromPath)
  await page.getByLabel('To Path').fill('/profile')
  await page.getByRole('button', { name: /^save$/i }).click()
  await expect(page.getByText(/^saved/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: new RegExp(fromPath.replace('/', '\\/')) })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /^delete$/i }).click()
  await expect(page.getByRole('button', { name: new RegExp(fromPath.replace('/', '\\/')) })).not.toBeVisible()
})

test('page builder: add a block, save, verify it persists, then remove it', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { name: /^Page:/, level: 1 })).toBeVisible()

  await page.getByRole('button', { name: /^add block/i }).click()
  const marker = `Smoke test heading ${Date.now()}`
  await page.getByLabel('Heading').first().fill(marker)
  await page.getByRole('button', { name: /^save page/i }).click()
  await expect(page.getByText(/^saved/i)).toBeVisible({ timeout: 10_000 })

  await page.reload()
  await expect(page.getByLabel('Heading').first()).toHaveValue(marker)

  await page.getByRole('button', { name: 'Remove' }).first().click()
  await page.getByRole('button', { name: /^save page/i }).click()
  await expect(page.getByText(/^saved/i)).toBeVisible({ timeout: 10_000 })
})

test('a lead persists in D1 and shows a failed delivery attempt when Zoho is unreachable', async ({ page, baseURL }) => {
  // .dev.vars points ZOHO_WEBHOOK_URL at an RFC 2606 .invalid address, so
  // delivery is guaranteed to fail here — this is exactly what proves the
  // core Phase 5 guarantee: the lead survives a downstream outage.
  // Both subject and message must be unique per run: findRecentDuplicateLead
  // dedupes on email+message within a 5-minute window, so a repeated message
  // here would be (correctly) treated as a resubmission of the same inquiry
  // and skip a fresh delivery attempt entirely.
  const marker = `Smoke test lead ${Date.now()}`
  const response = await page.request.post(`${baseURL}/api/contact`, {
    data: { name: 'Smoke Test', email: 'smoke-test-lead@example.com', subject: marker, message: `Verifying lead persistence. ${marker}` },
  })
  expect(response.ok()).toBeTruthy()

  await login(page)

  // The Zoho attempt runs in the background (waitUntil) — poll briefly for
  // the delivery_attempts row to land rather than assuming it's instant.
  await expect(async () => {
    const leadsResponse = await page.request.get(`${baseURL}/api/admin/leads`)
    const leads = await leadsResponse.json()
    const lead = leads.find((item) => item.subject === marker)
    expect(lead).toBeTruthy()
    expect(lead.status).toBe('failed')
  }).toPass({ timeout: 10_000 })

  await page.getByRole('navigation').getByRole('link', { name: 'Leads' }).click()
  await page.getByText(marker).click()
  await expect(page.getByText(/attempt 1/i)).toBeVisible()
  await expect(page.getByText('failure').first()).toBeVisible()
})
