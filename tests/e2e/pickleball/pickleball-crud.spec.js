import { test, expect } from '@playwright/test'
import {
  ORG_B_ID,
  ORG_B_ADMIN_EMAIL,
  ORG_B_RULESET_ID,
  GLOBAL_RULESET_ID,
} from '../../../scripts/pickleball/apply-e2e-fixtures.mjs'

test.describe('Pickleball CRUD (authenticated)', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
  })

  test('creates a venue, a court, and a session end to end', async ({ request }) => {
    const venueResponse = await request.post('/api/pickleball/venues', {
      data: { name: 'Main Venue', address: '123 Court St', timezone: 'America/Denver' },
    })
    expect(venueResponse.ok()).toBe(true)
    const { venue } = await venueResponse.json()

    const courtResponse = await request.post('/api/pickleball/courts', {
      data: { venueId: venue.id, name: 'Court 1', sortOrder: 1 },
    })
    expect(courtResponse.ok()).toBe(true)
    const { court } = await courtResponse.json()
    // Asserting the linkage, not just the 2xx — a regression that persisted
    // the court against the wrong venue (or dropped venue_id entirely) would
    // still return 201 and pass an ok()-only check.
    expect(court.venueId).toBe(venue.id)

    const sessionResponse = await request.post('/api/pickleball/sessions', {
      data: {
        venueId: venue.id,
        name: 'Sunday Open Play',
        sessionType: 'OPEN_PLAY',
        scoringRulesetId: 'usap-2026-sideout-11-doubles',
        scheduledStart: '2026-08-30T18:00:00.000Z',
        scheduledEnd: '2026-08-30T22:00:00.000Z',
      },
    })
    expect(sessionResponse.ok()).toBe(true)
    const { session } = await sessionResponse.json()
    expect(session.status).toBe('DRAFT')
    expect(session.venueId).toBe(venue.id)
  })

  test('rejects player creation for a SCOREKEEPER (no MANAGE_PLAYERS permission)', async ({ request }) => {
    // operator@example.com is ADMIN (seeded via the bootstrap script), so it can
    // invite a SCOREKEEPER into the same org purely through the API under test.
    const sessionResponse = await request.get('/api/pickleball/auth/session')
    const { activeOrgId } = await sessionResponse.json()

    const inviteResponse = await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
      data: { invitedEmail: 'scorekeeper@example.com', role: 'SCOREKEEPER' },
    })
    expect(inviteResponse.ok()).toBe(true)

    const loginResponse = await request.post('/api/pickleball/auth/test-login', {
      data: { email: 'scorekeeper@example.com' },
    })
    expect(loginResponse.ok()).toBe(true)

    const response = await request.post('/api/pickleball/players', { data: { displayName: 'Alex' } })
    expect(response.status()).toBe(403)
  })

  test('rejects the operator roster for a SCOREKEEPER (no MANAGE_OPERATORS permission)', async ({ request }) => {
    const sessionResponse = await request.get('/api/pickleball/auth/session')
    const { activeOrgId } = await sessionResponse.json()

    const inviteResponse = await request.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, {
      data: { invitedEmail: 'scorekeeper@example.com', role: 'SCOREKEEPER' },
    })
    expect(inviteResponse.ok()).toBe(true)

    await request.post('/api/pickleball/auth/test-login', { data: { email: 'scorekeeper@example.com' } })

    // The roster exposes every member's invited_email and role — operator
    // management data a scoring-only role must not be able to enumerate.
    const response = await request.get(`/api/pickleball/organizations/${activeOrgId}/memberships`)
    expect(response.status()).toBe(403)
  })
})

// Organization isolation is this phase's core invariant, and the two real bugs
// found during implementation (an OAuth cookie bug and a cross-tenant
// court/venue IDOR) were both tenancy-adjacent. This test needs a *second*
// organization plus an org-scoped scoring ruleset, neither of which any API can
// create in Phase 1 — org creation is invite-only by design. Both are seeded by
// scripts/pickleball/apply-e2e-fixtures.mjs, which playwright.config.js runs
// before `wrangler dev` starts; the ids come from that same module so there is
// one source of truth.
test.describe('Pickleball cross-organization isolation', () => {
  test('org B cannot read or reference org A resources', async ({ playwright, baseURL }) => {
    // Two independent cookie jars — both orgs use the same session cookie
    // name, so a single request context could only ever hold one identity.
    const orgA = await playwright.request.newContext({ baseURL })
    const orgB = await playwright.request.newContext({ baseURL })

    try {
      const orgALogin = await orgA.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
      expect(orgALogin.ok()).toBe(true)
      const { activeOrgId: orgAId } = await orgALogin.json()

      const orgBLogin = await orgB.post('/api/pickleball/auth/test-login', { data: { email: ORG_B_ADMIN_EMAIL } })
      expect(orgBLogin.ok()).toBe(true)
      const { activeOrgId: orgBId } = await orgBLogin.json()

      expect(orgBId).toBe(ORG_B_ID)
      expect(orgBId).not.toBe(orgAId)

      // --- Org A creates a venue, a player, and a session ---
      const venueResponse = await orgA.post('/api/pickleball/venues', {
        data: { name: 'Org A Private Venue', address: '1 A St', timezone: 'America/Denver' },
      })
      expect(venueResponse.ok()).toBe(true)
      const { venue } = await venueResponse.json()

      const playerResponse = await orgA.post('/api/pickleball/players', { data: { displayName: 'Org A Player' } })
      expect(playerResponse.ok()).toBe(true)
      const { player } = await playerResponse.json()

      const sessionResponse = await orgA.post('/api/pickleball/sessions', {
        data: {
          venueId: venue.id,
          name: 'Org A Private Session',
          sessionType: 'OPEN_PLAY',
          scoringRulesetId: GLOBAL_RULESET_ID,
          scheduledStart: '2026-09-01T18:00:00.000Z',
          scheduledEnd: '2026-09-01T22:00:00.000Z',
        },
      })
      expect(sessionResponse.ok()).toBe(true)
      const { session } = await sessionResponse.json()

      // --- Org B must not be able to read any of them ---
      // 404, never 200-with-someone-else's-data: the repository queries are
      // scoped by organization_id, so a leak shows up as a 200 here.
      expect((await orgB.get(`/api/pickleball/venues/${venue.id}`)).status()).toBe(404)
      expect((await orgB.get(`/api/pickleball/players/${player.id}`)).status()).toBe(404)
      expect((await orgB.get(`/api/pickleball/sessions/${session.id}`)).status()).toBe(404)

      // ...nor see them in any list response.
      const orgBVenues = await (await orgB.get('/api/pickleball/venues')).json()
      expect(orgBVenues.venues.map((v) => v.id)).not.toContain(venue.id)
      const orgBPlayers = await (await orgB.get('/api/pickleball/players')).json()
      expect(orgBPlayers.players.map((p) => p.id)).not.toContain(player.id)
      const orgBSessions = await (await orgB.get('/api/pickleball/sessions')).json()
      expect(orgBSessions.sessions.map((s) => s.id)).not.toContain(session.id)

      // Regression guard for the already-fixed cross-tenant IDOR: creating a
      // court under another org's venue must be rejected at validation time,
      // not silently written with the attacker's organization_id.
      const crossOrgCourt = await orgB.post('/api/pickleball/courts', {
        data: { venueId: venue.id, name: 'Smuggled Court', sortOrder: 1 },
      })
      expect(crossOrgCourt.status()).toBe(400)
      // Pin the reason, so a 400 from schema validation could not pass for one.
      expect((await crossOrgCourt.json()).error).toBe('Venue not found in this organization.')

      // Same venue check on the session route.
      const crossOrgSession = await orgB.post('/api/pickleball/sessions', {
        data: {
          venueId: venue.id,
          name: 'Smuggled Session',
          sessionType: 'OPEN_PLAY',
          scoringRulesetId: GLOBAL_RULESET_ID,
          scheduledStart: '2026-09-01T18:00:00.000Z',
          scheduledEnd: '2026-09-01T22:00:00.000Z',
        },
      })
      expect(crossOrgSession.status()).toBe(400)
      expect((await crossOrgSession.json()).error).toBe('Venue not found in this organization.')

      // The operator roster is keyed off the session's own activeOrgId, so
      // asking for another org's roster must not resolve either.
      expect((await orgB.get(`/api/pickleball/organizations/${orgAId}/memberships`)).status()).toBe(404)

      // --- scoring_ruleset_id is the session route's *other* client-supplied
      // FK, and scoring_rulesets.organization_id is nullable: NULL is a shared
      // global profile, non-NULL is that org's private one. Org A owns a valid
      // venue here, so a 400 can only come from the ruleset tenancy check.
      const orgARulesetLeak = await orgA.post('/api/pickleball/sessions', {
        data: {
          venueId: venue.id,
          name: 'Session On Org B Ruleset',
          sessionType: 'OPEN_PLAY',
          scoringRulesetId: ORG_B_RULESET_ID,
          scheduledStart: '2026-09-01T18:00:00.000Z',
          scheduledEnd: '2026-09-01T22:00:00.000Z',
        },
      })
      expect(orgARulesetLeak.status()).toBe(400)
      expect((await orgARulesetLeak.json()).error).toBe('Scoring ruleset not found in this organization.')

      // ...while the owning org may still use its own private ruleset, so the
      // check is a tenancy filter and not a blanket rejection of org-scoped ids.
      const orgBVenue = await orgB.post('/api/pickleball/venues', {
        data: { name: 'Org B Venue', address: '1 B St', timezone: 'America/Denver' },
      })
      expect(orgBVenue.ok()).toBe(true)
      const orgBOwnRuleset = await orgB.post('/api/pickleball/sessions', {
        data: {
          venueId: (await orgBVenue.json()).venue.id,
          name: 'Org B Own Ruleset Session',
          sessionType: 'OPEN_PLAY',
          scoringRulesetId: ORG_B_RULESET_ID,
          scheduledStart: '2026-09-01T18:00:00.000Z',
          scheduledEnd: '2026-09-01T22:00:00.000Z',
        },
      })
      expect(orgBOwnRuleset.status()).toBe(201)
    } finally {
      await orgA.dispose()
      await orgB.dispose()
    }
  })
})
