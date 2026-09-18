import { describe, expect, it } from 'vitest'
import { buildOverpassQuery, discoverViaOverpass } from './overpass.js'

const AUSTIN = { name: 'Austin', bbox: [30.1, -97.9, 30.5, -97.6] }
const TAGS = [{ key: 'office', value: 'estate_agent' }]

function campaignWith(overpass) {
  return { config: { overpass } }
}

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

function node(id, tags, extra = {}) {
  return { type: 'node', id, lat: 30.2, lon: -97.7, tags, ...extra }
}

describe('buildOverpassQuery', () => {
  it('sends a server-side timeout and a bounded out, so a bad query dies at their end', () => {
    const query = buildOverpassQuery({ tags: TAGS, bbox: AUSTIN.bbox, limit: 25 })

    expect(query.startsWith('[out:json][timeout:25];')).toBe(true)
    expect(query.trimEnd().endsWith('out body center 25;')).toBe(true)
  })

  it('queries nodes, ways and relations inside the bbox in south,west,north,east order', () => {
    const query = buildOverpassQuery({ tags: TAGS, bbox: AUSTIN.bbox, limit: 10 })

    expect(query).toContain('node["office"="estate_agent"](30.1,-97.9,30.5,-97.6);')
    expect(query).toContain('way["office"="estate_agent"](30.1,-97.9,30.5,-97.6);')
    expect(query).toContain('relation["office"="estate_agent"](30.1,-97.9,30.5,-97.6);')
  })

  it('treats a tag with no value as an existence filter', () => {
    const query = buildOverpassQuery({ tags: [{ key: 'shop' }], bbox: AUSTIN.bbox })
    expect(query).toContain('node["shop"](30.1,')
  })

  it('uses the named-area form only when an area has no bbox', () => {
    const query = buildOverpassQuery({ tags: TAGS, area: 'Austin' })

    expect(query).toContain('area["name"="Austin"]->.searchArea;')
    expect(query).toContain('node["office"="estate_agent"](area.searchArea);')
  })

  it('escapes a quote in a tag value rather than letting it become query syntax', () => {
    // Overpass QL has no parameter binding, so a campaign-supplied value is
    // interpolated — an unescaped quote would end the literal and the rest
    // would be executed as QL.
    const query = buildOverpassQuery({ tags: [{ key: 'name', value: 'Bob\'s "Big" Shop' }], bbox: AUSTIN.bbox })
    expect(query).toContain('["name"="Bob\'s \\"Big\\" Shop"]')
  })

  it('refuses a tag key that is not an OSM key', () => {
    expect(() => buildOverpassQuery({ tags: [{ key: 'out;["x"' }], bbox: AUSTIN.bbox })).toThrow(TypeError)
    expect(() => buildOverpassQuery({ tags: [], bbox: AUSTIN.bbox })).toThrow(TypeError)
  })

  it('refuses a bbox that is malformed or inverted', () => {
    // An inverted box matches nothing, which reads as "this area has no
    // businesses" rather than "this config is wrong".
    expect(() => buildOverpassQuery({ tags: TAGS, bbox: [30.5, -97.6, 30.1, -97.9] })).toThrow(TypeError)
    expect(() => buildOverpassQuery({ tags: TAGS, bbox: [30.1, -97.9, 30.5] })).toThrow(TypeError)
    expect(() => buildOverpassQuery({ tags: TAGS, bbox: [200, -97.9, 300, -97.6] })).toThrow(TypeError)
  })

  it('caps the element limit however large the caller asks for', () => {
    expect(buildOverpassQuery({ tags: TAGS, bbox: AUSTIN.bbox, limit: 100_000 })).toContain('out body center 200;')
  })
})

describe('discoverViaOverpass', () => {
  it('does nothing when the campaign has no areas or tags configured', async () => {
    await expect(discoverViaOverpass({ campaign: campaignWith({ areas: [], tags: TAGS }) })).resolves.toEqual({
      candidates: [],
      requests: 0,
      error: 'overpass_not_configured',
    })
    await expect(discoverViaOverpass({ campaign: {} })).resolves.toMatchObject({ error: 'overpass_not_configured' })
  })

  it('identifies itself and posts the query as form data, as the service asks', async () => {
    const { fetchImpl, calls } = stubFetch([json({ elements: [] })])

    await discoverViaOverpass({
      campaign: campaignWith({ areas: [AUSTIN], tags: TAGS }),
      fetchImpl,
      endpoint: 'https://overpass.example/api/interpreter',
    })

    expect(calls[0].url).toBe('https://overpass.example/api/interpreter')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers['User-Agent']).toContain('DevLabResearchBot')
    expect(calls[0].init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(decodeURIComponent(calls[0].init.body)).toContain('[out:json][timeout:25];')
  })

  it('reads the contact tags OSM actually uses, and keeps the raw tags as evidence', async () => {
    const { fetchImpl } = stubFetch([
      json({
        elements: [
          node(1, {
            name: 'Acme Property Management',
            'contact:website': 'https://acme.com',
            'contact:phone': '+1 512 555 0100',
            'contact:email': 'hello@acme.com',
            'addr:housenumber': '900',
            'addr:street': 'Congress Ave',
            'addr:city': 'Austin',
            'addr:state': 'TX',
            'addr:postcode': '78701',
            office: 'estate_agent',
          }),
        ],
      }),
    ])

    const { candidates, requests, error } = await discoverViaOverpass({
      campaign: campaignWith({ areas: [AUSTIN], tags: TAGS }),
      fetchImpl,
    })

    expect(error).toBe(null)
    expect(requests).toBe(1)
    expect(candidates[0]).toMatchObject({
      externalId: 'node/1',
      name: 'Acme Property Management',
      canonicalDomain: 'acme.com',
      phone: '+1 512 555 0100',
      email: 'hello@acme.com',
      street: '900 Congress Ave',
      city: 'Austin',
      region: 'TX',
      category: 'estate_agent',
      latitude: 30.2,
      longitude: -97.7,
    })
    // OSM is evidence, not truth: what it said is retained so a later
    // disagreement with the crawled site is traceable.
    expect(candidates[0].payload.tags['contact:website']).toBe('https://acme.com')
    expect(candidates[0].payload.osmType).toBe('node')
  })

  it('places a way or relation from the center point that "out center" provides', async () => {
    const { fetchImpl } = stubFetch([
      json({
        elements: [
          { type: 'way', id: 7, center: { lat: 14.55, lon: 121.02 }, tags: { name: 'Acme', website: 'acme.ph' } },
        ],
      }),
    ])

    const { candidates } = await discoverViaOverpass({ campaign: campaignWith({ areas: [AUSTIN], tags: TAGS }), fetchImpl })

    expect(candidates[0].externalId).toBe('way/7')
    expect(candidates[0].latitude).toBeCloseTo(14.55)
  })

  it('drops elements with no website or a social one without calling them errors', async () => {
    // The normal shape of OSM data: most entries have no website, and a good
    // number list a Facebook page.
    const { fetchImpl } = stubFetch([
      json({
        elements: [
          node(1, { name: 'No website here' }),
          node(2, { name: 'Social only', website: 'https://facebook.com/acme' }),
          node(3, { name: 'Real', website: 'acme.com' }),
          'not an element',
          { type: 'note', id: 9, tags: { website: 'acme.com' } },
        ],
      }),
    ])

    const { candidates, error } = await discoverViaOverpass({ campaign: campaignWith({ areas: [AUSTIN], tags: TAGS }), fetchImpl })

    expect(error).toBe(null)
    expect(candidates.map((entry) => entry.canonicalDomain)).toEqual(['acme.com'])
  })

  it('backs off after the first failure instead of hammering a donated service', async () => {
    const areas = [AUSTIN, { name: 'Dallas', bbox: [32.6, -97.0, 33.0, -96.6] }, { name: 'Houston', bbox: [29.6, -95.6, 30.0, -95.2] }]
    const { fetchImpl, calls } = stubFetch([
      json({ elements: [node(1, { website: 'acme.com' })] }),
      new Response('', { status: 429 }),
      json({ elements: [node(2, { website: 'second.com' })] }),
    ])

    const { candidates, requests, error } = await discoverViaOverpass({ campaign: campaignWith({ areas, tags: TAGS }), fetchImpl })

    expect(error).toBe('overpass_rate_limited')
    expect(requests).toBe(2)
    expect(calls).toHaveLength(2)
    // The partial result is still worth keeping.
    expect(candidates).toHaveLength(1)
  })

  it('names a server-side query timeout as the config problem it usually is', async () => {
    const { fetchImpl } = stubFetch([new Response('', { status: 504 })])
    const result = await discoverViaOverpass({ campaign: campaignWith({ areas: [AUSTIN], tags: TAGS }), fetchImpl })
    expect(result.error).toBe('overpass_query_timeout')
  })

  it('survives the HTML error page an overloaded instance serves instead of JSON', async () => {
    const { fetchImpl } = stubFetch([new Response('<html>too many requests</html>', { status: 200 })])
    const result = await discoverViaOverpass({ campaign: campaignWith({ areas: [AUSTIN], tags: TAGS }), fetchImpl })

    expect(result).toEqual({ candidates: [], requests: 1, error: 'overpass_invalid_json' })
  })

  it('survives a JSON body with no elements array', async () => {
    const { fetchImpl } = stubFetch([json({ version: 0.6, remark: 'runtime error' })])
    const result = await discoverViaOverpass({ campaign: campaignWith({ areas: [AUSTIN], tags: TAGS }), fetchImpl })

    expect(result.error).toBe('overpass_malformed_response')
  })

  it('reports a network failure rather than throwing out of the run', async () => {
    const fetchImpl = async () => {
      throw new Error('connection reset')
    }
    const result = await discoverViaOverpass({ campaign: campaignWith({ areas: [AUSTIN], tags: TAGS }), fetchImpl })

    expect(result).toEqual({ candidates: [], requests: 1, error: 'overpass_network_error' })
  })

  it('refuses a misconfigured area before spending a request on it', async () => {
    const { fetchImpl, calls } = stubFetch([json({ elements: [] })])
    const result = await discoverViaOverpass({
      campaign: campaignWith({ areas: [{ name: 'Austin', bbox: [1, 2, 3] }], tags: TAGS }),
      fetchImpl,
    })

    expect(result).toEqual({ candidates: [], requests: 0, error: 'overpass_invalid_config' })
    expect(calls).toHaveLength(0)
  })

  it('stops requesting areas once the candidate limit is reached', async () => {
    const areas = [AUSTIN, { name: 'Dallas', bbox: [32.6, -97.0, 33.0, -96.6] }]
    const { fetchImpl, calls } = stubFetch([
      json({ elements: [node(1, { website: 'one.com' }), node(2, { website: 'two.com' })] }),
      json({ elements: [node(3, { website: 'three.com' })] }),
    ])

    const { candidates, requests } = await discoverViaOverpass({
      campaign: campaignWith({ areas, tags: TAGS }),
      fetchImpl,
      limit: 2,
    })

    expect(candidates).toHaveLength(2)
    expect(requests).toBe(1)
    expect(calls).toHaveLength(1)
  })
})
