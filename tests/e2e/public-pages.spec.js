import { test, expect } from '@playwright/test'

const pages = [
  { path: '/', heading: 'Your Vision, Digitally Crafted' },
  { path: '/about', heading: 'Systems for clearer offers' },
  { path: '/services', heading: 'Full-stack products and AI automation' },
  { path: '/profile', heading: 'Full-stack development with an automation mindset' },
  { path: '/insights', heading: 'Guides, AI updates, and operational notes' },
  { path: '/process', heading: 'A four-phase delivery model' },
  { path: '/privacy', heading: 'Privacy Policy' },
  { path: '/terms', heading: 'Terms of Service' },
  { path: '/work', heading: 'Automation systems with the decisions' },
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
  const footer = page.getByRole('contentinfo')
  await expect(footer.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  await expect(footer.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
  await expect(footer).toContainText('Your Vision, Digitally Crafted — one solution at a time, always evolving.')
  await expect(footer).not.toContainText(/(?:version history|smoke test) tagline/i)
})

test('primary navigation keeps About and Work visible without promoting Process', async ({ page }) => {
  await page.goto('/')
  const navigation = page.getByRole('banner').getByRole('navigation')
  await expect(navigation.getByRole('link')).toHaveText(['About', 'Services', 'Work', 'Insights', 'Profile'])
  await expect(navigation.getByRole('link', { name: 'Process' })).toHaveCount(0)
})

test('homepage preserves the canonical brand hierarchy and routes visitors to Work', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your Vision, Digitally Crafted — one solution at a time, always evolving.' })).toBeVisible()
  await expect(page.getByText('Full-stack Development + AI Automation', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Full-stack Development + AI Automation, connected from interface to handoff.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View Work' })).toHaveAttribute('href', '/work')
  await expect(page.getByText('Systems Integration', { exact: true })).toBeVisible()
  await expect(page.locator('.process-timeline')).toHaveClass(/via-brand-teal\/90/)
  await expect(page.locator('.process-timeline__connector').first()).toHaveClass(/from-violet-300\/80/)
  await expect(page.locator('.process-timeline__connector').first()).toHaveCSS('z-index', '0')
  await expect(page.locator('.process-timeline__node').first()).toHaveCSS('z-index', '10')
  const heroBox = await page.locator('.home-landing').boundingBox()
  expect(heroBox.height).toBeGreaterThanOrEqual(760)
  expect(Math.abs(heroBox.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(heroBox.width - 1440)).toBeLessThanOrEqual(1)
})

test('public pages use one document backdrop and an integrated sticky navbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector('.public-shell')?.getBoundingClientRect()
    const backdrop = document.querySelector('.public-backdrop')?.getBoundingClientRect()
    const hero = document.querySelector('.home-landing')
    const navbar = document.querySelector('.site-navbar')
    return {
      shellHeight: shell?.height || 0,
      backdropTop: backdrop?.top || 0,
      backdropHeight: backdrop?.height || 0,
      heroBackground: hero ? getComputedStyle(hero).backgroundColor : '',
      navbarBackground: navbar ? getComputedStyle(navbar).backgroundColor : '',
    }
  })

  expect(Math.abs(geometry.backdropTop)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.backdropHeight - geometry.shellHeight)).toBeLessThanOrEqual(1)
  expect(geometry.heroBackground).toBe('rgba(0, 0, 0, 0)')
  expect(geometry.navbarBackground).toBe('rgba(0, 0, 0, 0)')

  await page.evaluate(() => window.scrollTo(0, 500))
  await expect(page.locator('#site-header')).toHaveClass(/site-header--scrolled/)
  await expect(page.locator('.site-navbar')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

test('core public compositions avoid horizontal overflow at target breakpoints', async ({ page }) => {
  for (const width of [1440, 1280, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 })
    for (const path of ['/', '/work']) {
      await page.goto(path)
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
      expect(dimensions.content, `${path} overflows at ${width}px`).toBeLessThanOrEqual(dimensions.viewport)
    }
  }
})

test('Work publishes selected automation project write-ups', async ({ page }) => {
  await page.goto('/work')
  await expect(page.getByRole('heading', { name: 'Selected automation projects' })).toBeVisible()
  await expect(page.getByText('Challenge', { exact: true })).toHaveCount(3)
  await expect(page.getByText('System architecture', { exact: true })).toHaveCount(3)
  await expect(page.getByText('Delivery value', { exact: true })).toHaveCount(3)
  await expect(page.getByRole('button', { name: /^Enlarge .* image 1$/ })).toHaveCount(3)
  await expect(page.getByText('View full image', { exact: true })).toHaveCount(3)
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

test('Profile hover actions stay legible and large previews remain below navigation', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/profile')

  const detailsAction = page.getByRole('button', { name: 'View details' }).first()
  await detailsAction.hover()
  await expect(detailsAction).toHaveCSS('color', 'rgb(255, 255, 255)')

  const certificateButton = page.getByRole('button', { name: 'View No Code Automation with Zapier certificate full size' })
  await certificateButton.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await certificateButton.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const backdropBox = await dialog.boundingBox()
  const panelBox = await dialog.locator('.modal-viewport-panel').boundingBox()
  const navbarBox = await page.locator('.site-navbar').boundingBox()
  expect(backdropBox.y).toBe(0)
  expect(backdropBox.height).toBe(900)
  expect(panelBox.y).toBeGreaterThanOrEqual(navbarBox.y + navbarBox.height)
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(900)
})

test('CMS decorative vector fields remain behind content and outside the accessibility tree', async ({ page }) => {
  await page.goto('/admin')
  const field = page.locator('.admin-vector-field')
  await expect(field).toHaveCount(1)
  await expect(field).toHaveAttribute('aria-hidden', 'true')
  await expect(field.locator('.admin-vector-field__icon')).toHaveCount(6)
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
