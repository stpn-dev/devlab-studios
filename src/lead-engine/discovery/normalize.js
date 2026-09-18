/**
 * The one candidate shape every discovery adapter produces.
 *
 * Overpass, Brave and a pasted CSV disagree about almost everything — field
 * names, address granularity, whether a "website" is a URL or a Facebook page —
 * and none of them is trustworthy. Normalizing at the adapter boundary means
 * the rest of the engine (source records, company upsert, crawl queue) sees one
 * validated shape, and that a source-specific quirk is fixed in one adapter
 * rather than defended against in five places downstream.
 *
 * The hard rule: a candidate without a resolvable canonical domain is NOT a
 * candidate. `lead_companies.canonical_domain` is the identity key and the
 * crawler has nothing to fetch without it, so a nameless row with a website is
 * usable and a named row without one is not.
 *
 * Nothing here mutates its input. An adapter hands over the raw upstream
 * object and gets back a new candidate; the raw object is still the raw object
 * when it is written to `lead_source_records.payload_json`.
 */

import { canonicalDomain, isNonCompanyHost, normalizeCompanyName, normalizeEmail, parseWebsite } from '../domain/domains.js'

/**
 * Field ceilings.
 *
 * These mirror the column bounds the repositories already apply
 * (`bounded(input.rawName, 200)` and friends in repositories/sources.js), so a
 * 40KB "name" from a malformed upstream row is cut here rather than at the
 * INSERT, where it would be a silent truncation nobody sees.
 */
export const CANDIDATE_LIMITS = Object.freeze({
  externalId: 200,
  name: 200,
  street: 300,
  city: 120,
  region: 120,
  category: 120,
  phone: 40,
  /** Per-string bound inside `payload`. */
  payloadString: 300,
  /** Keys kept per object level in `payload`, and depth allowed below the root. */
  payloadKeys: 24,
  payloadDepth: 2,
  payloadArrayItems: 10,
  /** Distinct alternate names recorded when two sources disagree. */
  nameVariants: 5,
})

/**
 * Collapses whitespace, trims and bounds. Returns null rather than '' so that
 * "absent" has exactly one representation and `??` chains behave.
 *
 * @param {unknown} value
 * @param {number} max
 * @returns {string|null}
 */
function text(value, max) {
  const cleaned = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.slice(0, max)
}

/**
 * ISO 3166-1 alpha-2, or nothing.
 *
 * A column saying "United States" is dropped rather than guessed at: the
 * country code drives campaign targeting and the compliance profile, and an
 * invented value there is worse than a missing one.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function countryCode(value) {
  const cleaned = String(value ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(cleaned) ? cleaned : null
}

/**
 * A coordinate pair, or nothing.
 *
 * Validated as a PAIR because a lone latitude places nothing on a map, and
 * because `Number('')` is 0 — which would silently plant every
 * coordinate-less candidate in the Gulf of Guinea.
 *
 * @param {unknown} rawLatitude
 * @param {unknown} rawLongitude
 * @returns {{ latitude: number|null, longitude: number|null }}
 */
function coordinates(rawLatitude, rawLongitude) {
  const empty = { latitude: null, longitude: null }
  if (rawLatitude === null || rawLatitude === undefined || rawLatitude === '') return empty
  if (rawLongitude === null || rawLongitude === undefined || rawLongitude === '') return empty

  const latitude = Number(rawLatitude)
  const longitude = Number(rawLongitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return empty
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return empty

  return { latitude, longitude }
}

/**
 * Bounds one value destined for `payload`.
 *
 * `payload` is whatever the upstream said, and it is persisted as JSON on the
 * source record. Without a bound, one Overpass relation carrying a hundred
 * translated `name:*` tags — or a search API echoing a whole document — becomes
 * a D1 row nobody can read. Scalars survive, structure survives two levels, and
 * anything else (functions, class instances, cycles) is dropped, which also
 * means `JSON.stringify` on the result cannot throw.
 *
 * @param {unknown} value
 * @param {number} depth remaining levels of nesting allowed
 */
function boundedPayloadValue(value, depth) {
  if (value === null || value === undefined) return null

  const type = typeof value
  if (type === 'string') return value.slice(0, CANDIDATE_LIMITS.payloadString)
  if (type === 'number') return Number.isFinite(value) ? value : null
  if (type === 'boolean') return value
  if (type !== 'object' || depth <= 0) return null

  if (Array.isArray(value)) {
    return value
      .slice(0, CANDIDATE_LIMITS.payloadArrayItems)
      .map((entry) => boundedPayloadValue(entry, depth - 1))
      .filter((entry) => entry !== null)
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, CANDIDATE_LIMITS.payloadKeys)
      .map(([key, entry]) => [key.slice(0, CANDIDATE_LIMITS.payloadString), boundedPayloadValue(entry, depth - 1)])
      .filter(([, entry]) => entry !== null),
  )
}

/** @param {unknown} payload */
function boundedPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  return boundedPayloadValue(payload, CANDIDATE_LIMITS.payloadDepth) || {}
}

/**
 * Validates and normalizes one raw record from any discovery source.
 *
 * Accepts the field aliases the sources actually use (`website`/`url`/`domain`,
 * `state`/`region`, `lon`/`lng`) so each adapter does not need its own mapping
 * layer for the same three names.
 *
 * Rejection is an ordinary outcome, not an error: a directory full of Facebook
 * pages and dead links is the normal case, and the caller wants a reason it can
 * count, not an exception it has to catch per row.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, candidate: object }
 *   | { ok: false, reason: 'no_website'|'non_company_host'|'unparseable_website' }}
 */
export function normalizeCandidate(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}

  const website = input.websiteUrl ?? input.website ?? input.url ?? input.domain ?? ''
  if (!String(website ?? '').trim()) return { ok: false, reason: 'no_website' }

  const url = parseWebsite(website)
  if (!url) return { ok: false, reason: 'unparseable_website' }

  // Checked before canonicalDomain so the reason distinguishes "this is a
  // Facebook page" — a real business we simply cannot identify or crawl — from
  // "this string is not a URL". The two counts tell an operator tuning a
  // campaign completely different things.
  if (isNonCompanyHost(url.href)) return { ok: false, reason: 'non_company_host' }

  const domain = canonicalDomain(url.href)
  if (!domain) return { ok: false, reason: 'unparseable_website' }

  const { latitude, longitude } = coordinates(
    input.latitude ?? input.lat,
    input.longitude ?? input.lon ?? input.lng,
  )

  return {
    ok: true,
    candidate: {
      // Falls back to the domain so every candidate has an idempotency key for
      // `lead_source_records (source_id, external_id)`. A source with no stable
      // id of its own — a search result, a pasted CSV — would otherwise create
      // a new record on every run of the same campaign.
      externalId: text(input.externalId, CANDIDATE_LIMITS.externalId) || `domain:${domain}`,
      name: text(input.name, CANDIDATE_LIMITS.name),
      websiteUrl: url.href,
      canonicalDomain: domain,
      phone: text(input.phone, CANDIDATE_LIMITS.phone),
      email: normalizeEmail(input.email),
      street: text(input.street ?? input.address, CANDIDATE_LIMITS.street),
      city: text(input.city, CANDIDATE_LIMITS.city),
      region: text(input.region ?? input.state, CANDIDATE_LIMITS.region),
      countryCode: countryCode(input.countryCode ?? input.country),
      category: text(input.category ?? input.industry, CANDIDATE_LIMITS.category),
      latitude,
      longitude,
      payload: boundedPayload(input.payload),
    },
  }
}

/** Fields merged first-non-empty-wins when two sources describe one domain. */
const MERGEABLE_FIELDS = Object.freeze([
  'name', 'phone', 'email', 'street', 'city', 'region', 'countryCode', 'category',
])

/**
 * Collapses candidates that are the same company.
 *
 * Merging is ADDITIVE and first-non-empty wins: Overpass usually knows the
 * street and the phone, a search result usually knows the trading name, a CSV
 * usually knows the email, and the union is a better lead than any of them
 * alone. Nothing is overwritten, so adapter order decides preference rather
 * than luck — pass the source you trust most first.
 *
 * `sourceCount` is the payoff: it is what the CORROBORATED_BY_TWO_SOURCES
 * signal reads. Records sharing an `externalId` are the same record seen twice
 * (a re-run, or two campaign areas that overlap) and corroborate nothing, so
 * they are counted once.
 *
 * @param {Array<object>} candidates already normalized
 * @returns {Array<object>} new objects, in first-seen order
 */
export function dedupeCandidates(candidates) {
  const order = []
  /** @type {Map<string, { candidate: object, externalIds: Set<string>, names: Map<string, string> }>} */
  const byDomain = new Map()

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || !candidate.canonicalDomain) continue

    const existing = byDomain.get(candidate.canonicalDomain)
    if (!existing) {
      const names = new Map()
      if (candidate.name) names.set(normalizeCompanyName(candidate.name), candidate.name)
      byDomain.set(candidate.canonicalDomain, {
        candidate: { ...candidate, payload: { ...candidate.payload } },
        externalIds: new Set([candidate.externalId]),
        names,
      })
      order.push(candidate.canonicalDomain)
      continue
    }

    const merged = { ...existing.candidate }
    for (const field of MERGEABLE_FIELDS) {
      if (!merged[field] && candidate[field]) merged[field] = candidate[field]
    }
    if (merged.latitude === null && candidate.latitude !== null) {
      merged.latitude = candidate.latitude
      merged.longitude = candidate.longitude
    }
    // First writer wins per key, matching the field rule above.
    merged.payload = { ...candidate.payload, ...existing.candidate.payload }

    // Name equality is judged on the normalized form, so "Acme LLC" and
    // "Acme, L.L.C." are one name rather than a disagreement. A genuine
    // disagreement is kept for the operator to look at — it is the usual sign
    // that two businesses share one parent domain.
    if (candidate.name) {
      const key = normalizeCompanyName(candidate.name)
      if (key && !existing.names.has(key)) existing.names.set(key, candidate.name)
    }

    existing.externalIds.add(candidate.externalId)
    byDomain.set(candidate.canonicalDomain, { ...existing, candidate: merged })
  }

  return order.map((domain) => {
    const entry = byDomain.get(domain)
    const variants = [...entry.names.values()].filter((name) => name !== entry.candidate.name)
    return {
      ...entry.candidate,
      sourceCount: entry.externalIds.size,
      ...(variants.length > 0 ? { nameVariants: variants.slice(0, CANDIDATE_LIMITS.nameVariants) } : {}),
    }
  })
}
