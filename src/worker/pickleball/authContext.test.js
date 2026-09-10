import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  resolveActiveOrgId,
  pickSessionRole,
  isLoginRateLimited,
  recordFailedLogin,
  clearFailedLogins,
  getRequestIp,
  buildLoginRateLimitKey,
} from './authContext.js'

function requestWithHeaders(headers) {
  return { headers: { get: (name) => headers[name.toLowerCase()] ?? null } }
}

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

// These previously drove a module-scope Map directly, and passed for the
// entire time the deployed limiter was enforcing nothing -- an in-process Map
// is exactly the one condition that never holds on Workers, where each
// isolate gets its own memory. Real enforcement is now proved end to end in
// tests/e2e/pickleball/pickleball-rate-limit.spec.js, against a running
// worker; what is left here is the branching logic, driven through a stand-in
// for the Durable Object so it stays a fast unit test.
describe('login rate limiting', () => {
  // Mirrors RateLimiterDO's contract closely enough to exercise the caller:
  // peek never counts, record counts, reset clears.
  function fakeRateLimiterEnv() {
    const windows = new Map()
    const stub = {
      async peek(key, limit) {
        const count = windows.get(key) ?? 0
        return { limited: count >= limit, retryAfterSeconds: count >= limit ? 60 : 0 }
      },
      async record(key) {
        windows.set(key, (windows.get(key) ?? 0) + 1)
      },
      async reset(key) {
        windows.delete(key)
      },
    }
    return { RATE_LIMITER: { idFromName: (name) => name, get: () => stub } }
  }

  let env
  beforeEach(() => {
    vi.useRealTimers()
    env = fakeRateLimiterEnv()
  })

  it('is not rate limited before any failures', async () => {
    expect(await isLoginRateLimited(env, 'test-key')).toBe(false)
  })

  it('rate limits after 8 recorded failures', async () => {
    for (let i = 0; i < 8; i += 1) await recordFailedLogin(env, 'test-key')
    expect(await isLoginRateLimited(env, 'test-key')).toBe(true)
  })

  it('clearing failed logins resets the limiter', async () => {
    for (let i = 0; i < 8; i += 1) await recordFailedLogin(env, 'test-key')
    await clearFailedLogins(env, 'test-key')
    expect(await isLoginRateLimited(env, 'test-key')).toBe(false)
  })

  it('fails OPEN when the limiter is unreachable, rather than locking everyone out', async () => {
    // A limiter that takes the login page down with it is worse than one that
    // briefly stops counting; this pins that deliberate trade-off.
    const broken = { RATE_LIMITER: { idFromName: () => 'x', get: () => { throw new Error('DO unavailable') } } }
    expect(await isLoginRateLimited(broken, 'test-key')).toBe(false)
  })

  it('treats a missing binding as unlimited rather than throwing', async () => {
    expect(await isLoginRateLimited({}, 'test-key')).toBe(false)
  })
})

describe('getRequestIp', () => {
  it('prefers cf-connecting-ip', () => {
    const request = requestWithHeaders({ 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '198.51.100.1' })
    expect(getRequestIp(request)).toBe('203.0.113.5')
  })

  it('falls back to the first x-forwarded-for entry', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })
    expect(getRequestIp(request)).toBe('198.51.100.1')
  })

  it('returns "unknown" when neither header is present', () => {
    expect(getRequestIp(requestWithHeaders({}))).toBe('unknown')
  })
})

describe('buildLoginRateLimitKey', () => {
  it('keys on ip and normalized email so neither can be probed alone', () => {
    const request = requestWithHeaders({ 'cf-connecting-ip': '203.0.113.5' })
    expect(buildLoginRateLimitKey(request, '  Operator@Example.COM ')).toBe('203.0.113.5:operator@example.com')
  })

  it('substitutes "unknown" for a missing email rather than collapsing to the bare ip', () => {
    const request = requestWithHeaders({ 'cf-connecting-ip': '203.0.113.5' })
    expect(buildLoginRateLimitKey(request, '')).toBe('203.0.113.5:unknown')
  })
})
