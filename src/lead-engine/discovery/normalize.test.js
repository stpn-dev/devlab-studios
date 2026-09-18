import { describe, expect, it } from 'vitest'
import { dedupeCandidates, normalizeCandidate } from './normalize.js'

/** Most tests care about the candidate, not the envelope. */
function candidate(raw) {
  const result = normalizeCandidate(raw)
  if (!result.ok) throw new Error(`expected a candidate, got ${result.reason}`)
  return result.candidate
}

describe('normalizeCandidate', () => {
  it('accepts a bare host and resolves the identity key from it', () => {
    // Directory exports routinely omit the scheme; rejecting those would throw
    // away usable leads for a cosmetic reason.
    const result = candidate({ name: 'Acme Property Management', website: 'WWW.Acme.com/contact' })

    expect(result.canonicalDomain).toBe('acme.com')
    expect(result.websiteUrl).toBe('https://www.acme.com/contact')
    expect(result.name).toBe('Acme Property Management')
  })

  it('rejects a record with no website, because there is nothing to identify or crawl', () => {
    expect(normalizeCandidate({ name: 'Acme', phone: '+1 512 555 0100' })).toEqual({ ok: false, reason: 'no_website' })
    expect(normalizeCandidate({ website: '   ' })).toEqual({ ok: false, reason: 'no_website' })
    expect(normalizeCandidate(null)).toEqual({ ok: false, reason: 'no_website' })
  })

  it('rejects a social profile rather than merging every such business onto one domain', () => {
    // The failure this prevents: canonical_domain = facebook.com for hundreds
    // of unrelated businesses, which UNIQUE would then collapse into one lead.
    expect(normalizeCandidate({ website: 'https://www.facebook.com/acmepm' }).reason).toBe('non_company_host')
    expect(normalizeCandidate({ website: 'https://instagram.com/acmepm' }).reason).toBe('non_company_host')
    expect(normalizeCandidate({ website: 'https://www.yelp.com/biz/acme' }).reason).toBe('non_company_host')
  })

  it('rejects a link shortener, whose destination we cannot know without following it', () => {
    expect(normalizeCandidate({ website: 'https://bit.ly/3xYz' }).reason).toBe('non_company_host')
    expect(normalizeCandidate({ website: 'https://linktr.ee/acme' }).reason).toBe('non_company_host')
  })

  it('distinguishes an unparseable website from a social one', () => {
    expect(normalizeCandidate({ website: 'N/A' }).reason).toBe('unparseable_website')
    expect(normalizeCandidate({ website: 'ftp://files.acme.com' }).reason).toBe('unparseable_website')
    expect(normalizeCandidate({ website: 'https://203.0.113.10/' }).reason).toBe('unparseable_website')
  })

  it('collapses whitespace in a name and bounds it to the column width', () => {
    const result = candidate({ website: 'acme.com', name: `  Acme\n  Property   Management ${'x'.repeat(400)}` })

    expect(result.name.startsWith('Acme Property Management')).toBe(true)
    expect(result.name).toHaveLength(200)
  })

  it('keeps a country code only when it is an alpha-2 code', () => {
    expect(candidate({ website: 'acme.com', country: 'us' }).countryCode).toBe('US')
    expect(candidate({ website: 'acme.com', countryCode: ' ph ' }).countryCode).toBe('PH')
    // Guessing "United States" -> "US" would mean inventing the value that
    // drives campaign targeting and the compliance profile.
    expect(candidate({ website: 'acme.com', country: 'United States' }).countryCode).toBe(null)
  })

  it('keeps coordinates only as a valid pair', () => {
    const placed = candidate({ website: 'acme.com', lat: 30.2672, lon: -97.7431 })
    expect(placed.latitude).toBeCloseTo(30.2672)
    expect(placed.longitude).toBeCloseTo(-97.7431)

    // A lone coordinate places nothing, and Number('') is 0 — which would put
    // every coordinate-less candidate on the equator.
    expect(candidate({ website: 'acme.com', lat: 30.2672 }).latitude).toBe(null)
    expect(candidate({ website: 'acme.com', lat: '', lon: '' }).latitude).toBe(null)
    expect(candidate({ website: 'acme.com', lat: 91, lon: 0 }).latitude).toBe(null)
    expect(candidate({ website: 'acme.com', lat: 'north', lon: 'west' }).latitude).toBe(null)
  })

  it('normalizes an email and drops one that is not an address', () => {
    expect(candidate({ website: 'acme.com', email: ' Hello@Acme.com ' }).email).toBe('hello@acme.com')
    expect(candidate({ website: 'acme.com', email: 'not an address' }).email).toBe(null)
  })

  it('falls back to the domain for an external id so re-runs stay idempotent', () => {
    // Without this, a source with no stable id of its own writes a new
    // lead_source_records row every time the campaign runs.
    expect(candidate({ website: 'acme.com' }).externalId).toBe('domain:acme.com')
    expect(candidate({ website: 'acme.com', externalId: 'node/42' }).externalId).toBe('node/42')
  })

  it('bounds the payload so one upstream blob cannot become an unreadable row', () => {
    const result = candidate({
      website: 'acme.com',
      payload: {
        note: 'x'.repeat(1_000),
        tags: { name: 'Acme' },
        tooDeep: { level2: { level3: 'dropped' } },
        unserializable: () => 'nope',
      },
    })

    expect(result.payload.note).toHaveLength(300)
    expect(result.payload.tags).toEqual({ name: 'Acme' })
    expect(result.payload.tooDeep).toEqual({})
    expect(result.payload.unserializable).toBeUndefined()
    expect(() => JSON.stringify(result.payload)).not.toThrow()
  })

  it('ignores a payload that is not an object', () => {
    expect(candidate({ website: 'acme.com', payload: 'raw text' }).payload).toEqual({})
  })
})

describe('dedupeCandidates', () => {
  it('merges two sources into one lead, taking the first non-empty value per field', () => {
    const merged = dedupeCandidates([
      candidate({ externalId: 'node/1', website: 'acme.com', phone: '+1 512 555 0100', city: 'Austin' }),
      candidate({ externalId: 'brave/1', website: 'https://www.acme.com/', name: 'Acme PM', email: 'hello@acme.com' }),
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      canonicalDomain: 'acme.com',
      phone: '+1 512 555 0100',
      city: 'Austin',
      name: 'Acme PM',
      email: 'hello@acme.com',
      sourceCount: 2,
    })
    // The first record wins the fields it has, so adapter order is the
    // preference order rather than luck.
    expect(merged[0].externalId).toBe('node/1')
  })

  it('counts a record seen twice once, so corroboration means two sources', () => {
    // Two campaign areas can overlap, and a re-run repeats every element. That
    // is not independent confirmation, and CORROBORATED_BY_TWO_SOURCES reads
    // this number.
    const same = candidate({ externalId: 'node/1', website: 'acme.com' })
    expect(dedupeCandidates([same, { ...same }])[0].sourceCount).toBe(1)
  })

  it('does not merge two businesses that merely share a name', () => {
    const merged = dedupeCandidates([
      candidate({ website: 'acme-austin.com', name: 'Acme Property Management' }),
      candidate({ website: 'acme-manila.com', name: 'Acme Property Management' }),
    ])

    expect(merged).toHaveLength(2)
    expect(merged.map((entry) => entry.canonicalDomain)).toEqual(['acme-austin.com', 'acme-manila.com'])
  })

  it('treats a legal-suffix difference as one name but records a real disagreement', () => {
    const suffixOnly = dedupeCandidates([
      candidate({ externalId: 'a', website: 'acme.com', name: 'Acme LLC' }),
      candidate({ externalId: 'b', website: 'acme.com', name: 'Acme, L.L.C.' }),
    ])
    expect(suffixOnly[0].nameVariants).toBeUndefined()

    // Two trading names on one domain usually means a parent company, which is
    // something the operator should see rather than something to hide.
    const conflicting = dedupeCandidates([
      candidate({ externalId: 'a', website: 'acme.com', name: 'Acme Property Management' }),
      candidate({ externalId: 'b', website: 'acme.com', name: 'Acme Vacation Rentals' }),
    ])
    expect(conflicting[0].name).toBe('Acme Property Management')
    expect(conflicting[0].nameVariants).toEqual(['Acme Vacation Rentals'])
  })

  it('preserves first-seen order and leaves the inputs untouched', () => {
    const first = candidate({ externalId: 'a', website: 'beta.com' })
    const second = candidate({ externalId: 'b', website: 'alpha.com', name: 'Alpha' })
    const third = candidate({ externalId: 'c', website: 'beta.com', name: 'Beta' })

    const merged = dedupeCandidates([first, second, third])

    expect(merged.map((entry) => entry.canonicalDomain)).toEqual(['beta.com', 'alpha.com'])
    expect(first.name).toBe(null)
    expect(first.sourceCount).toBeUndefined()
  })

  it('survives an empty or non-array input', () => {
    expect(dedupeCandidates([])).toEqual([])
    expect(dedupeCandidates(undefined)).toEqual([])
    expect(dedupeCandidates([null, { name: 'no domain' }])).toEqual([])
  })
})
