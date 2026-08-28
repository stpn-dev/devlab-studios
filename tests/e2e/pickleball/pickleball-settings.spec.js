import { test, expect } from '@playwright/test'
import { ORG_B_RULESET_ID } from '../../../scripts/pickleball/apply-e2e-fixtures.mjs'

// Spec §3.4's "Configure system defaults" (ADMIN-only) is implemented as
// org-scoped scoring ruleset management: create/deactivate a custom
// ruleset, gated by CONFIGURE_SYSTEM_DEFAULTS and scoped to the caller's own
// organization the same way venues/courts already are.
test.describe('Pickleball Settings: scoring rulesets (authenticated)', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
  })

  test('creates a custom ruleset, and deactivating it removes it from the session-creation list without deleting it', async ({ request }) => {
    const createResponse = await request.post('/api/pickleball/scoring-rulesets', {
      data: { name: 'Club Rules', targetScore: 15, winBy: 2, format: 'DOUBLES' },
    })
    expect(createResponse.status()).toBe(201)
    const { ruleset } = await createResponse.json()
    expect(ruleset.active).toBe(true)

    // Appears in the session-creation list (default scope) while active.
    const beforeDeactivate = await request.get('/api/pickleball/scoring-rulesets')
    const beforeIds = (await beforeDeactivate.json()).rulesets.map((r) => r.id)
    expect(beforeIds).toContain(ruleset.id)

    const deactivateResponse = await request.put(`/api/pickleball/scoring-rulesets/${ruleset.id}`, {
      data: { active: false },
    })
    expect(deactivateResponse.status()).toBe(200)
    expect((await deactivateResponse.json()).ruleset.active).toBe(false)

    // Gone from the session-creation list...
    const afterDeactivate = await request.get('/api/pickleball/scoring-rulesets')
    const afterIds = (await afterDeactivate.json()).rulesets.map((r) => r.id)
    expect(afterIds).not.toContain(ruleset.id)

    // ...but still visible (and reactivatable) on the org-scoped Settings view.
    const orgScoped = await request.get('/api/pickleball/scoring-rulesets?scope=organization')
    const orgScopedRow = (await orgScoped.json()).rulesets.find((r) => r.id === ruleset.id)
    expect(orgScopedRow).toBeTruthy()
    expect(orgScopedRow.active).toBe(false)
  })

  test('rejects creating a scoring ruleset for a non-ADMIN role', async ({ request }) => {
    // operator@example.com is ADMIN (seeded via the bootstrap script), so it
    // can invite a SCOREKEEPER into the same org purely through the API
    // under test, matching pickleball-crud.spec.js's established pattern.
    const sessionResponse = await request.get('/api/pickleball/auth/session')
    const { activeOrgId } = await sessionResponse.json()

    const inviteResponse = await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
      data: { invitedEmail: 'scorekeeper-settings@example.com', role: 'SCOREKEEPER' },
    })
    expect(inviteResponse.ok()).toBe(true)

    const loginResponse = await request.post('/api/pickleball/auth/test-login', {
      data: { email: 'scorekeeper-settings@example.com' },
    })
    expect(loginResponse.ok()).toBe(true)

    const createResponse = await request.post('/api/pickleball/scoring-rulesets', {
      data: { name: 'Should Not Exist', targetScore: 11, winBy: 2, format: 'DOUBLES' },
    })
    expect(createResponse.status()).toBe(403)
  })

  test('never lets one organization update another organization\'s scoring ruleset (IDOR guard)', async ({ request }) => {
    const response = await request.put(`/api/pickleball/scoring-rulesets/${ORG_B_RULESET_ID}`, {
      data: { active: false },
    })
    // operator@example.com is ADMIN of a different org than ORG_B_RULESET_ID's
    // owner -- the update must scope on the caller's own organization_id, so
    // this 404s (row genuinely not found for this org) rather than a 403 that
    // would still confirm the ruleset's existence, or a 200 that would mutate
    // org B's data.
    expect(response.status()).toBe(404)
  })
})
