import { test, expect } from '@playwright/test'

const pages = [
  { path: '/', heading: 'From first click to final handoff' },
  { path: '/about', heading: 'Systems for clearer offers' },
  { path: '/services', heading: 'Full-stack products and AI automation' },
  { path: '/profile', heading: 'Full-stack engineering with an automation mindset' },
  { path: '/insights', heading: 'Guides, AI updates, and operational notes' },
  { path: '/process', heading: 'A four-phase delivery model' },
  { path: '/privacy', heading: 'Privacy Policy' },
  { path: '/terms', heading: 'Terms of Service' },
  { path: '/work', heading: 'Full-stack builds and automation systems' },
  { path: '/contact', heading: 'Tell us where the workflow slows down' },
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

test('unknown case study slug returns a real 404 status', async ({ page }) => {
  const response = await page.goto('/work/this-case-study-does-not-exist')
  expect(response.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Case study not found' })).toBeVisible()
})

test('footer has real links to Privacy and Terms', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
})

test('resume is available from Profile only and opens inline', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /resume/i })).toHaveCount(0)

  await page.goto('/profile')
  const resumeLink = page.getByRole('link', { name: 'View Resume' })
  await expect(resumeLink).toHaveAttribute('href', '/resume.pdf')
  await expect(resumeLink).toHaveAttribute('target', '_blank')
  await expect(resumeLink).not.toHaveAttribute('download', /.*/)

  const response = await request.get('/resume.pdf')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  expect(response.headers()['content-disposition'] || '').not.toContain('attachment')
})

test('decorative vector motifs stay out of the accessibility tree', async ({ page }) => {
  await page.goto('/')
  const fields = page.locator('.vector-field')
  await expect(fields.first()).toHaveAttribute('aria-hidden', 'true')
})

test('security headers apply to real, server-rendered responses, not just static assets', async ({ request }) => {
  // public/_headers only ever reaches responses served directly from the
  // static ASSETS binding — with output:'server' almost every real
  // response (every page, /admin, every /api/* route) is instead rendered
  // by Astro and passes through src/middleware.ts, so this is the only
  // way to prove the headers actually protect what visitors load.
  const pageResponse = await request.get('/')
  const pageHeaders = pageResponse.headers()
  expect(pageHeaders['content-security-policy']).toContain("default-src 'self'")
  expect(pageHeaders['x-frame-options']).toBe('DENY')
  expect(pageHeaders['x-content-type-options']).toBe('nosniff')
  expect(pageHeaders['strict-transport-security']).toContain('max-age=')
  expect(pageHeaders['x-robots-tag']).toBeUndefined()

  const apiResponse = await request.get('/api/health')
  expect(apiResponse.headers()['content-security-policy']).toContain("default-src 'self'")

  const adminResponse = await request.get('/admin')
  expect(adminResponse.headers()['x-robots-tag']).toBe('noindex, nofollow')

  const landingSampleResponse = await request.get('/landing-sample-react')
  expect(landingSampleResponse.headers()['x-robots-tag']).toBe('noindex, follow')
})

test('the contact form CSP allows Turnstile to actually load', async ({ page }) => {
  const cspViolations = []
  page.on('console', (message) => {
    if (message.text().toLowerCase().includes('content security policy')) {
      cspViolations.push(message.text())
    }
  })

  await page.goto('/contact')
  await page.waitForFunction(() => Boolean(window.turnstile), { timeout: 10_000 })
  expect(cspViolations).toEqual([])
})
