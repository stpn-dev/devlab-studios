/**
 * Discovery against the OpenStreetMap Overpass API.
 *
 * Overpass is a DONATED public service run by volunteers, and it has a
 * published etiquette that this adapter follows literally rather than
 * approximately: one request in flight at a time (CONCURRENCY.overpass === 1),
 * an explicit server-side `[timeout:N]` so a runaway query is killed at their
 * end and not just at ours, a bounded `out` so a careless bbox cannot ask for
 * a million elements, and a User-Agent that names the crawler and links to a
 * page explaining it. Getting this wrong gets the whole IP range banned, which
 * is both rude and unrecoverable.
 *
 * What comes back is EVIDENCE, not truth. OSM tags are crowd-sourced: the
 * `website` tag can be years stale, point at a Facebook page, or belong to the
 * building rather than the business. Nothing here is treated as authoritative —
 * a candidate is a hypothesis that the crawler then verifies against the site
 * itself, and the raw tags are kept in `payload` so a later disagreement is
 * traceable to what OSM actually said.
 *
 * Never throws for an upstream failure. A 429, a gateway timeout, HTML where
 * JSON was promised, and a JSON body with no `elements` are all ordinary
 * outcomes of talking to a busy free service, and each returns
 * `{ candidates: [], error }`.
 */

import { CRAWLER, USAGE_LIMITS } from '../config/defaults.js'
import { normalizeCandidate } from './normalize.js'

/**
 * Adapter-local policy.
 *
 * Kept in one frozen object for the same reason config/defaults.js exists: a
 * bare 25 buried in a template literal is a number nobody can find later. These
 * are the values a campaign does not override.
 */
export const OVERPASS = Object.freeze({
  /** The main instance. A campaign may name a mirror in its config. */
  defaultEndpoint: 'https://overpass-api.de/api/interpreter',
  /**
   * Seconds given to `[timeout:N]`. Overpass queues and then kills queries at
   * this bound; our own AbortController is set slightly higher so the server
   * gets the chance to answer "that took too long" rather than us guessing.
   */
  serverTimeoutSeconds: 25,
  requestTimeoutMs: 30_000,
  /** Elements requested per area, whatever the caller asks for. */
  maxElementsPerRequest: 200,
  /** Areas queried per run, on top of the daily `overpass_requests` budget. */
  maxAreas: 10,
  /** OSM tags copied into `payload` as evidence. */
  evidenceTags: Object.freeze([
    'name', 'brand', 'operator', 'office', 'shop', 'amenity', 'craft',
    'website', 'contact:website', 'phone', 'contact:phone', 'contact:email',
    'addr:street', 'addr:housenumber', 'addr:city', 'addr:state', 'addr:postcode',
  ]),
})

/** Element types queried. `out center` gives ways and relations a usable point. */
const ELEMENT_TYPES = Object.freeze(['node', 'way', 'relation'])

/**
 * Overpass QL has no parameter binding, so the tag key and value are
 * interpolated into the query string. A key is therefore restricted to the
 * characters OSM keys actually use, and a value is escaped — an unescaped `"`
 * in a campaign-supplied tag value would otherwise end the string literal and
 * let the rest of the value become query syntax.
 */
const VALID_TAG_KEY = /^[A-Za-z0-9_:.-]+$/

/** @param {string} value */
function escapeQlString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * @param {unknown} bbox
 * @returns {[number, number, number, number]}
 */
function assertBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw new TypeError('An Overpass area needs a bbox of [south, west, north, east].')
  }

  const [south, west, north, east] = bbox.map(Number)
  if (![south, west, north, east].every(Number.isFinite)) {
    throw new TypeError('Overpass bbox values must be numbers.')
  }
  if (Math.abs(south) > 90 || Math.abs(north) > 90 || Math.abs(west) > 180 || Math.abs(east) > 180) {
    throw new TypeError('Overpass bbox values are out of range.')
  }
  // An inverted box silently matches nothing, which looks like "the area has no
  // businesses" rather than "the config is wrong" — so it is refused.
  if (south >= north || west >= east) {
    throw new TypeError('Overpass bbox must be [south, west, north, east] with south < north and west < east.')
  }

  return [south, west, north, east]
}

/**
 * Builds one Overpass QL query.
 *
 * Throws for an unusable tag or bbox rather than emitting a query that would
 * not mean what the campaign intended. `discoverViaOverpass` catches it and
 * reports a configuration error; the throw is what stops a typo in a campaign
 * config from being sent to a public service as a full-planet query.
 *
 * @param {{ tags: Array<{ key: string, value?: string }>,
 *           bbox?: number[], area?: string, limit?: number }} input
 * @returns {string}
 */
export function buildOverpassQuery({ tags, bbox, area, limit } = {}) {
  const selectors = (Array.isArray(tags) ? tags : [])
    .map((tag) => {
      const key = String(tag?.key ?? '').trim()
      if (!VALID_TAG_KEY.test(key)) throw new TypeError(`Unusable Overpass tag key: "${key}".`)

      const value = tag?.value === undefined || tag?.value === null ? '' : String(tag.value).trim()
      // No value means "this key exists at all" — `["shop"]` finds every shop,
      // which is a legitimate and common campaign filter.
      return value ? `["${escapeQlString(key)}"="${escapeQlString(value)}"]` : `["${escapeQlString(key)}"]`
    })

  if (selectors.length === 0) throw new TypeError('An Overpass query needs at least one tag.')

  const elementLimit = Math.min(
    Math.max(1, Math.trunc(Number(limit) || OVERPASS.maxElementsPerRequest)),
    OVERPASS.maxElementsPerRequest,
  )

  const areaName = String(area ?? '').trim()
  const scope = areaName ? '(area.searchArea)' : `(${assertBbox(bbox).join(',')})`
  // The named-area form costs the server an extra lookup, so it is used only
  // when a campaign has no bbox — a bbox is both cheaper and unambiguous.
  const preamble = areaName ? `area["name"="${escapeQlString(areaName)}"]->.searchArea;\n` : ''

  const body = ELEMENT_TYPES
    .flatMap((type) => selectors.map((selector) => `  ${type}${selector}${scope};`))
    .join('\n')

  return `[out:json][timeout:${OVERPASS.serverTimeoutSeconds}];\n${preamble}(\n${body}\n);\nout body center ${elementLimit};\n`
}

/**
 * Picks the website an element claims, preferring the tag that is specifically
 * about contact details over the general one.
 *
 * @param {Record<string, string>} tags
 */
function websiteFrom(tags) {
  return tags['contact:website'] || tags.website || tags['contact:url'] || ''
}

/** @param {Record<string, string>} tags */
function evidenceFrom(tags) {
  return Object.fromEntries(
    OVERPASS.evidenceTags.filter((key) => tags[key] !== undefined).map((key) => [key, tags[key]]),
  )
}

/**
 * Maps one Overpass element to a raw candidate.
 *
 * @param {object} element
 * @returns {object|null} null when the element is not something we can use
 */
function elementToRaw(element) {
  if (!element || typeof element !== 'object') return null
  if (!ELEMENT_TYPES.includes(element.type)) return null
  if (element.id === undefined || element.id === null) return null

  const tags = element.tags && typeof element.tags === 'object' ? element.tags : {}
  // `out center` puts a way's or relation's representative point on `center`;
  // a node carries its own coordinates.
  const point = element.center && typeof element.center === 'object' ? element.center : element

  return {
    externalId: `${element.type}/${element.id}`,
    name: tags.name,
    websiteUrl: websiteFrom(tags),
    phone: tags.phone || tags['contact:phone'],
    email: tags['contact:email'] || tags.email,
    street: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    city: tags['addr:city'],
    region: tags['addr:state'],
    category: tags.office || tags.shop || tags.amenity || tags.craft,
    latitude: point.lat,
    longitude: point.lon,
    payload: {
      source: 'overpass',
      osmType: element.type,
      osmId: String(element.id),
      postcode: tags['addr:postcode'],
      // The raw tags, so a later "OSM said this business had a website" is
      // answerable from the record rather than from a re-query.
      tags: evidenceFrom(tags),
    },
  }
}

/**
 * Whether an Overpass response came from an instance that actually has data.
 *
 * MEASURED, not theoretical. On 18 September 2026 `overpass.osm.ch` answered
 * **HTTP 200** with a well-formed body, an empty `elements` array, and
 * `"timestamp_osm_base": "117103"` — which is not a timestamp. A health check
 * written against status codes calls that mirror healthy, discovery reports
 * success, and nothing is ever found. That is the same failure shape as reading
 * the wrong mailbox folder: the wrong answer arrives looking like the right one.
 *
 * An EMPTY `elements` array is NOT unhealthy on its own — a bbox with no
 * matching business is an ordinary, correct result. Only the envelope is
 * judged, because only the envelope can distinguish "nothing is there" from
 * "this instance cannot tell you what is there".
 *
 * @param {unknown} body
 * @returns {boolean}
 */
export function hasUsableOverpassData(body) {
  if (!body || typeof body !== 'object') return false
  if (!Array.isArray(body.elements)) return false

  const stamp = body.osm3s?.timestamp_osm_base
  // A healthy instance reports when its data was last cut, as an ISO-8601
  // instant. A bare integer, an empty string or a missing field all mean the
  // instance cannot vouch for its own data.
  if (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(stamp)) return false

  return !Number.isNaN(Date.parse(stamp))
}

/**
 * Classifies a failed response into a reason an operator can act on.
 *
 * @param {number} status
 */
function statusReason(status) {
  if (status === 429) return 'overpass_rate_limited'
  // Overpass returns 504 for a query it killed, which means the bbox or the tag
  // set was too broad — a config problem, not an outage.
  if (status === 504) return 'overpass_query_timeout'
  return `overpass_http_${status}`
}

/**
 * Runs one campaign's Overpass discovery.
 *
 * Areas are queried STRICTLY SEQUENTIALLY, and the first failure stops the run:
 * a rate limit or a timeout from a donated service is a request to back off,
 * and firing the remaining areas at it anyway is how a soft limit becomes a
 * ban. Whatever was collected before the failure is returned alongside the
 * error, so a partial run is still useful.
 *
 * @param {{ campaign?: object, fetchImpl?: typeof fetch, limit?: number,
 *           endpoint?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<{ candidates: object[], requests: number, error: string|null }>}
 */
export async function discoverViaOverpass(options = {}) {
  const { campaign, fetchImpl = fetch, limit, endpoint, signal } = options
  const config = campaign?.config?.overpass

  const areas = Array.isArray(config?.areas) ? config.areas : []
  const tags = Array.isArray(config?.tags) ? config.tags : []
  if (areas.length === 0 || tags.length === 0) {
    return { candidates: [], requests: 0, error: 'overpass_not_configured' }
  }

  const target = Math.min(
    Math.max(1, Math.trunc(Number(limit) || USAGE_LIMITS.discovery_candidates)),
    USAGE_LIMITS.discovery_candidates,
  )
  // Two independent bounds: how many areas we are willing to walk in one run,
  // and the daily request allocation for this source.
  const requestBudget = Math.min(areas.length, OVERPASS.maxAreas, USAGE_LIMITS.overpass_requests)
  const url = String(endpoint || config.endpoint || OVERPASS.defaultEndpoint)

  const collected = []
  let requests = 0

  for (const areaConfig of areas.slice(0, requestBudget)) {
    if (collected.length >= target) break

    let query
    try {
      query = buildOverpassQuery({
        tags,
        bbox: areaConfig?.bbox,
        area: areaConfig?.bbox ? undefined : areaConfig?.name,
        limit: target - collected.length,
      })
    } catch {
      // A bad area is the campaign's fault, and continuing would quietly
      // discover from a subset the operator did not ask for.
      return { candidates: collected, requests, error: 'overpass_invalid_config' }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), OVERPASS.requestTimeoutMs)
    const onOuterAbort = () => controller.abort()
    signal?.addEventListener('abort', onOuterAbort, { once: true })

    let response
    requests += 1
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          // Overpass asks that automated clients identify themselves and say
          // where to complain. This is the same identity the crawler uses.
          'User-Agent': CRAWLER.userAgent,
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      })
    } catch {
      return {
        candidates: collected,
        requests,
        error: controller.signal.aborted ? 'overpass_timeout' : 'overpass_network_error',
      }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }

    if (!response || !response.ok) {
      await response?.body?.cancel?.().catch(() => {})
      return { candidates: collected, requests, error: statusReason(response?.status ?? 0) }
    }

    let body
    try {
      body = await response.json()
    } catch {
      // Overpass serves an HTML error page when it is overloaded, so a parse
      // failure here is expected often enough to be a named outcome.
      return { candidates: collected, requests, error: 'overpass_invalid_json' }
    }

    // Two distinct faults, kept distinct because they call for opposite fixes.
    // A body with no `elements` array is malformed — the query or the server
    // reply is wrong. A well-formed body from an instance that cannot vouch for
    // its own data means change endpoint, not query.
    const elements = Array.isArray(body?.elements) ? body.elements : null
    if (!elements) return { candidates: collected, requests, error: 'overpass_malformed_response' }

    if (!hasUsableOverpassData(body)) {
      return { candidates: collected, requests, error: 'overpass_endpoint_unusable' }
    }

    for (const element of elements) {
      if (collected.length >= target) break
      const raw = elementToRaw(element)
      if (!raw) continue

      // Most OSM entries have no website at all, and plenty list a Facebook
      // page. Both are rejected here; neither is an error.
      const result = normalizeCandidate(raw)
      if (result.ok) collected.push(result.candidate)
    }
  }

  return { candidates: collected, requests, error: null }
}
