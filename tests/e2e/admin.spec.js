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
  await page.getByRole('navigation').getByRole('link', { name: 'Site Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Site Settings', level: 2 })).toBeVisible()
})

test('media library inventories the bound R2 bucket and explains its purpose', async ({ page, baseURL }) => {
  await login(page)

  const response = await page.request.get(`${baseURL}/api/admin/media`)
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(Array.isArray(body.assets)).toBeTruthy()
  expect(typeof body.summary?.objectCount).toBe('number')
  expect(typeof body.summary?.totalBytes).toBe('number')

  await page.getByRole('navigation').getByRole('link', { name: 'Media' }).click()
  await expect(page.getByRole('heading', { name: 'Media Library', level: 1 })).toBeVisible()
  await expect(page.getByText(/inventory of files stored in the current environment's R2 bucket/i)).toBeVisible()
  await expect(page.getByText('R2 objects')).toBeVisible()
})

test('site settings save round-trip persists across reload', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Site Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Site Settings', level: 2 })).toBeVisible()

  const taglineInput = page.getByLabel(/tagline/i).first()
  const marker = `Smoke test tagline ${Date.now()}`
  await taglineInput.fill(marker)
  await page.getByRole('button', { name: /^save/i }).first().click()
  await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 })

  await page.reload()
  await page.getByRole('navigation').getByRole('link', { name: 'Site Settings' }).click()
  await expect(page.getByLabel(/tagline/i).first()).toHaveValue(marker)
})

test('site settings changes are versioned and a prior version can be restored', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Site Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Site Settings', level: 2 })).toBeVisible()

  const taglineInput = page.getByLabel(/tagline/i).first()

  const olderMarker = `Version history tagline A ${Date.now()}`
  await taglineInput.fill(olderMarker)
  await page.getByRole('button', { name: /^save/i }).first().click()
  await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 })

  const newerMarker = `Version history tagline B ${Date.now()}`
  await taglineInput.fill(newerMarker)
  await page.getByRole('button', { name: /^save/i }).first().click()
  await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Version History' }).click()
  const versionEntries = page.locator('li').filter({ hasText: /^v\d+/ })
  await expect(versionEntries.first()).toBeVisible()

  // Entries are newest-first: index 0 is the just-saved newerMarker snapshot,
  // index 1 is the snapshot saved right before it (olderMarker).
  page.once('dialog', (dialog) => dialog.accept())
  await versionEntries.nth(1).getByRole('button', { name: /restore/i }).click()

  await expect(page.getByLabel(/tagline/i).first()).toHaveValue(olderMarker)
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

test('redirects collection: create, verify it actually redirects, then delete', async ({ page }) => {
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

  // The middleware only consults the redirects table when a request already
  // 404'd (see src/middleware.ts) — checked via page.request (not page.goto)
  // since a 301 response is otherwise cached by the browser, which would
  // mask the later "deleting it takes effect immediately" check below.
  const beforeDelete = await page.request.get(fromPath, { maxRedirects: 0 })
  expect(beforeDelete.status()).toBe(301)
  expect(new URL(beforeDelete.headers().location, page.url()).pathname).toBe('/profile')

  await page.getByRole('button', { name: new RegExp(fromPath.replace('/', '\\/')) }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /^delete$/i }).click()
  await expect(page.getByRole('button', { name: new RegExp(fromPath.replace('/', '\\/')) })).not.toBeVisible()

  // Deleting the redirect must take effect immediately — no stale redirect left behind.
  const afterDelete = await page.request.get(fromPath, { maxRedirects: 0 })
  expect(afterDelete.status()).toBe(404)
})

test('page builder: add a block, save, verify it persists, then remove it', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { name: /^Page:/, level: 1 })).toBeVisible()

  await page.getByRole('button', { name: /^add block/i }).click()
  const marker = `Smoke test heading ${Date.now()}`
  const addedHeading = page.locator('input[id^="block-"][id$="-heading"]').last()
  await addedHeading.fill(marker)
  await page.getByRole('button', { name: /^save page/i }).click()
  await expect(page.getByText(/^saved/i)).toBeVisible({ timeout: 10_000 })

  await page.reload()
  await expect(page.locator('input[id^="block-"][id$="-heading"]').last()).toHaveValue(marker)

  await page.getByRole('button', { name: 'Remove' }).last().click()
  await page.getByRole('button', { name: /^save page/i }).click()
  await expect(page.getByText(/^saved/i)).toBeVisible({ timeout: 10_000 })
})

test('creating a project through the bespoke Projects editor still records a version', async ({ page, baseURL }) => {
  // ProjectsManager keeps its own bespoke UI (image upload, gallery
  // reordering) rather than being rewritten onto SchemaForm, but its
  // /api/admin/projects routes now share the same version/audit-log
  // plumbing as the schema-driven collections — this proves that backend
  // wiring end to end without re-testing the bespoke UI itself.
  await login(page)

  const projectId = `smoke-test-project-${Date.now()}`
  const createResponse = await page.request.post(`${baseURL}/api/admin/projects`, {
    data: {
      id: projectId,
      title: 'Smoke Test Project',
      description: 'Created by an e2e test to verify version recording.',
      type: 'Automation',
    },
  })
  expect(createResponse.ok()).toBeTruthy()

  const versionsResponse = await page.request.get(`${baseURL}/api/admin/versions/projects?id=${projectId}`)
  const versions = await versionsResponse.json()
  expect(versions.length).toBeGreaterThan(0)
  expect(versions[0].snapshot.title).toBe('Smoke Test Project')

  await page.request.delete(`${baseURL}/api/admin/projects/${projectId}`)
})

test('Work editor selects existing Projects and owns its narrative without owning uploads', async ({ page, baseURL }) => {
  await login(page)

  const originalWorkResponse = await page.request.get(`${baseURL}/api/admin/pages/work`)
  expect(originalWorkResponse.ok()).toBeTruthy()
  const originalWork = await originalWorkResponse.json()
  const existingProjectsResponse = await page.request.get(`${baseURL}/api/admin/projects`)
  const existingProjects = await existingProjectsResponse.json()
  const existingProjectIds = new Set(existingProjects.map((project) => project.id))
  const originalReferences = originalWork.blocks
    ?.find((block) => block.type === 'workProjectShowcase')
    ?.props?.items?.map((item) => item.projectId) || []
  const restoreWork = originalReferences.every((projectId) => existingProjectIds.has(projectId))
    ? originalWork
    : { slug: 'work', title: originalWork.title || 'Work', status: 'draft', blocks: [] }
  const projectId = `smoke-work-project-${Date.now()}`
  const projectDescription = `Initial Project description ${Date.now()}`

  const createResponse = await page.request.post(`${baseURL}/api/admin/projects`, {
    data: {
      id: projectId,
      title: 'Smoke Work Linked Project',
      description: projectDescription,
      techStack: ['n8n', 'API'],
      type: 'Automation',
      status: 'published',
      sortOrder: 0,
      galleryImages: [
        { id: `${projectId}-1`, url: 'https://example.com/work-one.png', altText: 'First workflow view', sortOrder: 1 },
        { id: `${projectId}-2`, url: 'https://example.com/work-two.png', altText: 'Second workflow view', sortOrder: 2 },
      ],
    },
  })
  expect(createResponse.ok()).toBeTruthy()

  // A fresh local D1 can legitimately have no Work sections yet. Seed a
  // minimal empty selector state for this test so it exercises the editor's
  // Project-linking behavior without depending on the static fallback's
  // production Project IDs being present in the isolated test database.
  const emptyWorkResponse = await page.request.put(`${baseURL}/api/admin/pages/work`, {
    data: {
      slug: 'work',
      title: 'Work',
      status: 'published',
      blocks: [{
        type: 'workProjectShowcase',
        props: { heading: 'Selected automation projects', subheading: 'Test selection', items: [] },
      }],
    },
  })
  expect(emptyWorkResponse.ok()).toBeTruthy()

  await page.getByRole('navigation').getByRole('link', { name: 'Work' }).click()
  await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /manage project images/i })).toHaveAttribute('href', '/admin/content/projects')

  await page.getByPlaceholder('Search title, type, ID, or technology').fill(projectId)
  await page.getByRole('button', { name: /Smoke Work Linked Project/ }).click()
  await expect(page.getByLabel('Work description').last()).toHaveValue(projectDescription)
  await expect(page.getByText('2 image(s)', { exact: false }).last()).toBeVisible()

  await page.getByLabel('Work description').last().fill('Independent Work description')
  await page.getByLabel('Challenge').last().fill('A specific operational challenge.')
  await page.getByLabel('System Architecture').last().fill('A linked multi-stage architecture.')
  await page.getByLabel('Delivery Value').last().fill('A measurable delivery value.')
  await page.getByLabel('Work entry status').last().selectOption('published')
  await page.getByRole('button', { name: 'Save Work' }).click()
  await expect(page.getByText(/Work content saved/i)).toBeVisible({ timeout: 10_000 })

  const savedResponse = await page.request.get(`${baseURL}/api/admin/pages/work`)
  const savedWork = await savedResponse.json()
  const showcase = savedWork.blocks.find((block) => block.type === 'workProjectShowcase')
  const savedEntry = showcase.props.items.find((item) => item.projectId === projectId)
  expect(savedEntry).toMatchObject({
    description: 'Independent Work description',
    challenge: 'A specific operational challenge.',
    systemArchitecture: 'A linked multi-stage architecture.',
    deliveryValue: 'A measurable delivery value.',
    status: 'published',
  })

  const blockedDelete = await page.request.delete(`${baseURL}/api/admin/projects/${projectId}`, {
    headers: { Origin: baseURL },
  })
  expect(blockedDelete.status()).toBe(409)

  const restoreResponse = await page.request.put(`${baseURL}/api/admin/pages/work`, { data: restoreWork })
  expect(restoreResponse.ok()).toBeTruthy()
  const deleteResponse = await page.request.delete(`${baseURL}/api/admin/projects/${projectId}`, {
    headers: { Origin: baseURL },
  })
  expect(deleteResponse.ok()).toBeTruthy()
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
