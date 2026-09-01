import { describe, it, expect } from 'vitest'
import { validateInviteForAccept } from './inviteValidation'

const now = new Date('2026-06-01T12:00:00.000Z')

function makeInvite(overrides: Partial<{ status: string; invitedEmail: string; expiresAt: string }> = {}) {
  return {
    status: 'PENDING',
    invitedEmail: 'player@example.com',
    expiresAt: '2026-06-08T12:00:00.000Z',
    ...overrides,
  }
}

describe('validateInviteForAccept', () => {
  it('returns ok when the invite is pending, unexpired, and the email matches', () => {
    expect(validateInviteForAccept(makeInvite(), 'player@example.com', now)).toEqual({ outcome: 'ok' })
  })

  it('returns not-found when the invite is null (no matching token)', () => {
    expect(validateInviteForAccept(null, 'player@example.com', now)).toEqual({ outcome: 'not-found' })
  })

  it('returns already-used when the invite status is ACCEPTED', () => {
    const invite = makeInvite({ status: 'ACCEPTED' })
    expect(validateInviteForAccept(invite, 'player@example.com', now)).toEqual({ outcome: 'already-used' })
  })

  it('returns already-used when the invite status is REVOKED', () => {
    const invite = makeInvite({ status: 'REVOKED' })
    expect(validateInviteForAccept(invite, 'player@example.com', now)).toEqual({ outcome: 'already-used' })
  })

  it('returns expired when expiresAt is in the past relative to now', () => {
    const invite = makeInvite({ expiresAt: '2026-05-31T00:00:00.000Z' })
    expect(validateInviteForAccept(invite, 'player@example.com', now)).toEqual({ outcome: 'expired' })
  })

  it('returns expired when expiresAt equals now exactly', () => {
    const invite = makeInvite({ expiresAt: now.toISOString() })
    expect(validateInviteForAccept(invite, 'player@example.com', now)).toEqual({ outcome: 'expired' })
  })

  it('returns wrong-email when the authenticated email does not match the invited email', () => {
    const invite = makeInvite({ invitedEmail: 'someone-else@example.com' })
    expect(validateInviteForAccept(invite, 'player@example.com', now)).toEqual({ outcome: 'wrong-email' })
  })

  it('matches email case-insensitively (mixed-case invite vs lowercase caller)', () => {
    const invite = makeInvite({ invitedEmail: 'Player@Example.com' })
    expect(validateInviteForAccept(invite, 'player@example.com', now)).toEqual({ outcome: 'ok' })
  })

  it('matches email case-insensitively (lowercase invite vs mixed-case caller)', () => {
    const invite = makeInvite({ invitedEmail: 'player@example.com' })
    expect(validateInviteForAccept(invite, 'Player@Example.COM', now)).toEqual({ outcome: 'ok' })
  })

  it('checks status before expiry, so an accepted-but-also-expired invite reports already-used', () => {
    const invite = makeInvite({ status: 'ACCEPTED', expiresAt: '2020-01-01T00:00:00.000Z' })
    expect(validateInviteForAccept(invite, 'player@example.com', now)).toEqual({ outcome: 'already-used' })
  })

  it('checks expiry before email, so an expired invite with a mismatched email reports expired', () => {
    const invite = makeInvite({ expiresAt: '2020-01-01T00:00:00.000Z', invitedEmail: 'someone-else@example.com' })
    expect(validateInviteForAccept(invite, 'player@example.com', now)).toEqual({ outcome: 'expired' })
  })
})
