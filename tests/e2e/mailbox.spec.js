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
  '/api/admin/mailbox/folders/archived',
  '/api/admin/mailbox/folders/bounces',
  '/api/admin/mailbox/folders/dmarc',
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
      ['/api/admin/mailbox/compose', { toAddress: 'a@b.com', bodyText: 'x' }],
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

  test('the mail client sits inside the existing admin shell', async ({ page }) => {
    await page.goto('/admin/mailbox')

    await expect(page.getByText('hello@devlabconnect.com').first()).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Mailbox folders' })).toBeVisible()
    // The shell, not a separate application: same nav, same session.
    await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible()
    await expect(page.getByRole('button', { name: /log ?out/i })).toBeVisible()
  })

  test('offers the folders a mail client is expected to have', async ({ page }) => {
    await page.goto('/admin/mailbox')
    const rail = page.getByRole('navigation', { name: 'Mailbox folders' })

    for (const folder of ['Inbox', 'Drafts', 'Outbox', 'Sent', 'Failed', 'Archive']) {
      await expect(rail.getByRole('link', { name: folder, exact: true })).toBeVisible()
    }
    for (const machine of ['Bounces', 'DMARC reports', 'Diagnostics']) {
      await expect(rail.getByRole('link', { name: machine, exact: true })).toBeVisible()
    }
  })

  test('folder navigation does not reload the page', async ({ page }) => {
    // THE FLICKER REGRESSION TEST. The admin is one `client:only` React island;
    // a plain <a href> is a full document navigation that remounts it, which is
    // exactly what the flicker was. A marker set on `window` survives
    // client-side routing and does not survive a reload, so this fails if the
    // rail ever goes back to anchors.
    await page.goto('/admin/mailbox/inbox')
    await page.evaluate(() => {
      window.__mailboxNavProbe = 'alive'
    })

    const rail = page.getByRole('navigation', { name: 'Mailbox folders' })
    await rail.getByRole('link', { name: 'Drafts', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/mailbox\/drafts$/)

    await rail.getByRole('link', { name: 'Sent', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/mailbox\/sent$/)

    expect(await page.evaluate(() => window.__mailboxNavProbe)).toBe('alive')
  })

  test('back and forward still work across folders', async ({ page }) => {
    await page.goto('/admin/mailbox/inbox')
    const rail = page.getByRole('navigation', { name: 'Mailbox folders' })

    await rail.getByRole('link', { name: 'Outbox', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/mailbox\/outbox$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/admin\/mailbox\/inbox$/)

    await page.goForward()
    await expect(page).toHaveURL(/\/admin\/mailbox\/outbox$/)
  })

  test('exactly one folder is highlighted, on every section', async ({ page }) => {
    // THE DOUBLE-HIGHLIGHT REGRESSION TEST. Machine mail used to be reached as
    // `/inbox?mailbox=bounce`, and NavLink decides active state from the
    // pathname alone — so Inbox matched and Bounces matched the same pathname,
    // and both rendered dark. Active state now comes from one resolver.
    const sections = ['inbox', 'drafts', 'outbox', 'sent', 'failed', 'archived', 'bounces', 'dmarc', 'diagnostics']

    for (const section of sections) {
      await page.goto(`/admin/mailbox/${section}`)
      const rail = page.getByRole('navigation', { name: 'Mailbox folders' })
      await expect(rail).toBeVisible()
      await expect(rail.locator('[aria-current="page"]'), `${section} must light exactly one entry`).toHaveCount(1)
    }
  })

  test('Bounces highlights Bounces, not Inbox', async ({ page }) => {
    await page.goto('/admin/mailbox/bounces')
    const rail = page.getByRole('navigation', { name: 'Mailbox folders' })

    await expect(rail.getByRole('link', { name: 'Bounces', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(rail.getByRole('link', { name: 'Inbox', exact: true })).not.toHaveAttribute('aria-current', 'page')
  })

  test('DMARC highlights DMARC, not Inbox', async ({ page }) => {
    await page.goto('/admin/mailbox/dmarc')
    const rail = page.getByRole('navigation', { name: 'Mailbox folders' })

    await expect(rail.getByRole('link', { name: 'DMARC reports', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(rail.getByRole('link', { name: 'Inbox', exact: true })).not.toHaveAttribute('aria-current', 'page')
  })

  test('the old query URL still works and still lights only one entry', async ({ page }) => {
    // Bookmarks and anything already linked must keep working, and must not
    // reintroduce the two-highlight state they caused.
    await page.goto('/admin/mailbox/inbox?mailbox=bounce')
    const rail = page.getByRole('navigation', { name: 'Mailbox folders' })

    await expect(rail.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(rail.getByRole('link', { name: 'Bounces', exact: true })).toHaveAttribute('aria-current', 'page')
  })

  test('Diagnostics stays inside the mail client shell', async ({ page }) => {
    await page.goto('/admin/mailbox/diagnostics')

    // The rail is still there, so returning to the Inbox is one click and the
    // shell never unmounts.
    await expect(page.getByRole('navigation', { name: 'Mailbox folders' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Mailbox diagnostics/i })).toBeVisible()

    await page.evaluate(() => {
      window.__diagProbe = 'alive'
    })
    await page
      .getByRole('navigation', { name: 'Mailbox folders' })
      .getByRole('link', { name: 'Inbox', exact: true })
      .click()
    await expect(page).toHaveURL(/\/admin\/mailbox\/inbox$/)
    expect(await page.evaluate(() => window.__diagProbe)).toBe('alive')
  })

  test('a folder URL can be opened directly', async ({ page }) => {
    await page.goto('/admin/mailbox/sent')
    await expect(page.getByRole('navigation', { name: 'Mailbox folders' })).toBeVisible()
    await expect(page.getByText(/Confirmed transmitted/i)).toBeVisible()
  })

  test('offers Compose', async ({ page }) => {
    await page.goto('/admin/mailbox/inbox')
    await page.getByRole('button', { name: 'Compose' }).click()

    const dialog = page.getByRole('dialog', { name: 'New message' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('To')).toBeVisible()
    await expect(dialog.getByLabel('Subject')).toBeVisible()
    // Cc/Bcc and outbound attachments are absent on purpose: mailbox_outbound
    // has no columns for them, so offering them would drop content silently.
    await expect(dialog.getByText(/are not supported on the way/i)).toBeVisible()
  })

  test('is usable at phone width: the rail is a drawer, not a squeezed column', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    await page.goto('/admin/mailbox/inbox')

    const rail = page.getByRole('navigation', { name: 'Mailbox folders' })
    await expect(rail).toBeHidden()

    await page.getByRole('button', { name: 'Folders' }).click()
    await expect(rail).toBeVisible()
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

  test('the global sidebar has ONE mailbox entry, not a duplicate folder list', async ({ page }) => {
    await page.goto('/admin')
    await openAdminNavGroup(page, 'Mailbox')

    const sidebar = page.getByRole('navigation', { name: 'Admin navigation' })
    await expect(sidebar.getByRole('link', { name: 'Mailbox', exact: true })).toBeVisible()

    // The folders belong to the mail client. Duplicating them in the global
    // sidebar put the same navigation in two places with two behaviours — the
    // dark one routed client-side, the white one reloaded the document.
    for (const folder of ['Inbox', 'Drafts', 'Outbox', 'Sent']) {
      await expect(sidebar.getByRole('link', { name: folder, exact: true })).toHaveCount(0)
    }

    await sidebar.getByRole('link', { name: 'Mailbox', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/mailbox/)
    await expect(page.getByRole('navigation', { name: 'Mailbox folders' })).toBeVisible()
  })
})
