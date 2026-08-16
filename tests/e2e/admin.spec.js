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

// Creates a project directly via the API (bypassing the bespoke editor UI)
// so each media-focused test starts from a known, isolated project record —
// mirrors the pattern already used by the "creating a project..." and "Work
// editor..." tests above.
async function createProject(page, baseURL, overrides = {}) {
  const id = overrides.id || `smoke-test-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const response = await page.request.post(`${baseURL}/api/admin/projects`, {
    data: {
      title: 'Smoke Test Media Project',
      description: 'Created by an e2e test to verify project media handling.',
      type: 'Automation',
      ...overrides,
      id,
    },
  })
  expect(response.ok()).toBeTruthy()
  return id
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

test('admin navigation mirrors public pages and hides unused collections', async ({ page }) => {
  await login(page)
  const navigation = page.getByRole('navigation')
  for (const label of ['Home', 'About', 'Services', 'Work', 'Insights', 'Profile']) {
    await expect(navigation.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await expect(navigation.getByRole('link', { name: 'Testimonials' })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: 'Case Studies' })).toHaveCount(0)
  await navigation.getByRole('link', { name: 'Navigation & Footer' }).click()
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
  await expect(page.getByText(/optimized public images in the current environment/i)).toBeVisible()
  await expect(page.getByText('R2 objects')).toBeVisible()
  await expect(page.getByText('Upload Image')).toBeVisible()
})

test('site settings save round-trip persists across reload', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Navigation & Footer' }).click()
  await expect(page.getByRole('heading', { name: 'Site Settings', level: 2 })).toBeVisible()

  const taglineInput = page.getByLabel(/tagline/i).first()
  const marker = `Smoke test tagline ${Date.now()}`
  await taglineInput.fill(marker)
  await page.getByRole('button', { name: /^save/i }).first().click()
  await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 })

  await page.reload()
  await page.getByRole('navigation').getByRole('link', { name: 'Navigation & Footer' }).click()
  await expect(page.getByLabel(/tagline/i).first()).toHaveValue(marker)
})

test('site settings changes are versioned and a prior version can be restored', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Navigation & Footer' }).click()
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

test('hidden testimonials collection remains backward compatible by direct route', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Testimonials' })).toHaveCount(0)
  await page.goto('/admin/collections/testimonials')
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

  await page.request.delete(`${baseURL}/api/admin/projects/${projectId}`, { headers: { Origin: baseURL } })
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

test('a lead persists in D1 and shows a failed delivery attempt when Resend is unreachable', async ({ page, baseURL }) => {
  // .dev.vars points RESEND_API_KEY at a deliberately-invalid key, so Resend
  // rejects it with 401 and delivery is guaranteed to fail here — this is
  // exactly what proves the core Phase 5 guarantee: the lead survives a
  // downstream outage.
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

  // The Resend attempt runs in the background (waitUntil) — poll briefly for
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

test('the leads list returns more than one lead when the admin UI omits limit', async ({ page, baseURL }) => {
  // Regression test: GET /api/admin/leads is always called by the admin UI
  // with no `limit` param at all. A prior bug coerced that missing param to
  // 0 via Number(null), which a naive Number.isFinite() guard let through as
  // an explicit "limit 1" instead of falling back to the intended default —
  // silently hiding every lead except the single most recent one.
  const stamp = Date.now()
  const markerA = `Limit regression A ${stamp}`
  const markerB = `Limit regression B ${stamp}`
  for (const [index, marker] of [markerA, markerB].entries()) {
    const response = await page.request.post(`${baseURL}/api/contact`, {
      data: { name: 'Smoke Test', email: `smoke-test-limit-${stamp}-${index}@example.com`, subject: marker, message: `Verifying the leads list. ${marker}` },
    })
    expect(response.ok()).toBeTruthy()
  }

  await login(page)

  const leadsResponse = await page.request.get(`${baseURL}/api/admin/leads`)
  const leads = await leadsResponse.json()
  expect(leads.find((item) => item.subject === markerA)).toBeTruthy()
  expect(leads.find((item) => item.subject === markerB)).toBeTruthy()
})

test('staged gallery images are not uploaded until Save is clicked', async ({ page, baseURL }) => {
  await login(page)
  const projectId = await createProject(page, baseURL)

  await page.goto(`/admin/content/projects?projectId=${projectId}`)
  await expect(page.getByLabel('ID')).toHaveValue(projectId)

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Add Gallery Images', { exact: true }).click(),
  ])
  await fileChooser.setFiles('tests/e2e/fixtures/sample-image.png')
  await expect(page.getByText('Pending')).toBeVisible()

  // Nothing should hit the media upload endpoint just from staging a file —
  // uploadPendingGalleryImages() only runs from saveProject() in
  // ProjectsManager.jsx, which is never triggered here.
  const mediaRequestPromise = page.waitForRequest('**/api/admin/media', { timeout: 2000 }).catch(() => null)
  // Reloading with a staged (unsaved) image trips the beforeunload guard in
  // ProjectsManager.jsx; accept the native "leave site" dialog so the reload
  // actually proceeds instead of Playwright's default dialog handling
  // silently keeping us on the page.
  page.on('dialog', (dialog) => dialog.accept())
  await page.reload()
  await expect(mediaRequestPromise).resolves.toBeNull()

  await expect(page.getByLabel('ID')).toHaveValue(projectId)
  await expect(page.getByText('Pending')).not.toBeVisible()

  await page.request.delete(`${baseURL}/api/admin/projects/${projectId}`, { headers: { Origin: baseURL } })
})

test('selecting a gallery image as thumbnail persists projects.imageUrl on save', async ({ page, baseURL }) => {
  await login(page)
  const projectId = await createProject(page, baseURL)

  await page.goto(`/admin/content/projects?projectId=${projectId}`)
  await expect(page.getByLabel('ID')).toHaveValue(projectId)

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Add Gallery Images', { exact: true }).click(),
  ])
  await fileChooser.setFiles('tests/e2e/fixtures/sample-image.png')
  await expect(page.getByText('Pending')).toBeVisible()

  await page.getByRole('button', { name: /Save Project/ }).click()
  await expect(page.getByText(/Uploading images/)).toBeVisible()
  await expect(page.getByText(/Project saved at/)).toBeVisible({ timeout: 15_000 })

  // Pick the newly-uploaded gallery image as the thumbnail (first, and only,
  // tile) and save again — no new upload should be needed since the item is
  // no longer "pending".
  await page.locator('[data-testid="thumbnail-picker-tile"]').first().click()
  await page.getByRole('button', { name: /Save Project/ }).click()
  await expect(page.getByText(/Project saved at/)).toBeVisible({ timeout: 15_000 })

  const response = await page.request.get(`${baseURL}/api/admin/projects`)
  const projects = await response.json()
  const saved = projects.find((project) => project.id === projectId)
  expect(saved.imageUrl).toBeTruthy()
  expect(saved.galleryImages.find((image) => image.isThumbnail)?.url).toBe(saved.imageUrl)

  await page.request.delete(`${baseURL}/api/admin/projects/${projectId}`, { headers: { Origin: baseURL } })
})

test('removing the thumbnail-flagged gallery image is blocked', async ({ page, baseURL }) => {
  await login(page)
  // Seeded directly with a thumbnail-flagged gallery image via the API (a
  // plain, non-R2 URL is fine here — this test only exercises the client-side
  // "can't remove the active thumbnail" guard in GalleryImageRow.jsx, not
  // media storage).
  // The gallery image id is still derived per-run (not fixed) for safety —
  // project_gallery_images.id is a global PRIMARY KEY — even though
  // deleteProject() now also deletes a project's gallery rows on cleanup.
  const projectId = `smoke-test-blocked-removal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await createProject(page, baseURL, {
    id: projectId,
    title: 'Smoke Test Blocked Removal',
    galleryImages: [
      { id: `${projectId}-1`, url: 'https://example.com/blocked-removal.png', altText: 'Thumbnail image', sortOrder: 1, isThumbnail: true },
    ],
  })

  await page.goto(`/admin/content/projects?projectId=${projectId}`)
  await expect(page.getByLabel('ID')).toHaveValue(projectId)
  await expect(page.getByRole('button', { name: 'Remove' }).first()).toBeDisabled()

  await page.request.delete(`${baseURL}/api/admin/projects/${projectId}`, { headers: { Origin: baseURL } })
})

test('deleting a used image shows the conflict dialog and links to the project', async ({ page, baseURL }) => {
  await login(page)
  const projectId = await createProject(page, baseURL, { title: 'Smoke Test Delete Conflict' })

  await page.goto(`/admin/content/projects?projectId=${projectId}`)
  await expect(page.getByLabel('ID')).toHaveValue(projectId)

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Add Gallery Images', { exact: true }).click(),
  ])
  await fileChooser.setFiles('tests/e2e/fixtures/sample-image.png')
  await expect(page.getByText('Pending')).toBeVisible()

  // Capture the real R2 key the upload endpoint assigns so this test can
  // find *this* asset in the Media Library later, rather than assuming it's
  // whatever the "first" listed asset happens to be (which could be an
  // unrelated, unreferenced object left over from another run).
  const [uploadResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/admin/media') && response.request().method() === 'POST'),
    page.getByRole('button', { name: /Save Project/ }).click(),
  ])
  const { key: uploadedKey } = await uploadResponse.json()
  await expect(page.getByText(/Project saved at/)).toBeVisible({ timeout: 15_000 })

  await page.locator('[data-testid="thumbnail-picker-tile"]').first().click()
  await page.getByRole('button', { name: /Save Project/ }).click()
  await expect(page.getByText(/Project saved at/)).toBeVisible({ timeout: 15_000 })

  await page.goto('/admin/media')
  page.on('dialog', (dialog) => dialog.accept())

  const assetCard = page.locator('article', { hasText: uploadedKey })
  await expect(assetCard).toBeVisible({ timeout: 10_000 })
  await assetCard.getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByText('This image is still in use')).toBeVisible()
  await page.getByRole('button', { name: 'Go to project' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/content/projects\\?projectId=${projectId}`))

  await page.request.delete(`${baseURL}/api/admin/projects/${projectId}`, { headers: { Origin: baseURL } })
})

test('deleting a project cleans up its exclusive gallery image from R2', async ({ page, baseURL }) => {
  await login(page)
  const projectId = await createProject(page, baseURL, { title: 'Smoke Test Delete Cleanup' })

  await page.goto(`/admin/content/projects?projectId=${projectId}`)
  await expect(page.getByLabel('ID')).toHaveValue(projectId)

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Add Gallery Images', { exact: true }).click(),
  ])
  await fileChooser.setFiles('tests/e2e/fixtures/sample-image.png')
  await expect(page.getByText('Pending')).toBeVisible()

  const [uploadResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/admin/media') && response.request().method() === 'POST'),
    page.getByRole('button', { name: /Save Project/ }).click(),
  ])
  const { key: uploadedKey } = await uploadResponse.json()
  await expect(page.getByText(/Project saved at/)).toBeVisible({ timeout: 15_000 })

  const beforeDelete = await page.request.get(`${baseURL}/api/admin/media`)
  const { assets: assetsBefore } = await beforeDelete.json()
  expect(assetsBefore.some((asset) => asset.key === uploadedKey)).toBe(true)

  // deleteProject() now cleans up gallery rows *and* their R2/media_assets
  // entries (unless still referenced elsewhere) — this image belongs to no
  // other project, so it should be gone after the project itself is deleted.
  // An explicit Origin header is required — Astro's CSRF check rejects a
  // page.request.delete() with none (see the Work-showcase test above for
  // the same pattern).
  const deleteResponse = await page.request.delete(`${baseURL}/api/admin/projects/${projectId}`, {
    headers: { Origin: baseURL },
  })
  expect(deleteResponse.ok()).toBeTruthy()

  const afterDelete = await page.request.get(`${baseURL}/api/admin/media`)
  const { assets: assetsAfter } = await afterDelete.json()
  expect(assetsAfter.some((asset) => asset.key === uploadedKey)).toBe(false)
})

test('Media Library toggles between Medium icons and Details views', async ({ page, baseURL }) => {
  await login(page)
  await page.goto('/admin/media')

  // MediaAssetTable only renders a real <table> once at least one asset
  // exists (otherwise it shows an empty-state message with no table at
  // all), so upload one here to make the Details view deterministic
  // regardless of what other tests have or haven't uploaded yet.
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Upload Image').click(),
  ])

  // Capture the real R2 key the upload endpoint assigns (same pattern as the
  // "deleting a used image..." test above) so this test can delete exactly
  // the asset it created, rather than leaving it behind for every CI run.
  const [uploadResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/admin/media') && response.request().method() === 'POST'),
    fileChooser.setFiles('tests/e2e/fixtures/sample-image.png'),
  ])
  const { key: uploadedKey } = await uploadResponse.json()
  await expect(page.getByText(/Optimized image uploaded/i)).toBeVisible({ timeout: 15_000 })

  await expect(page.locator('table')).toHaveCount(0)
  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.locator('table')).toBeVisible()
  await page.getByRole('button', { name: 'Medium icons' }).click()
  await expect(page.locator('table')).toHaveCount(0)

  await page.request.delete(`${baseURL}/api/admin/media?key=${encodeURIComponent(uploadedKey)}`, { headers: { Origin: baseURL } })
})
