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
  await page.getByRole('button', { name: 'Site Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Site Settings CMS' })).toBeVisible()
})

test('site settings save round-trip persists across reload', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Site Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Site Settings CMS' })).toBeVisible()

  const taglineInput = page.getByLabel(/tagline/i).first()
  const marker = `Smoke test tagline ${Date.now()}`
  await taglineInput.fill(marker)
  await page.getByRole('button', { name: /^save/i }).first().click()
  await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 })

  await page.reload()
  await page.getByRole('button', { name: 'Site Settings' }).click()
  await expect(page.getByLabel(/tagline/i).first()).toHaveValue(marker)
})
