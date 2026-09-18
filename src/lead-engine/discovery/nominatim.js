/**
 * Free-text discovery against the OpenStreetMap Nominatim API.
 *
 * NO API KEY, NO ACCOUNT, NO CARD, NO SUBSCRIPTION. That is why this adapter
 * exists: it is the free replacement for the metered search adapter, over data
 * whose licence (ODbL) permits this use. That licensing matters beyond cost —
 * every contact this engine records carries provenance, and "OpenStreetMap,
 * ODbL, tag contact:website" is defensible in a way that a scraped results page
 * is not.
 *
 * It answers a different question from the Overpass adapter over the same data.
 * Overpass asks "what is tagged office=lawyer inside this bounding box" —
 * precise, but it finds only what someone thought to tag that way. Nominatim
 * asks "law firm Houston", and resolves that through OSM's special phrases, so
 * businesses under several different tags surface from one query.
 *
 * MEASURED YIELD, against the live API on 18 September 2026:
 *
 *   dentist Austin TX        26 results, 14 carrying a website tag
 *   law firm Houston         22 results, 17 carrying a website tag
 *   plumbing company Dallas   0 results
 *   hvac contractor Phoenix   0 results
 *
 * Those last two are the thing to understand before writing queries. Nominatim
 * matches OSM special phrases, so `dentist` and `law firm` resolve and
 * `hvac contractor` does not — it is not a failure and not a rate limit, the
 * phrase simply has no mapping. A zero-result query is therefore reported per
 * query in `queryResults` rather than averaged away, because the fix is to
 * rephrase and an operator cannot rephrase what they cannot see.
 *
 * NOMINATIM'S USAGE POLICY IS STRICTER THAN OVERPASS'S AND IS FOLLOWED HERE
 * LITERALLY: an absolute maximum of one request per second — not one in flight,
 * one per second, enforced by a real delay between requests — and a User-Agent
 * that identifies the application. The policy says heavy users must self-host,
 * so the per-run budget is deliberately small. Ignoring this gets the IP range
 * banned for everybody, and it is a donated service.
 *
 * What comes back is EVIDENCE, not truth, exactly as with Overpass. A place's
 * `extratags.website` is crowd-sourced and may be stale or belong to a
 * franchise; the crawler verifies it against the site itself, and the raw tags
 * are kept in `payload` so a later disagreement is traceable to what OSM said.
 *
 * Never throws for an upstream failure. A 429, an HTML error page, and a body
 * that is not an array are ordinary outcomes of talking to a busy free service,
 * and each returns `{ candidates: [], error }`.
 */

import { CRAWLER, USAGE_LIMITS } from '../config/defaults.js'
import { normalizeCandidate } from './normalize.js'

/** Adapter-local policy; the values a campaign does not override. */
export const NOMINATIM = Object.freeze({
  endpoint: 'https://nominatim.openstreetmap.org/search',
  requestTimeoutMs: 15_000,
  /**
   * The published hard limit is one request per second. The extra 200ms is not
   * politeness theatre — it absorbs clock skew and the fact that the limit is
   * measured at their end, where a request arrives slightly later than it left.
   */
  minRequestIntervalMs: 1_200,
  /** Queries run per campaign run, before the daily budget is applied. */
  maxQueriesPerRun: 8,
  /** The API's own per-request ceiling. */
  maxResultsPerQuery: 40,
  defaultResultsPerQuery: 25,
  maxQueryLength: 300,
  /** OSM tags copied into `payload` as evidence. */
  evidenceTags: Object.freeze([
    'website', 'contact:website', 'url',
    'phone', 'contact:phone', 'contact:email', 'email',
    'office', 'shop', 'amenity', 'craft', 'brand', 'operator',
  ]),
})

/**
 * The queries a campaign has explicitly configured.
 *
 * Deliberately does NOT compose queries from target industries and metros. A
 * generated cross-product turns a three-industry, four-city campaign into
 * twelve requests against a donated service, and — given how many phrasings
 * return nothing — most of them would be wasted. An operator writes the
 * queries, sees the per-query yield, and keeps the ones that work.
 *
 * @param {object} [campaign]
 * @returns {string[]} trimmed, bounded, de-duplicated, in configured order
 */
export function buildNominatimQueries(campaign) {
  const configured = Array.isArray(campaign?.config?.nominatim?.queries)
    ? campaign.config.nominatim.queries
    : []
  const seen = new Set()
  const queries = []

  for (const entry of configured) {
    const query = String(entry ?? '').replace(/\s+/g, ' ').trim().slice(0, NOMINATIM.maxQueryLength)
    if (!query) continue

    // Case-insensitive: two spellings of one query cost two requests against a
    // donated service and return the same places.
    const key = query.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    queries.push(query)
    if (queries.length >= NOMINATIM.maxQueriesPerRun) break
  }

  return queries
}

/** @param {number} status */
function statusReason(status) {
  if (status === 403) return 'nominatim_forbidden'
  if (status === 429) return 'nominatim_rate_limited'
  return `nominatim_http_${status}`
}

/**
 * Picks the website a place claims, preferring the tag specifically about the
 * business over the generic one.
 *
 * @param {Record<string, unknown>} tags
 */
function websiteFrom(tags) {
  return String(tags['contact:website'] || tags.website || tags.url || '')
}

/** @param {Record<string, unknown>} tags */
function evidenceFrom(tags) {
  return Object.fromEntries(
    NOMINATIM.evidenceTags.filter((key) => tags[key] !== undefined).map((key) => [key, tags[key]]),
  )
}

/**
 * Maps one Nominatim place to a raw candidate.
 *
 * `name` is preferred over `display_name` because the latter is the full
 * comma-separated postal address, which reads as noise in a review queue.
 *
 * @param {object} place
 * @param {string} query
 * @returns {object|null} null when the place is not something we can use
 */
function placeToRaw(place, query) {
  if (!place || typeof place !== 'object') return null
  if (place.osm_id === undefined || place.osm_id === null) return null

  const tags = place.extratags && typeof place.extratags === 'object' ? place.extratags : {}
  const address = place.address && typeof place.address === 'object' ? place.address : {}

  return {
    externalId: `${place.osm_type ?? 'place'}/${place.osm_id}`,
    name: place.name || place.display_name,
    websiteUrl: websiteFrom(tags),
    phone: tags.phone || tags['contact:phone'],
    email: tags['contact:email'] || tags.email,
    street: [address.house_number, address.road].filter(Boolean).join(' '),
    // Nominatim reports the smallest matching administrative unit, which for a
    // US address is usually `city` but can be `town` or `village`.
    city: address.city || address.town || address.village || address.municipality,
    region: address.state,
    category: tags.office || tags.shop || tags.amenity || tags.craft || place.type,
    latitude: place.lat,
    longitude: place.lon,
    payload: {
      source: 'nominatim',
      query,
      osmType: place.osm_type,
      osmId: String(place.osm_id),
      postcode: address.postcode,
      countryCode: address.country_code,
      tags: evidenceFrom(tags),
    },
  }
}

/**
 * Builds the URL for one search.
 *
 * `extratags=1` is what makes this adapter useful at all — without it no place
 * carries a website and every candidate would be rejected downstream.
 *
 * @param {{ query: string, limit: number, countryCodes?: string, viewbox?: string }} options
 */
export function buildSearchUrl({ query, limit, countryCodes, viewbox }) {
  const url = new URL(NOMINATIM.endpoint)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('extratags', '1')
  if (countryCodes) url.searchParams.set('countrycodes', countryCodes)
  if (viewbox) {
    url.searchParams.set('viewbox', viewbox)
    // Without `bounded`, the viewbox is a preference and places outside it are
    // still returned — which would silently discover outside the campaign's
    // stated market.
    url.searchParams.set('bounded', '1')
  }
  return url.toString()
}

/**
 * Comma-separated ISO-3166-1 alpha-2 codes, or '' when nothing is valid.
 *
 * @param {unknown} value
 */
function readCountryCodes(value) {
  const entries = Array.isArray(value) ? value : String(value ?? '').split(',')
  const codes = entries
    .map((entry) => String(entry ?? '').trim().toLowerCase())
    .filter((entry) => /^[a-z]{2}$/.test(entry))
  return [...new Set(codes)].join(',')
}

/**
 * Runs one campaign's Nominatim discovery.
 *
 * @param {{ campaign?: object, fetchImpl?: typeof fetch, limit?: number,
 *           signal?: AbortSignal, sleepImpl?: (ms: number) => Promise<void> }} options
 * @returns {Promise<{ candidates: object[], requests: number, error: string|null,
 *                     queryResults: Array<{ query: string, places: number, candidates: number }> }>}
 */
export async function discoverViaNominatim(options = {}) {
  const { campaign, fetchImpl = fetch, limit, signal } = options
  // Injectable so tests do not spend a real second per request proving the
  // rate limit is respected.
  const sleepImpl = options.sleepImpl || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))

  const queries = buildNominatimQueries(campaign)
  if (queries.length === 0) {
    // Not an error. A campaign that configures no queries simply does not use
    // this source, and the run continues on the others.
    return { candidates: [], requests: 0, error: null, queryResults: [] }
  }

  const config = campaign?.config?.nominatim || {}
  const target = Math.min(
    Math.max(1, Math.trunc(Number(limit) || USAGE_LIMITS.discovery_candidates)),
    USAGE_LIMITS.discovery_candidates,
  )
  const perQuery = Math.min(
    NOMINATIM.maxResultsPerQuery,
    Math.max(1, Math.trunc(Number(config.limit) || NOMINATIM.defaultResultsPerQuery)),
  )
  // Three bounds, lowest wins: the campaign's own budget, this run's ceiling,
  // and the daily allocation for this source.
  const requestBudget = Math.min(
    Number.isFinite(Number(config.requestBudget))
      ? Math.max(0, Math.trunc(Number(config.requestBudget)))
      : queries.length,
    NOMINATIM.maxQueriesPerRun,
    USAGE_LIMITS.nominatim_requests,
  )

  const countryCodes = readCountryCodes(config.countryCodes ?? campaign?.countryCode)
  const viewbox = String(config.viewbox ?? '').trim()

  const collected = []
  const queryResults = []
  let requests = 0

  for (const query of queries.slice(0, requestBudget)) {
    if (collected.length >= target) break

    // The policy is one request per SECOND, so the wait goes before every
    // request after the first rather than after the last.
    if (requests > 0) await sleepImpl(NOMINATIM.minRequestIntervalMs)
    if (signal?.aborted) {
      return { candidates: collected, requests, error: 'nominatim_aborted', queryResults }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), NOMINATIM.requestTimeoutMs)
    const onOuterAbort = () => controller.abort()
    signal?.addEventListener('abort', onOuterAbort, { once: true })

    let response
    requests += 1
    try {
      response = await fetchImpl(
        buildSearchUrl({
          query,
          limit: Math.min(perQuery, target - collected.length),
          countryCodes,
          viewbox,
        }),
        {
          headers: {
            Accept: 'application/json',
            // Nominatim requires an identifying User-Agent and blocks clients
            // that do not send one. Same identity the crawler uses.
            'User-Agent': CRAWLER.userAgent,
          },
          signal: controller.signal,
        },
      )
    } catch {
      return {
        candidates: collected,
        requests,
        error: controller.signal.aborted ? 'nominatim_timeout' : 'nominatim_network_error',
        queryResults,
      }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }

    if (!response || !response.ok) {
      await response?.body?.cancel?.().catch(() => {})
      return { candidates: collected, requests, error: statusReason(response?.status ?? 0), queryResults }
    }

    let body
    try {
      body = await response.json()
    } catch {
      return { candidates: collected, requests, error: 'nominatim_malformed_response', queryResults }
    }

    if (!Array.isArray(body)) {
      return { candidates: collected, requests, error: 'nominatim_malformed_response', queryResults }
    }

    let admitted = 0
    for (const place of body) {
      if (collected.length >= target) break

      const raw = placeToRaw(place, query)
      if (!raw) continue

      // Most OSM places have no website tag, and plenty list a social profile.
      // Both are rejected here; neither is an error.
      const result = normalizeCandidate(raw)
      if (result.ok) {
        collected.push(result.candidate)
        admitted += 1
      }
    }

    // Per query, not aggregated: a phrase OSM does not recognise returns zero
    // places, and that is a query to rewrite rather than a failure to retry.
    queryResults.push({ query, places: body.length, candidates: admitted })
  }

  return { candidates: collected, requests, error: null, queryResults }
}
