import { describe, expect, it } from 'vitest'
import { BUSINESS_IDENTITY_FIELDS } from './defaults.js'
import { FLAG_KEYS } from './flags.js'
import { resolveReadiness } from './readiness.js'

/** Every credential the engine needs, as an operator would set them. */
const FULLY_CONFIGURED = Object.freeze({
  AI: {},
  BRAVE_SEARCH_API_KEY: 'brave-key',
  CLOUDFLARE_ACCOUNT_ID: 'account',
  BROWSER_RENDERING_API_TOKEN: 'token',
})

const COMPLETE_IDENTITY = Object.freeze(
  [...BUSINESS_IDENTITY_FIELDS.sender, ...BUSINESS_IDENTITY_FIELDS.postal].reduce(
    (identity, field) => ({ ...identity, [field]: 'set' }),
    {},
  ),
)

const APPROVED_OVERPASS = Object.freeze([
  { slug: 'osm-overpass', enabled: true, automationAllowed: true, policyStatus: 'approved' },
])

const APPROVED_MANUAL_IMPORT = Object.freeze([
  { slug: 'manual-import', enabled: true, automationAllowed: true, policyStatus: 'approved' },
])

const configured = (options = {}) => ({ businessIdentity: COMPLETE_IDENTITY, sources: APPROVED_OVERPASS, ...options })

const capability = (result, key) => result.capabilities.find((entry) => entry.key === key)

describe('resolveReadiness', () => {
  it('reports ready when every credential and identity field is present', () => {
    const result = resolveReadiness(FULLY_CONFIGURED, configured())

    expect(result.ready).toBe(true)
    expect(result.blocking).toEqual([])
  })

  it('reports ready independently of whether the flags are on', () => {
    // The enable sequence turns flags on one at a time, deliberately. An
    // operator mid-sequence is not misconfigured, and saying so would make this
    // panel noise.
    const result = resolveReadiness(FULLY_CONFIGURED, configured())

    expect(capability(result, 'engine').enabled).toBe(false)
    expect(result.ready).toBe(true)
  })

  it('separates the flag being on from the credentials existing', () => {
    const result = resolveReadiness(
      { ...FULLY_CONFIGURED, [FLAG_KEYS.browserRun]: 'true', BROWSER_RENDERING_API_TOKEN: '' },
      configured(),
    )
    const browserRun = capability(result, 'browser_run')

    expect(browserRun.enabled).toBe(true)
    expect(browserRun.configured).toBe(false)
    expect(browserRun.missing).toEqual(['BROWSER_RENDERING_API_TOKEN'])
  })

  it('does not let an optional capability block readiness', () => {
    const result = resolveReadiness(
      { ...FULLY_CONFIGURED, BRAVE_SEARCH_API_KEY: '', BROWSER_RENDERING_API_TOKEN: '' },
      configured(),
    )

    expect(result.ready).toBe(true)
    expect(capability(result, 'discovery_brave').configured).toBe(false)
    expect(capability(result, 'browser_run').configured).toBe(false)
  })

  it('blocks on an empty business identity and names every field', () => {
    const result = resolveReadiness(FULLY_CONFIGURED, configured({ businessIdentity: {} }))

    expect(result.ready).toBe(false)
    expect(result.blocking).toContain('outreach_identity')
    expect(capability(result, 'outreach_identity').missing).toEqual([
      'business.identity.senderName',
      'business.identity.senderEmail',
      'business.identity.postalAddress',
      'business.identity.city',
      'business.identity.region',
      'business.identity.postalCode',
      'business.identity.countryCode',
    ])
  })

  it('blocks on a partially filled identity, naming only what is absent', () => {
    const result = resolveReadiness(
      FULLY_CONFIGURED,
      configured({ businessIdentity: { ...COMPLETE_IDENTITY, postalCode: '   ' } }),
    )

    // Whitespace is not a postal code. `present()` trims before testing, so a
    // field cleared to spaces in the admin UI still reads as missing.
    expect(capability(result, 'outreach_identity').missing).toEqual(['business.identity.postalCode'])
  })

  it('reports draft export as needing no credential at all', () => {
    // The point of replacing the mailbox integration: nothing to configure,
    // so nothing that can be misconfigured, and no provider that can block it.
    const result = resolveReadiness(FULLY_CONFIGURED, { businessIdentity: COMPLETE_IDENTITY })
    const exportRow = capability(result, 'outreach_export')

    expect(exportRow.configured).toBe(true)
    expect(exportRow.missing).toEqual([])
    expect(result.blocking).not.toContain('outreach_export')
  })

  it('treats a missing Workers AI binding as blocking', () => {
    const result = resolveReadiness({ ...FULLY_CONFIGURED, AI: undefined }, configured())

    expect(capability(result, 'ai').configured).toBe(false)
    expect(result.blocking).toContain('ai')
  })

  it('survives an empty env and a null identity rather than throwing', () => {
    // The dashboard calls this on every load. It must never be the thing that
    // breaks the page it is reporting on.
    const result = resolveReadiness(undefined, { businessIdentity: null })

    expect(result.ready).toBe(false)
    expect(result.capabilities.length).toBeGreaterThan(0)
    expect(result.capabilities.every((entry) => Array.isArray(entry.missing))).toBe(true)
  })

  it('keeps automated discovery optional when approved manual intake is available', () => {
    const unreviewed = [{ slug: 'osm-overpass', enabled: true, automationAllowed: false, policyStatus: 'unreviewed' }]
    const result = resolveReadiness(FULLY_CONFIGURED, configured({ sources: [...unreviewed, ...APPROVED_MANUAL_IMPORT] }))

    expect(result.blocking).not.toContain('discovery')
    expect(result.blocking).not.toContain('candidate_intake')
    expect(capability(result, 'discovery').importance).toBe('optional')
    expect(capability(result, 'discovery').missing).toEqual([
      'approved automated source (Lead CRM > Sources)',
    ])
  })

  it('does not count Brave without an API key as a usable intake path', () => {
    const brave = [{ slug: 'brave-search', enabled: true, automationAllowed: true, policyStatus: 'approved' }]
    const result = resolveReadiness(
      { ...FULLY_CONFIGURED, BRAVE_SEARCH_API_KEY: '' },
      configured({ sources: brave }),
    )

    expect(result.blocking).toContain('candidate_intake')
  })

  it('blocks when neither manual nor automated intake is policy-approved', () => {
    const result = resolveReadiness(FULLY_CONFIGURED, configured({ sources: [] }))

    expect(result.blocking).toContain('candidate_intake')
    expect(capability(result, 'candidate_intake').missing).toEqual([
      'approved manual import or automated source (Lead CRM > Sources)',
    ])
  })

  it('reports no capability that implies a send exists', () => {
    const result = resolveReadiness(FULLY_CONFIGURED, configured())
    const text = JSON.stringify(result).toLowerCase()

    // The architectural guarantee is that no sender exists. A readiness row
    // called "sending" would imply there is one to configure.
    expect(result.capabilities.some((entry) => entry.key.includes('send'))).toBe(false)
    expect(text).not.toContain('smtp')
  })

  it('covers every flag the engine defines', () => {
    // A new flag without a readiness row is a capability nobody can see the
    // configuration state of.
    const result = resolveReadiness(FULLY_CONFIGURED, configured())
    const covered = new Set(result.capabilities.map((entry) => entry.flag).filter(Boolean))

    for (const flagName of Object.values(FLAG_KEYS)) {
      expect(covered.has(flagName), `no readiness row reports ${flagName}`).toBe(true)
    }
  })
})
