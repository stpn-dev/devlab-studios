import { describe, expect, it, vi } from 'vitest'
import { isAllowedDestination } from '../repositories/tracking.js'
import { attributeInquiry, readAttributionToken } from './attribution.js'
import { TRACKING } from '../config/defaults.js'

function request(cookieHeader) {
  return new Request('https://www.devlabstudios.com/api/contact', {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  })
}

describe('isAllowedDestination', () => {
  it('allows the configured DevLab hosts over https', () => {
    expect(isAllowedDestination('https://www.devlabstudios.com/solutions')).toBe(true)
    expect(isAllowedDestination('https://devlabstudios.com/')).toBe(true)
  })

  it('refuses any other host', () => {
    expect(isAllowedDestination('https://attacker.com/')).toBe(false)
    expect(isAllowedDestination('https://example.com/devlabstudios.com')).toBe(false)
  })

  it('refuses the suffix-match bypass, which is the classic open redirect', () => {
    // `endsWith('devlabstudios.com')` would accept all of these.
    expect(isAllowedDestination('https://evil-devlabstudios.com/')).toBe(false)
    expect(isAllowedDestination('https://devlabstudios.com.attacker.net/')).toBe(false)
    expect(isAllowedDestination('https://notdevlabstudios.com/')).toBe(false)
  })

  it('refuses a userinfo-prefixed URL that looks like our host', () => {
    // `https://www.devlabstudios.com@attacker.com/` has hostname attacker.com.
    expect(isAllowedDestination('https://www.devlabstudios.com@attacker.com/')).toBe(false)
  })

  it('refuses plain http even on an allowed host', () => {
    expect(isAllowedDestination('http://www.devlabstudios.com/')).toBe(false)
  })

  it('refuses non-http schemes and garbage', () => {
    expect(isAllowedDestination('javascript:alert(1)')).toBe(false)
    expect(isAllowedDestination('//attacker.com')).toBe(false)
    expect(isAllowedDestination('')).toBe(false)
    expect(isAllowedDestination('not a url')).toBe(false)
  })

  it('honours a caller-supplied allow-list', () => {
    expect(isAllowedDestination('https://staging.example.com/', ['staging.example.com'])).toBe(true)
    expect(isAllowedDestination('https://www.devlabstudios.com/', ['staging.example.com'])).toBe(false)
  })
})

describe('readAttributionToken', () => {
  const name = TRACKING.attributionCookieName

  it('reads the token from a first-party cookie', () => {
    expect(readAttributionToken(request(`${name}=abc123`))).toBe('abc123')
  })

  it('finds it among other cookies', () => {
    expect(readAttributionToken(request(`other=1; ${name}=abc123; another=2`))).toBe('abc123')
  })

  it('url-decodes the value', () => {
    expect(readAttributionToken(request(`${name}=a%2Bb`))).toBe('a+b')
  })

  it('returns null when there is no cookie', () => {
    expect(readAttributionToken(request(null))).toBeNull()
    expect(readAttributionToken(request('other=1'))).toBeNull()
    expect(readAttributionToken(request(`${name}=`))).toBeNull()
  })

  it('bounds an oversized value rather than passing it to a query', () => {
    expect(readAttributionToken(request(`${name}=${'x'.repeat(500)}`))).toBeNull()
  })

  it('tolerates a request with no headers at all', () => {
    expect(readAttributionToken(undefined)).toBeNull()
    expect(readAttributionToken({})).toBeNull()
  })
})

describe('attributeInquiry', () => {
  const ENABLED = { LEAD_ENGINE_ENABLED: 'true', LEAD_TRACKING_ENABLED: 'true' }

  it('does nothing when tracking is disabled', async () => {
    const db = { prepare: vi.fn() }
    const result = await attributeInquiry(
      { ...ENABLED, LEAD_TRACKING_ENABLED: 'false', DB: db },
      { request: request(`${TRACKING.attributionCookieName}=abc`), inboundLeadId: 'inbound-1' },
    )

    expect(result.attributed).toBe(false)
    expect(db.prepare).not.toHaveBeenCalled()
  })

  it('does nothing without a database', async () => {
    const result = await attributeInquiry(ENABLED, { request: request('x=1'), inboundLeadId: 'inbound-1' })
    expect(result.attributed).toBe(false)
  })

  it('does nothing without a tracking cookie', async () => {
    const db = { prepare: vi.fn() }
    const result = await attributeInquiry({ ...ENABLED, DB: db }, { request: request(null), inboundLeadId: 'inbound-1' })

    expect(result.attributed).toBe(false)
    expect(db.prepare).not.toHaveBeenCalled()
  })

  it('NEVER throws, whatever the database does', async () => {
    // The property that matters most: a contact form must not fail because a
    // CRM lookup failed. The attribution is worth nothing by comparison.
    const db = {
      prepare: () => {
        throw new Error('D1 is down')
      },
    }

    await expect(
      attributeInquiry(
        { ...ENABLED, DB: db },
        { request: request(`${TRACKING.attributionCookieName}=abc`), inboundLeadId: 'inbound-1' },
      ),
    ).resolves.toEqual({ attributed: false })
  })

  it('does nothing without an inbound lead id', async () => {
    const db = { prepare: vi.fn() }
    const result = await attributeInquiry(
      { ...ENABLED, DB: db },
      { request: request(`${TRACKING.attributionCookieName}=abc`), inboundLeadId: null },
    )

    expect(result.attributed).toBe(false)
    expect(db.prepare).not.toHaveBeenCalled()
  })
})
