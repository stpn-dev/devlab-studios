import { describe, it, expect } from 'vitest'
import { signSession, verifySession, parseCookies, buildSetCookieHeader, buildClearCookieHeader, SESSION_COOKIE_NAME } from './session.js'

describe('signSession / verifySession', () => {
  it('round-trips a payload signed with the same secret', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await signSession({ userId: 'user-1', exp: now + 3600 }, 'secret-a')
    const result = await verifySession(token, 'secret-a')
    expect(result).toMatchObject({ userId: 'user-1' })
  })

  it('rejects a token signed with a different secret', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await signSession({ userId: 'user-1', exp: now + 3600 }, 'secret-a')
    expect(await verifySession(token, 'secret-b')).toBeNull()
  })

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 10
    const token = await signSession({ userId: 'user-1', exp: past }, 'secret-a')
    expect(await verifySession(token, 'secret-a')).toBeNull()
  })

  it('rejects a malformed token', async () => {
    expect(await verifySession('not-a-real-token', 'secret-a')).toBeNull()
  })
})

describe('parseCookies', () => {
  it('parses a Cookie header into a map', () => {
    expect(parseCookies('a=1; b=2')).toEqual({ a: '1', b: '2' })
  })

  it('returns an empty object for an empty header', () => {
    expect(parseCookies('')).toEqual({})
    expect(parseCookies(undefined)).toEqual({})
  })
})

describe('buildSetCookieHeader / buildClearCookieHeader', () => {
  it('includes HttpOnly, SameSite=Strict, and Secure when requested', () => {
    const header = buildSetCookieHeader(SESSION_COOKIE_NAME, 'token-value', { secure: true, maxAgeSeconds: 3600 })
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Strict')
    expect(header).toContain('Secure')
    expect(header).toContain('Max-Age=3600')
  })

  it('omits Secure when not requested (local http dev)', () => {
    const header = buildSetCookieHeader(SESSION_COOKIE_NAME, 'token-value', { secure: false, maxAgeSeconds: 3600 })
    expect(header).not.toContain('Secure')
  })

  it('clears the cookie with Max-Age=0', () => {
    expect(buildClearCookieHeader(SESSION_COOKIE_NAME, { secure: true })).toContain('Max-Age=0')
  })

  it('supports an explicit SameSite=Lax override for cross-site-initiated redirects', () => {
    const header = buildSetCookieHeader('devlab_pb_oauth', 'stash-value', { secure: true, maxAgeSeconds: 600, sameSite: 'Lax' })
    expect(header).toContain('SameSite=Lax')
    expect(header).not.toContain('SameSite=Strict')
  })
})
