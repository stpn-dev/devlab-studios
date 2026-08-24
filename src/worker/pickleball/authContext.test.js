import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveActiveOrgId, pickSessionRole, isLoginRateLimited, recordFailedLogin, clearFailedLogins } from './authContext.js'

const memberships = [
  { organizationId: 'org-1', role: 'SESSION_FACILITATOR' },
  { organizationId: 'org-2', role: 'ADMIN' },
]

describe('resolveActiveOrgId', () => {
  it('picks the requested org when the user is a member of it', () => {
    expect(resolveActiveOrgId(memberships, 'org-2')).toBe('org-2')
  })

  it('falls back to the first membership when no org was requested', () => {
    expect(resolveActiveOrgId(memberships, null)).toBe('org-1')
  })

  it('falls back to the first membership when the requested org is not a real membership', () => {
    expect(resolveActiveOrgId(memberships, 'org-not-a-member')).toBe('org-1')
  })

  it('returns null when there are no memberships', () => {
    expect(resolveActiveOrgId([], 'org-1')).toBeNull()
  })
})

describe('pickSessionRole', () => {
  it('returns the role for the active org', () => {
    expect(pickSessionRole(memberships, 'org-2')).toBe('ADMIN')
  })

  it('returns null when the active org has no membership', () => {
    expect(pickSessionRole(memberships, 'org-missing')).toBeNull()
  })
})

describe('login rate limiting', () => {
  beforeEach(() => {
    vi.useRealTimers()
    clearFailedLogins('test-key')
  })

  it('is not rate limited before any failures', () => {
    expect(isLoginRateLimited('test-key')).toBe(false)
  })

  it('rate limits after 8 recorded failures', () => {
    for (let i = 0; i < 8; i += 1) recordFailedLogin('test-key')
    expect(isLoginRateLimited('test-key')).toBe(true)
  })

  it('clearing failed logins resets the limiter', () => {
    for (let i = 0; i < 8; i += 1) recordFailedLogin('test-key')
    clearFailedLogins('test-key')
    expect(isLoginRateLimited('test-key')).toBe(false)
  })
})
