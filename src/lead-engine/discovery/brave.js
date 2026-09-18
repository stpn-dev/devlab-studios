/**
 * Optional discovery against the Brave Search API.
 *
 * OPTIONAL is the load-bearing word. Brave is a paid, metered API and the
 * engine is designed to work without it: with no key configured this adapter
 * returns `{ candidates: [], requests: 0, error: 'brave_not_configured' }` and
 * the run continues on Overpass and manual imports alone. Nothing downstream
 * may treat the absence of a Brave key as a failure — that is what keeps the
 * whole pipeline runnable on a free tier.
 *
 * DISCOVERY ONLY. What this adapter takes from a search result is the URL and
 * the title, i.e. "a site that might be a business of the kind we are looking
 * for exists at this domain". The snippet is NOT kept beyond a short bounded
 * `description` in `payload`, retained so an operator can see why a domain was
 * suggested, and it is NEVER forwarded to Workers AI: the AI opportunity review
 * reasons only over pages this system fetched itself (see signals/extract.js),
 * because a search snippet is a third party's summary of a page and feeding it
 * to a model would let an unverified sentence become a scored "finding". The
 * crawler re-fetches every domain from source, and that is the only text the
 * model ever sees.
 *
 * Never throws for an upstream failure — a bad key, a quota wall or a malformed
 * body all return `{ candidates: [], error }`.
 */

import { USAGE_LIMITS } from '../config/defaults.js'
import { normalizeCandidate } from './normalize.js'

/** Adapter-local policy; the values a campaign does not override. */
export const BRAVE = Object.freeze({
  endpoint: 'https://api.search.brave.com/res/v1/web/search',
  requestTimeoutMs: 10_000,
  /** Queries run per campaign run, before the daily budget is applied. */
  maxQueriesPerRun: 10,
  /** The API's own per-request ceiling. */
  maxResultsPerQuery: 20,
  defaultResultsPerQuery: 10,
  maxQueryLength: 400,
  /** Characters of snippet retained as `payload.description`. */
  descriptionLength: 200,
})

/**
 * The queries a campaign has explicitly configured.
 *
 * Deliberately does NOT compose queries from target industries and metros. Each
 * query is a metered request, and a generated cross-product silently turns a
 * three-industry, four-city campaign into twelve of them. An operator writes
 * the queries they want to pay for.
 *
 * @param {object} [campaign]
 * @returns {string[]} trimmed, bounded, de-duplicated, in configured order
 */
export function buildBraveQueries(campaign) {
  const configured = Array.isArray(campaign?.config?.brave?.queries) ? campaign.config.brave.queries : []
  const seen = new Set()
  const queries = []

  for (const entry of configured) {
    const query = String(entry ?? '').replace(/\s+/g, ' ').trim().slice(0, BRAVE.maxQueryLength)
    if (!query) continue

    // Case-insensitive, because two spellings of the same query cost two
    // requests and return the same results.
    const key = query.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    queries.push(query)
    if (queries.length >= BRAVE.maxQueriesPerRun) break
  }

  return queries
}

/** @param {number} status */
function statusReason(status) {
  if (status === 401 || status === 403) return 'brave_unauthorized'
  if (status === 429) return 'brave_rate_limited'
  return `brave_http_${status}`
}

/**
 * Maps one search result to a raw candidate.
 *
 * The title is used as a provisional name only. Search titles carry site
 * furniture ("Home | Acme Property Management — Austin TX"), so the crawler's
 * own extraction overwrites it later; it is here so a candidate is legible in
 * the review queue before it has been crawled.
 *
 * @param {object} result
 * @param {string} query
 */
function resultToRaw(result, query) {
  if (!result || typeof result !== 'object') return null
  const url = String(result.url ?? '').trim()
  if (!url) return null

  return {
    name: result.title,
    websiteUrl: url,
    payload: {
      source: 'brave',
      query,
      title: String(result.title ?? '').slice(0, BRAVE.descriptionLength),
      // Bounded, kept for operator provenance, and never sent to a model.
      description: String(result.description ?? '').slice(0, BRAVE.descriptionLength),
    },
  }
}

/**
 * Runs one campaign's Brave discovery, if it is configured at all.
 *
 * @param {{ campaign?: object, apiKey?: string, fetchImpl?: typeof fetch,
 *           limit?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{ candidates: object[], requests: number, error: string|null }>}
 */
export async function discoverViaBrave(options = {}) {
  const { campaign, apiKey, fetchImpl = fetch, limit, signal } = options

  // The unconfigured path, and the reason this whole module is optional. Not an
  // error condition: the caller records it and moves on to the next adapter.
  if (!String(apiKey ?? '').trim()) {
    return { candidates: [], requests: 0, error: 'brave_not_configured' }
  }

  const queries = buildBraveQueries(campaign)
  if (queries.length === 0) return { candidates: [], requests: 0, error: 'brave_no_queries' }

  const config = campaign?.config?.brave || {}
  const target = Math.min(
    Math.max(1, Math.trunc(Number(limit) || USAGE_LIMITS.discovery_candidates)),
    USAGE_LIMITS.discovery_candidates,
  )
  // Three bounds, lowest wins: the campaign's own budget, this run's ceiling,
  // and the daily allocation for the source.
  const requestBudget = Math.min(
    Number.isFinite(Number(config.requestBudget)) ? Math.max(0, Math.trunc(Number(config.requestBudget))) : queries.length,
    queries.length,
    USAGE_LIMITS.brave_requests,
  )
  const count = Math.min(
    Math.max(1, Math.trunc(Number(config.count) || BRAVE.defaultResultsPerQuery)),
    BRAVE.maxResultsPerQuery,
  )
  const country = /^[A-Za-z]{2}$/.test(String(config.country ?? '').trim())
    ? String(config.country).trim().toUpperCase()
    : null

  const collected = []
  let requests = 0

  for (const query of queries.slice(0, requestBudget)) {
    if (collected.length >= target) break

    const params = new URLSearchParams({ q: query, count: String(count) })
    if (country) params.set('country', country)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), BRAVE.requestTimeoutMs)
    const onOuterAbort = () => controller.abort()
    signal?.addEventListener('abort', onOuterAbort, { once: true })

    let response
    requests += 1
    try {
      response = await fetchImpl(`${BRAVE.endpoint}?${params.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: controller.signal,
      })
    } catch {
      return {
        candidates: collected,
        requests,
        error: controller.signal.aborted ? 'brave_timeout' : 'brave_network_error',
      }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }

    if (!response || !response.ok) {
      await response?.body?.cancel?.().catch(() => {})
      // Stop rather than continue: a rejected key or an exhausted quota fails
      // identically for every remaining query, and each retry still costs a
      // request against the daily budget.
      return { candidates: collected, requests, error: statusReason(response?.status ?? 0) }
    }

    let body
    try {
      body = await response.json()
    } catch {
      return { candidates: collected, requests, error: 'brave_invalid_json' }
    }

    const results = Array.isArray(body?.web?.results) ? body.web.results : null
    if (!results) return { candidates: collected, requests, error: 'brave_malformed_response' }

    for (const result of results) {
      if (collected.length >= target) break
      const raw = resultToRaw(result, query)
      if (!raw) continue

      // Search results for a local-business query are largely directories,
      // social profiles and aggregators. normalizeCandidate drops the
      // non-company hosts; the rest are hypotheses for the crawler.
      const candidate = normalizeCandidate(raw)
      if (candidate.ok) collected.push(candidate.candidate)
    }
  }

  return { candidates: collected, requests, error: null }
}
