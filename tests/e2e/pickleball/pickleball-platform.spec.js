import { test, expect } from '@playwright/test'
import { loginAs } from './helpers.js'
import { PLATFORM_ADMIN_EMAIL } from '../../../scripts/pickleball/apply-e2e-fixtures.mjs'

test('a platform admin can invite a pilot, the pilot creates their own club, and quotas block over-invites', async ({ request, context, baseURL }) => {
  await loginAs(request, context, baseURL, PLATFORM_ADMIN_EMAIL)

  const pilotEmail = `pilot-${Date.now()}@example.com`
  const inviteResponse = await request.post('/api/pickleball/platform/org-invites', {
    data: { invitedEmail: pilotEmail, maxScorekeepers: 1 },
  })
  expect(inviteResponse.ok()).toBe(true)
  const { invite, acceptUrl } = await inviteResponse.json()
  expect(invite.status).toBe('PENDING')
  expect(acceptUrl).toContain(`/pickleball/accept-invite/${invite.token}`)

  // The pilot logs in with a fresh context (their own cookie jar) so the
  // platform admin's session above is untouched.
  const pilotContext = await context.browser().newContext()
  const pilotRequest = pilotContext.request
  await loginAs(pilotRequest, pilotContext, baseURL, pilotEmail)

  const acceptResponse = await pilotRequest.post(`/api/pickleball/auth/org-invites/${invite.token}/accept`, {
    data: { name: `Pilot Club ${Date.now()}`, slug: `pilot-club-${Date.now()}` },
  })
  expect(acceptResponse.ok()).toBe(true)
  const { activeOrgId } = await acceptResponse.json()
  expect(activeOrgId).toBeTruthy()

  const sessionResponse = await pilotRequest.get('/api/pickleball/auth/session')
  const session = await sessionResponse.json()
  expect(session.activeOrgId).toBe(activeOrgId)
  expect(session.organizations.find((org) => org.organizationId === activeOrgId)?.role).toBe('ADMIN')

  // Quota: maxScorekeepers = 1. The first scorekeeper invite succeeds...
  const firstScorekeeper = await pilotRequest.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
    data: { invitedEmail: `sk1-${Date.now()}@example.com`, role: 'SCOREKEEPER' },
  })
  expect(firstScorekeeper.status()).toBe(201)

  // ...the second is rejected by the quota.
  const secondScorekeeper = await pilotRequest.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
    data: { invitedEmail: `sk2-${Date.now()}@example.com`, role: 'SCOREKEEPER' },
  })
  expect(secondScorekeeper.status()).toBe(409)

  await pilotContext.close()
})

test('a super-admin can suspend an organization, blocking its members', async ({ request, context, baseURL }) => {
  await loginAs(request, context, baseURL, PLATFORM_ADMIN_EMAIL)

  const inviteResponse = await request.post('/api/pickleball/platform/org-invites', {
    data: { invitedEmail: `suspend-target-${Date.now()}@example.com` },
  })
  const { invite } = await inviteResponse.json()
  const targetEmail = invite.invitedEmail

  const targetContext = await context.browser().newContext()
  const targetRequest = targetContext.request
  await loginAs(targetRequest, targetContext, baseURL, targetEmail)

  const acceptResponse = await targetRequest.post(`/api/pickleball/auth/org-invites/${invite.token}/accept`, {
    data: { name: `Suspend Test Club ${Date.now()}`, slug: `suspend-test-${Date.now()}` },
  })
  const { activeOrgId } = await acceptResponse.json()

  // Astro's built-in CSRF guard (checkOrigin) rejects a bodyless POST as a
  // cross-site form submission unless the request carries a JSON content
  // type -- passing an (unused) empty `data` payload is what makes
  // Playwright's APIRequestContext set that header, same as every other
  // POST in this suite already does.
  const suspendResponse = await request.post(`/api/pickleball/platform/organizations/${activeOrgId}/suspend`, { data: {} })
  expect(suspendResponse.ok()).toBe(true)

  // `wrangler dev --local`'s D1 emulation has a documented flakiness window
  // right after a write (see apply-e2e-fixtures.mjs's header comment) --
  // reading the just-suspended org too soon after the suspend POST above can
  // 500 with a miniflare-level "Network connection lost" instead of ever
  // reaching the app's own suspended-org check. `toPass()` retries the read
  // (per this suite's documented pattern in docs/testing.md) rather than
  // relaxing the assertion, so this still fails for real if the org is ever
  // NOT blocked.
  await expect(async () => {
    const blockedResponse = await targetRequest.get(`/api/pickleball/organizations/${activeOrgId}/memberships`)
    expect(blockedResponse.status()).toBe(403)
  }).toPass({ timeout: 15000 })

  await targetContext.close()
})
