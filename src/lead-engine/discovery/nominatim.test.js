import { describe, expect, it } from 'vitest'
import { buildNominatimQueries, buildSearchUrl, discoverViaNominatim } from './nominatim.js'

/** A fetch stub that records what it was asked to do and replays a script. */
function stubFetch(responses) {
  const calls = []
  const queue = [...responses]
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    const next = queue.shift()
    if (typeof next === 'function') return next()
    return next
  }
  return { fetchImpl, calls }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/**
 * Shaped like a real jsonv2 result with `extratags=1`, taken from the live
 * response for "law firm Houston".
 */
function place(id, extratags, overrides = {}) {
  return {
    place_id: id * 7,
    osm_type: 'node',
    osm_id: id,
    lat: '29.76',
    lon: '-95.36',
    name: `Business ${id}`,
    display_name: `Business ${id}, 100 Main Street, Houston, Texas, 77002, United States`,
    category: 'office',
    type: 'lawyer',
    address: {
      house_number: '100',
      road: 'Main Street',
      city: 'Houston',
      state: 'Texas',
      postcode: '77002',
      country_code: 'us',
    },
    extratags,
    ...overrides,
  }
}

/** Never actually waits — the rate limit is asserted on, not slept through. */
function recordingSleep() {
  const waits = []
  return { waits, sleepImpl: async (ms) => void waits.push(ms) }
}

const campaignWith = (nominatim) => ({ countryCode: 'US', config: { nominatim } })

describe('buildNominatimQueries', () => {
  it('takes only what the campaign configured, in order', () => {
    expect(buildNominatimQueries(campaignWith({ queries: ['dentist Austin TX', 'law firm Houston'] }))).toEqual([
      'dentist Austin TX',
      'law firm Houston',
    ])
  })

  it('de-duplicates case-insensitively, because two spellings cost two requests', () => {
    const queries = buildNominatimQueries(campaignWith({ queries: ['Dentist Austin', 'dentist austin'] }))

    expect(queries).toEqual(['Dentist Austin'])
  })

  it('collapses whitespace and drops empty entries', () => {
    expect(buildNominatimQueries(campaignWith({ queries: ['  law   firm  Houston ', '', '   '] }))).toEqual([
      'law firm Houston',
    ])
  })

  it('returns nothing when the campaign has no nominatim config at all', () => {
    expect(buildNominatimQueries({})).toEqual([])
    expect(buildNominatimQueries(undefined)).toEqual([])
  })

  it('bounds the number of queries per run against a donated service', () => {
    const many = Array.from({ length: 40 }, (_, index) => `query ${index}`)

    expect(buildNominatimQueries(campaignWith({ queries: many })).length).toBeLessThanOrEqual(8)
  })
})

describe('buildSearchUrl', () => {
  it('always asks for extratags, without which no place carries a website', () => {
    const url = new URL(buildSearchUrl({ query: 'law firm Houston', limit: 25 }))

    expect(url.searchParams.get('extratags')).toBe('1')
    expect(url.searchParams.get('addressdetails')).toBe('1')
    expect(url.searchParams.get('format')).toBe('jsonv2')
  })

  it('binds a viewbox when one is given, so results cannot fall outside the market', () => {
    const url = new URL(buildSearchUrl({ query: 'x', limit: 5, viewbox: '-97.9,30.5,-97.6,30.1' }))

    // Without `bounded`, Nominatim treats the viewbox as a mere preference.
    expect(url.searchParams.get('bounded')).toBe('1')
  })

  it('omits bounded entirely when no viewbox is configured', () => {
    const url = new URL(buildSearchUrl({ query: 'x', limit: 5 }))

    expect(url.searchParams.has('bounded')).toBe(false)
    expect(url.searchParams.has('viewbox')).toBe(false)
  })
})

describe('discoverViaNominatim', () => {
  it('does nothing, and reports no error, when the campaign configures no queries', async () => {
    const { fetchImpl, calls } = stubFetch([])

    const result = await discoverViaNominatim({ campaign: campaignWith({}), fetchImpl })

    // A campaign that does not use this source is not a failing campaign.
    expect(result).toEqual({ candidates: [], requests: 0, error: null, queryResults: [] })
    expect(calls).toHaveLength(0)
  })

  it('maps a place with a website into a candidate', async () => {
    const { fetchImpl } = stubFetch([json([place(1, { website: 'https://example.com' })])])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['law firm Houston'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    expect(result.error).toBeNull()
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].canonicalDomain).toBe('example.com')
    expect(result.candidates[0].city).toBe('Houston')
    expect(result.candidates[0].region).toBe('Texas')
  })

  it('prefers contact:website over the generic website tag', async () => {
    const { fetchImpl } = stubFetch([
      json([place(1, { website: 'https://generic.example', 'contact:website': 'https://business.example' })]),
    ])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['q'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    expect(result.candidates[0].canonicalDomain).toBe('business.example')
  })

  it('drops places with no website rather than treating it as an error', async () => {
    // Most OSM places carry no website tag at all. The live measurement was
    // roughly half, and a run that errored on those would never complete.
    const { fetchImpl } = stubFetch([
      json([place(1, {}), place(2, { website: 'https://kept.example' }), place(3, { phone: '+1 555 0100' })]),
    ])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['q'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    expect(result.error).toBeNull()
    expect(result.candidates).toHaveLength(1)
    expect(result.queryResults).toEqual([{ query: 'q', places: 3, candidates: 1 }])
  })

  it('reports a zero-result query per query instead of averaging it away', async () => {
    // Live: "hvac contractor Phoenix" returns zero because OSM has no special
    // phrase for it. The fix is to rephrase, which needs the query named.
    const { fetchImpl } = stubFetch([
      json([place(1, { website: 'https://a.example' })]),
      json([]),
    ])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['dentist Austin TX', 'hvac contractor Phoenix'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    expect(result.error).toBeNull()
    expect(result.queryResults).toEqual([
      { query: 'dentist Austin TX', places: 1, candidates: 1 },
      { query: 'hvac contractor Phoenix', places: 0, candidates: 0 },
    ])
  })

  it('waits between requests, because the policy is one per second', async () => {
    const { fetchImpl } = stubFetch([json([]), json([]), json([])])
    const { waits, sleepImpl } = recordingSleep()

    await discoverViaNominatim({
      campaign: campaignWith({ queries: ['a', 'b', 'c'] }),
      fetchImpl,
      sleepImpl,
    })

    // Two waits for three requests: the delay goes before each request after
    // the first, never after the last.
    expect(waits).toHaveLength(2)
    expect(waits.every((ms) => ms >= 1000)).toBe(true)
  })

  it('identifies itself, because Nominatim blocks clients that do not', async () => {
    const { fetchImpl, calls } = stubFetch([json([])])

    await discoverViaNominatim({ campaign: campaignWith({ queries: ['q'] }), fetchImpl, ...recordingSleep() })

    expect(calls[0].init.headers['User-Agent']).toMatch(/devlab/i)
    expect(calls[0].init.headers['User-Agent']).toMatch(/https?:\/\//)
  })

  it('sends the campaign country so a US campaign cannot discover abroad', async () => {
    const { fetchImpl, calls } = stubFetch([json([])])

    await discoverViaNominatim({ campaign: campaignWith({ queries: ['q'] }), fetchImpl, ...recordingSleep() })

    expect(new URL(calls[0].url).searchParams.get('countrycodes')).toBe('us')
  })

  it('ignores a malformed country code rather than sending it', async () => {
    const { fetchImpl, calls } = stubFetch([json([])])

    await discoverViaNominatim({
      campaign: { countryCode: 'not-a-code', config: { nominatim: { queries: ['q'] } } },
      fetchImpl,
      ...recordingSleep(),
    })

    expect(new URL(calls[0].url).searchParams.has('countrycodes')).toBe(false)
  })

  it('stops at the requested candidate limit', async () => {
    const { fetchImpl } = stubFetch([
      json([
        place(1, { website: 'https://one.example' }),
        place(2, { website: 'https://two.example' }),
        place(3, { website: 'https://three.example' }),
      ]),
    ])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['q'] }),
      fetchImpl,
      limit: 2,
      ...recordingSleep(),
    })

    expect(result.candidates).toHaveLength(2)
  })

  it('reports a rate limit distinctly, so a retry can back off rather than rephrase', async () => {
    const { fetchImpl } = stubFetch([json({ error: 'slow down' }, 429)])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['q'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    expect(result.error).toBe('nominatim_rate_limited')
    expect(result.candidates).toEqual([])
  })

  it('keeps what it already collected when a later request fails', async () => {
    const { fetchImpl } = stubFetch([
      json([place(1, { website: 'https://kept.example' })]),
      json({}, 500),
    ])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['a', 'b'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    expect(result.error).toBe('nominatim_http_500')
    expect(result.candidates).toHaveLength(1)
  })

  it('treats an HTML error page as malformed rather than throwing', async () => {
    const { fetchImpl } = stubFetch([
      new Response('<html>Service Unavailable</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    ])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['q'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    expect(result.error).toBe('nominatim_malformed_response')
  })

  it('treats a JSON object where an array was promised as malformed', async () => {
    // Nominatim returns an error as an object; a bare `for...of` over it would
    // throw inside the adapter, which is the one thing it must never do.
    const { fetchImpl } = stubFetch([json({ error: { code: 400, message: 'Bad request' } })])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['q'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    expect(result.error).toBe('nominatim_malformed_response')
  })

  it('never throws when the network itself fails', async () => {
    const fetchImpl = async () => {
      throw new TypeError('fetch failed')
    }

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['q'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    expect(result.error).toBe('nominatim_network_error')
    expect(result.candidates).toEqual([])
  })

  it('keeps the raw OSM tags as evidence, so a stale website is traceable', async () => {
    const { fetchImpl } = stubFetch([
      json([place(1, { website: 'https://example.com', office: 'lawyer', phone: '+1 555 0100' })]),
    ])

    const result = await discoverViaNominatim({
      campaign: campaignWith({ queries: ['law firm Houston'] }),
      fetchImpl,
      ...recordingSleep(),
    })

    const payload = result.candidates[0].payload

    expect(payload.source).toBe('nominatim')
    expect(payload.query).toBe('law firm Houston')
    expect(payload.osmId).toBe('1')
    expect(payload.tags.website).toBe('https://example.com')
  })
})
