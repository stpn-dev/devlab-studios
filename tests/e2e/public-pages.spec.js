import { test, expect } from '@playwright/test'

const pages = [
  { path: '/', heading: 'Build the systems behind faster operations' },
  { path: '/about', heading: 'Systems for clearer offers' },
  { path: '/services', heading: 'Business automation, AI agents, and web systems' },
  { path: '/profile', heading: 'Profile' },
  { path: '/insights', heading: 'Guides, AI updates, and operational notes' },
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
  await page.goto('/resources')
  await expect(page).toHaveURL(/\/insights$/)
})

test('a specific insights article loads via the old /resources/:slug redirect', async ({ page, request }) => {
  const feedResponse = await request.get('/api/articles')
  const { data } = await feedResponse.json()
  const firstSlug = data?.posts?.[0]?.slug
  test.skip(!firstSlug, 'No published articles to verify')

  await page.goto(`/resources/${firstSlug}`)
  await expect(page).toHaveURL(new RegExp(`/insights/${firstSlug}$`))
})

test('unknown route shows 404 page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist')
  expect(response.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible()
})
