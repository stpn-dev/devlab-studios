import { test, expect } from '@playwright/test'

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
})
