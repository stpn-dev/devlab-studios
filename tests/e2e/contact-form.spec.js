import { test, expect } from '@playwright/test'

test.describe.configure({ timeout: 60_000 })

const validForm = {
  name: 'Test User',
  email: 'test@example.com',
  subject: 'Smoke test',
  message: 'This is a smoke test submission.',
}

async function fillForm(page) {
  await page.getByLabel(/full name/i).fill(validForm.name)
  await page.getByRole('textbox', { name: 'Email' }).fill(validForm.email)
  await page.getByLabel(/subject/i).fill(validForm.subject)
  await page.getByLabel(/message/i).fill(validForm.message)
}

// The form is a client:load React island — the Send button is present in
// the server-rendered HTML before hydration attaches its submit handler, so
// clicking too early falls through to a native (unhandled) form submit.
// `networkidle` used to be the wait signal here, but the Turnstile widget
// (added for spam protection) does continuous background network activity
// that networkidle never resolves against — so instead, wrap the
// click+assert pair in `toPass()` to retry the click if hydration hasn't
// attached its handler yet.
async function gotoContact(page) {
  await page.goto('/contact')
  await expect(page.getByText(/secure verification complete/i)).toBeVisible({ timeout: 30_000 })
}

test('submits successfully and shows a success message', async ({ page }) => {
  await page.route('**/api/contact', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )

  await gotoContact(page)
  // fillForm is inside the retry block, not before it: a successful submit
  // clears the form (setForm(initialForm)), so if the first click's result
  // wasn't observed in time and toPass() retries, it must re-fill before
  // re-clicking — otherwise the retry submits an empty form and fails
  // client-side validation instead of re-testing the real assertion.
  await expect(async () => {
    await fillForm(page)
    await page.getByRole('button', { name: /send/i }).click()
    await expect(page.getByRole('status')).toContainText(/sent successfully/i, { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
})

test('shows an error message when the API call fails', async ({ page }) => {
  await page.route('**/api/contact', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
  )

  await gotoContact(page)
  await expect(async () => {
    await fillForm(page)
    await page.getByRole('button', { name: /send/i }).click()
    await expect(page.getByRole('status')).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
})

test('shows validation errors on an empty submit', async ({ page }) => {
  await gotoContact(page)
  await expect(async () => {
    await page.getByRole('button', { name: /send/i }).click()
    await expect(page.getByText(/full name is required/i)).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
})
