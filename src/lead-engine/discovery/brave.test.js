import { describe, expect, it } from 'vitest'
import { buildBraveQueries, discoverViaBrave } from './brave.js'

const KEY = 'test-subscription-token'

function campaignWith(brave) {
  return { config: { brave } }
}

function stubFetch(responses) {
  const calls = []
  const queue = [...responses]
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init })
    return queue.shift()
  }
  return { fetchImpl, calls }
}

function results(entries, status = 200) {
  return new Response(JSON.stringify({ web: { results: entries } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('buildBraveQueries', () => {
  it('uses only the queries an operator configured', () => {
    // No cross-product of industries and metros: every query is a metered
    // request, and a generated one is a request nobody chose to pay for.
    expect(buildBraveQueries(campaignWith({ queries: ['property management austin'] }))).toEqual([
      'property management austin',
    ])
    expect(buildBraveQueries(campaignWith({ queries: [] }))).toEqual([])
    expect(buildBraveQueries({})).toEqual([])
    expect(buildBraveQueries(undefined)).toEqual([])
  })

  it('trims, collapses whitespace and drops empty entries', () => {
    expect(buildBraveQueries(campaignWith({ queries: ['  property   management  ', '', '   ', null] }))).toEqual([
      'property management',
    ])
  })

  it('does not pay twice for two spellings of one query', () => {
    expect(buildBraveQueries(campaignWith({ queries: ['Acme Austin', 'acme austin'] }))).toEqual(['Acme Austin'])
  })

  it('caps the number of queries one run may issue', () => {
    const queries = Array.from({ length: 40 }, (_, index) => `query ${index}`)
    expect(buildBraveQueries(campaignWith({ queries }))).toHaveLength(10)
  })
})

describe('discoverViaBrave', () => {
  it('is entirely optional: with no key it reports that and spends nothing', async () => {
    // The engine must run on Overpass and manual imports alone. Nothing
    // downstream may treat this as a failed run.
    const noKey = await discoverViaBrave({ campaign: campaignWith({ queries: ['anything'] }) })
    expect(noKey).toEqual({ candidates: [], requests: 0, error: 'brave_not_configured' })

    const blankKey = await discoverViaBrave({ campaign: campaignWith({ queries: ['anything'] }), apiKey: '   ' })
    expect(blankKey.error).toBe('brave_not_configured')
  })

  it('distinguishes a configured key with nothing to search for', async () => {
    const result = await discoverViaBrave({ campaign: campaignWith({ queries: [] }), apiKey: KEY })
    expect(result).toEqual({ candidates: [], requests: 0, error: 'brave_no_queries' })
  })

  it('sends the key as a header and the query as a bounded request', async () => {
    const { fetchImpl, calls } = stubFetch([results([])])

    await discoverViaBrave({
      campaign: campaignWith({ queries: ['property management austin'], country: 'us', count: 500 }),
      apiKey: KEY,
      fetchImpl,
    })

    expect(calls[0].init.headers['X-Subscription-Token']).toBe(KEY)
    expect(calls[0].url.searchParams.get('q')).toBe('property management austin')
    expect(calls[0].url.searchParams.get('country')).toBe('US')
    // The API's own per-request ceiling, applied here so a typo in a campaign
    // config is not sent upstream as a 400.
    expect(calls[0].url.searchParams.get('count')).toBe('20')
  })

  it('takes the domain and title, and keeps the snippet only as bounded provenance', async () => {
    const { fetchImpl } = stubFetch([
      results([
        {
          url: 'https://www.acme.com/services',
          title: 'Home | Acme Property Management',
          description: 'x'.repeat(5_000),
        },
      ]),
    ])

    const { candidates, error } = await discoverViaBrave({
      campaign: campaignWith({ queries: ['property management austin'] }),
      apiKey: KEY,
      fetchImpl,
    })

    expect(error).toBe(null)
    expect(candidates[0]).toMatchObject({
      canonicalDomain: 'acme.com',
      websiteUrl: 'https://www.acme.com/services',
      name: 'Home | Acme Property Management',
      externalId: 'domain:acme.com',
    })
    // The snippet is a third party's summary of a page. It is bounded, kept for
    // the operator only, and never becomes model input — the AI review reads
    // pages this system fetched itself.
    expect(candidates[0].payload.description).toHaveLength(200)
    expect(candidates[0].payload.query).toBe('property management austin')
  })

  it('drops the directories and social profiles a local-business query returns', async () => {
    const { fetchImpl } = stubFetch([
      results([
        { url: 'https://www.yelp.com/biz/acme-austin', title: 'Acme on Yelp' },
        { url: 'https://www.facebook.com/acmepm', title: 'Acme on Facebook' },
        { url: 'https://linktr.ee/acme', title: 'Acme links' },
        { url: 'https://acme.com', title: 'Acme' },
        { title: 'A result with no url at all' },
      ]),
    ])

    const { candidates } = await discoverViaBrave({
      campaign: campaignWith({ queries: ['property management austin'] }),
      apiKey: KEY,
      fetchImpl,
    })

    expect(candidates.map((entry) => entry.canonicalDomain)).toEqual(['acme.com'])
  })

  it('stops on a rejected key rather than burning the budget on the same failure', async () => {
    const { fetchImpl, calls } = stubFetch([
      new Response('', { status: 401 }),
      results([{ url: 'https://acme.com', title: 'Acme' }]),
    ])

    const result = await discoverViaBrave({
      campaign: campaignWith({ queries: ['first', 'second'] }),
      apiKey: KEY,
      fetchImpl,
    })

    expect(result).toEqual({ candidates: [], requests: 1, error: 'brave_unauthorized' })
    expect(calls).toHaveLength(1)
  })

  it('names a quota wall so an operator knows to wait rather than to re-key', async () => {
    const { fetchImpl } = stubFetch([new Response('', { status: 429 })])
    const result = await discoverViaBrave({ campaign: campaignWith({ queries: ['first'] }), apiKey: KEY, fetchImpl })
    expect(result.error).toBe('brave_rate_limited')
  })

  it('survives a body that is not the shape the API documents', async () => {
    const { fetchImpl } = stubFetch([
      new Response(JSON.stringify({ type: 'search', web: {} }), { status: 200 }),
      new Response('<html>gateway</html>', { status: 200 }),
    ])

    const malformed = await discoverViaBrave({ campaign: campaignWith({ queries: ['first'] }), apiKey: KEY, fetchImpl })
    expect(malformed.error).toBe('brave_malformed_response')

    const notJson = await discoverViaBrave({ campaign: campaignWith({ queries: ['second'] }), apiKey: KEY, fetchImpl })
    expect(notJson.error).toBe('brave_invalid_json')
  })

  it('reports a network failure rather than throwing out of the run', async () => {
    const fetchImpl = async () => {
      throw new Error('dns failure')
    }
    const result = await discoverViaBrave({ campaign: campaignWith({ queries: ['first'] }), apiKey: KEY, fetchImpl })

    expect(result).toEqual({ candidates: [], requests: 1, error: 'brave_network_error' })
  })

  it('honours the campaign request budget, not the number of queries', async () => {
    const { fetchImpl, calls } = stubFetch([
      results([{ url: 'https://one.com', title: 'One' }]),
      results([{ url: 'https://two.com', title: 'Two' }]),
      results([{ url: 'https://three.com', title: 'Three' }]),
    ])

    const { candidates, requests } = await discoverViaBrave({
      campaign: campaignWith({ queries: ['a', 'b', 'c'], requestBudget: 2 }),
      apiKey: KEY,
      fetchImpl,
    })

    expect(requests).toBe(2)
    expect(calls).toHaveLength(2)
    expect(candidates).toHaveLength(2)
  })

  it('stops issuing queries once the candidate limit is reached', async () => {
    const { fetchImpl, calls } = stubFetch([
      results([{ url: 'https://one.com', title: 'One' }, { url: 'https://two.com', title: 'Two' }]),
      results([{ url: 'https://three.com', title: 'Three' }]),
    ])

    const { candidates } = await discoverViaBrave({
      campaign: campaignWith({ queries: ['a', 'b'] }),
      apiKey: KEY,
      fetchImpl,
      limit: 2,
    })

    expect(candidates).toHaveLength(2)
    expect(calls).toHaveLength(1)
  })
})
