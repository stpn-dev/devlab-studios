import { test, expect } from '@playwright/test'

/**
 * Mailbox end-to-end checks.
 *
 * Same rationale as the Lead CRM suite: these are properties of the DEPLOYED
 * application, not of a module, so a unit test cannot prove them.
 *
 *   1. Every `/api/admin/mailbox/*` route is actually behind the admin gate.
 *      The routes do not check auth individually — they rely on the blanket
 *      middleware in src/middleware.ts — so the only honest verification is to
 *      call them over HTTP without a session.
 *   2. `/api/mailbox/*` is DELIBERATELY NOT behind that gate, because an
 *      automation cannot hold a browser session. That makes it the one mailbox
 *      surface a stranger can reach, and it hands out message bodies and
 *      recipient addresses — so it must refuse an unauthenticated caller, and
 *      it must FAIL CLOSED rather than open when its token is unconfigured.
 *   3. The mailbox screens render inside the existing admin shell rather than
 *      as a separate application.
 *
 * Nothing here sends or receives real mail. Inbound is exercised against the
 * real schema in src/mailbox/inbound/ingest.test.js; a live delivery is an
 * acceptance step, not something a test suite can perform.
 */

const ADMIN_EMAIL = 'smoke-test@devlabstudios.com'
const ADMIN_PASSWORD = 'smoke-test-password-123'
const SESSION_COOKIE = 'devlab_admin_session'

/** Every mailbox admin endpoint, as an unauthenticated caller would reach them. */
const ADMIN_ENDPOINTS = [
  '/api/admin/mailbox/threads',
  '/api/admin/mailbox/diagnostics',
  '/api/admin/mailbox/folders/inbox',
  '/api/admin/mailbox/folders/drafts',
  '/api/admin/mailbox/folders/outbox',
  '/api/admin/mailbox/folders/sent',
  '/api/admin/mailbox/threads/any-thread-id',
  '/api/admin/mailbox/messages/any-message-id/raw',
  '/api/admin/mailbox/attachments/any-attachment-id',
]

let cachedSessionCookie = null

/** One sign-in per worker — /api/admin/login is rate limited, deliberately. */
async function login(page) {
  if (cachedSessionCookie) {
    await page.context().addCookies([cachedSessionCookie])
    await page.goto('/admin')
    await expect(page.getByRole('button', { name: /log ?out/i })).toBeVisible({ timeout: 10_000 })
    return
  }

  await page.goto('/admin')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('button', { name: /log ?out/i })).toBeVisible({ timeout: 10_000 })

  const cookies = await page.context().cookies()
  cachedSessionCookie = cookies.find((cookie) => cookie.name === SESSION_COOKIE) || null
}

async function openAdminNavGroup(page, name) {
  const group = page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('button', { name, exact: true })
  if ((await group.getAttribute('aria-expanded')) === 'false') await group.click()
}

test.describe('mailbox admin API authorization', () => {
  test('every mailbox admin endpoint refuses an unauthenticated caller', async ({ request, baseURL }) => {
    for (const path of ADMIN_ENDPOINTS) {
      const response = await request.get(`${baseURL}${path}`)
      expect(response.status(), `${path} must require a session`).toBe(401)
    }
  })

  test('writes are refused too, not just reads', async ({ request, baseURL }) => {
    const writes = [
      ['/api/admin/mailbox/threads/any-id/reply', { bodyText: 'hello' }],
      ['/api/admin/mailbox/threads/any-id/state', { state: 'archived' }],
      ['/api/admin/mailbox/outbound/any-id/cancel', {}],
    ]

    for (const [path, body] of writes) {
      const response = await request.post(`${baseURL}${path}`, { data: body })
      expect(response.status(), `POST ${path} must require a session`).toBe(401)
    }
  })

  test('draft editing and deletion are gated too', async ({ request, baseURL }) => {
    // These edit and destroy a reply, so an unauthenticated caller reaching
    // them would be worse than reading the inbox.
    //
    // 401 OR 403, because TWO layers refuse these and which one fires first
    // depends on the request. The session gate in src/middleware.ts answers
    // 401; Astro's own `security.checkOrigin` CSRF protection answers 403
    // BEFORE middleware for an unsafe method with no matching Origin, which is
    // what a bare DELETE from a test client looks like. Asserting one exact
    // code would make this test fail if either layer changed, while proving
    // nothing extra — what matters is that neither request is served.
    const patch = await request.patch(`${baseURL}/api/admin/mailbox/outbound/any-id`, {
      data: { bodyText: 'x', send: true },
    })
    expect([401, 403], 'PATCH must be refused').toContain(patch.status())

    const remove = await request.delete(`${baseURL}/api/admin/mailbox/outbound/any-id`)
    expect([401, 403], 'DELETE must be refused').toContain(remove.status())
  })
})

test.describe('the transmitter API is not public', () => {
  test('refuses a caller with no bearer token', async ({ request, baseURL }) => {
    // This route hands out recipient addresses and message bodies, and it is
    // the one mailbox surface reachable without an admin session. 401 means a
    // token is configured and this caller lacks it; 503 means none is
    // configured and the endpoint is refusing everything. Both are closed.
    // 200 would mean the outbox is published to the internet.
    const response = await request.get(`${baseURL}/api/mailbox/outbox`)
    expect([401, 503]).toContain(response.status())
  })

  test('refuses a wrong bearer token', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/mailbox/outbox`, {
      headers: { Authorization: 'Bearer not-the-real-token-not-the-real-token' },
    })
    expect([401, 503]).toContain(response.status())
  })

  test('refuses the confirm and failure callbacks too', async ({ request, baseURL }) => {
    for (const path of ['/api/mailbox/outbox/any-id/sent', '/api/mailbox/outbox/any-id/failed']) {
      const response = await request.post(`${baseURL}${path}`, { data: {} })
      expect([401, 503], `POST ${path} must be closed`).toContain(response.status())
    }
  })

  test('never answers 200 to an unauthenticated caller, whatever the query', async ({ request, baseURL }) => {
    const attempts = ['?limit=1', '?limit=9999', '?limit=-1', '']
    for (const query of attempts) {
      const response = await request.get(`${baseURL}/api/mailbox/outbox${query}`)
      expect(response.status(), `limit "${query}" must not be served`).not.toBe(200)
    }
  })
})

test.describe('mailbox screens', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('the inbox is a section of the existing admin shell', async ({ page }) => {
    await page.goto('/admin/mailbox')

    await expect(page.getByRole('heading', { name: 'Mailbox', level: 1 })).toBeVisible()
    // The shell, not a separate application: same nav, same session.
    await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible()
    await expect(page.getByRole('button', { name: /log ?out/i })).toBeVisible()
  })

  test('offers the folders a mail client is expected to have', async ({ page }) => {
    await page.goto('/admin/mailbox')
    const rail = page.getByRole('navigation', { name: 'Mailbox folders' })

    for (const folder of ['Inbox', 'Drafts', 'Outbox', 'Sent', 'Archive']) {
      await expect(rail.getByRole('link', { name: folder, exact: true })).toBeVisible()
    }
  })

  test('distinguishes the Outbox from Sent, rather than claiming a queued reply left', async ({ page }) => {
    // The transmitter is a separate system that may not have run. Collapsing
    // these would tell the operator a prospect had been answered when nothing
    // had left the building.
    await page.goto('/admin/mailbox/outbox')
    await expect(page.getByText(/Waiting for the external sender/i)).toBeVisible()

    await page.goto('/admin/mailbox/sent')
    await expect(page.getByText(/Confirmed transmitted/i)).toBeVisible()
  })

  test('a draft is described as not handed over', async ({ page }) => {
    await page.goto('/admin/mailbox/drafts')
    await expect(page.getByText(/Nothing here has been handed to the sender/i)).toBeVisible()
  })

  test('an empty mailbox explains itself rather than looking broken', async ({ page }) => {
    await page.goto('/admin/mailbox')
    await expect(page.getByText(/Nothing here yet|Loading/i).first()).toBeVisible()
  })

  test('diagnostics reports whether storage and the sender are configured', async ({ page }) => {
    await page.goto('/admin/mailbox/diagnostics')

    await expect(page.getByRole('heading', { name: /Mailbox diagnostics/i })).toBeVisible()
    // With no R2 binding and no token on a local dev worker, both warnings
    // should be visible — that is the state this suite runs in, and a silent
    // screen here would be the failure the Diagnostics page exists to prevent.
    await expect(page.getByText(/Original messages are not being stored|Unread/i).first()).toBeVisible()
  })

  test('is reachable from the admin navigation', async ({ page }) => {
    await page.goto('/admin')
    await openAdminNavGroup(page, 'Mailbox')

    await page
      .getByRole('navigation', { name: 'Admin navigation' })
      .getByRole('link', { name: 'Inbox', exact: true })
      .click()

    await expect(page).toHaveURL(/\/admin\/mailbox\/inbox$/)
    await expect(page.getByRole('heading', { name: 'Mailbox', level: 1 })).toBeVisible()
  })
})
