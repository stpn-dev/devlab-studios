import { test, expect } from '@playwright/test'

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

test('submits successfully and shows a success message', async ({ page }) => {
  await page.route('**/api/contact', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )

  await page.goto('/contact')
  await fillForm(page)
  await page.getByRole('button', { name: /send/i }).click()

  await expect(page.getByRole('status')).toContainText(/sent successfully/i)
})

test('shows an error message when the API call fails', async ({ page }) => {
  await page.route('**/api/contact', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
  )

  await page.goto('/contact')
  await fillForm(page)
  await page.getByRole('button', { name: /send/i }).click()

  await expect(page.getByRole('status')).toBeVisible()
})

test('shows validation errors on an empty submit', async ({ page }) => {
  await page.goto('/contact')
  await page.getByRole('button', { name: /send/i }).click()

  await expect(page.getByText(/full name is required/i)).toBeVisible()
})
