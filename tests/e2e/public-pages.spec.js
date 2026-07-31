import { test, expect } from '@playwright/test'

const pages = [
  { path: '/', heading: 'Build the systems behind faster operations' },
  { path: '/about', heading: 'Systems for clearer offers' },
  { path: '/services', heading: 'Business automation, AI agents, and web systems' },
  { path: '/profile', heading: 'Profile' },
  { path: '/resources', heading: 'Guides, AI updates, and operational notes' },
  { path: '/contact', heading: 'Contact Me' },
  { path: '/landing-sample-react', heading: 'A Different Look' },
  { path: '/landing-sample-html', heading: 'Editorial Minimal Landing Page' },
  { path: '/landing-sample-fullstack', heading: 'Operations Dashboard Website' },
  { path: '/landing-sample-local-service', heading: 'Phone-First Layout for' },
  { path: '/landing-sample-ecommerce', heading: 'Catalog-First Shopping Flow' },
]

for (const { path, heading } of pages) {
  test(`${path} loads and shows its heading`, async ({ page }) => {
    const response = await page.goto(path)
    expect(response.status()).toBe(200)
    await expect(page.getByRole('heading', { name: new RegExp(heading, 'i') }).first()).toBeVisible()
  })
}

test('legacy redirects still work', async ({ page }) => {
  await page.goto('/experiences')
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto('/portfolio')
  await expect(page).toHaveURL(/\/profile$/)
})

test('unknown route shows 404 page', async ({ page }) => {
  await page.goto('/this-route-does-not-exist')
  await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible()
})
