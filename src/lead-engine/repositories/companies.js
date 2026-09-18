/**
 * Companies: the deduplicated business identity.
 *
 * The one invariant this file protects is that a canonical domain maps to
 * exactly one company row, forever. Everything downstream — crawl budgets, AI
 * spend, and most importantly "have we already emailed these people" — is only
 * as correct as that.
 */

import { canonicalDomain, parseWebsite } from '../domain/domains.js'
import { bounded, newId, nowIso, operationError } from './helpers.js'

const MAX_NAME = 200
const MAX_ADDRESS = 300

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    canonicalDomain: row.canonical_domain,
    name: row.name,
    websiteUrl: row.website_url,
    industry: row.industry,
    countryCode: row.country_code,
    region: row.region,
    metro: row.metro,
    city: row.city,
    postalCode: row.postal_code,
    streetAddress: row.street_address,
    phone: row.phone,
    latitude: row.latitude,
    longitude: row.longitude,
    firstDiscoveredAt: row.first_discovered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} domain already canonical
 */
export async function findCompanyByDomain(db, domain) {
  const row = await db
    .prepare('SELECT * FROM lead_companies WHERE canonical_domain = ?')
    .bind(domain)
    .first()
  return mapRow(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getCompany(db, id) {
  const row = await db.prepare('SELECT * FROM lead_companies WHERE id = ?').bind(id).first()
  return mapRow(row)
}

/**
 * Creates the company, or enriches the existing one.
 *
 * Enrichment is ADDITIVE ONLY: a second source can fill a field that is empty,
 * but never overwrite one that is already populated. Discovery sources
 * routinely disagree — an OSM node and a search result will give different
 * names and addresses for the same business — and last-writer-wins would make
 * a company's recorded identity depend on the order two sources happened to
 * run in. The competing claims all survive in `lead_source_records` for a human
 * to adjudicate.
 *
 * The website URL is the exception: it is only replaced when the stored one is
 * missing, because it is the crawl target and changing it mid-pipeline would
 * invalidate signals already extracted.
 *
 * Idempotent on `canonical_domain`, which is what makes re-running discovery
 * safe.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ name?: string, websiteUrl: string, industry?: string|null,
 *           countryCode?: string|null, region?: string|null, metro?: string|null,
 *           city?: string|null, postalCode?: string|null, streetAddress?: string|null,
 *           phone?: string|null, latitude?: number|null, longitude?: number|null }} input
 * @returns {Promise<{ company: object, created: boolean }>}
 */
export async function upsertCompany(db, input) {
  const domain = canonicalDomain(input.websiteUrl)
  if (!domain) {
    throw operationError(`Cannot derive a canonical domain from "${input.websiteUrl}".`, 422)
  }

  const existing = await findCompanyByDomain(db, domain)
  const now = nowIso()

  if (!existing) {
    const parsed = parseWebsite(input.websiteUrl)
    const company = {
      id: newId(),
      canonicalDomain: domain,
      name: bounded(input.name || domain, MAX_NAME),
      // Stored as origin + path, normalized through the same parser the
      // crawler uses, so the crawl target and the dedupe key can never
      // disagree about which site this is.
      websiteUrl: parsed ? parsed.origin : `https://${domain}`,
      industry: input.industry ?? null,
      countryCode: input.countryCode ? String(input.countryCode).toUpperCase().slice(0, 2) : null,
      region: input.region ?? null,
      metro: input.metro ?? null,
      city: input.city ?? null,
      postalCode: input.postalCode ?? null,
      streetAddress: input.streetAddress ? bounded(input.streetAddress, MAX_ADDRESS) : null,
      phone: input.phone ?? null,
      latitude: Number.isFinite(input.latitude) ? input.latitude : null,
      longitude: Number.isFinite(input.longitude) ? input.longitude : null,
      firstDiscoveredAt: now,
      createdAt: now,
      updatedAt: now,
    }

    // OR IGNORE, not a plain INSERT: two discovery jobs for the same domain can
    // run concurrently, and losing that race must be a no-op rather than a
    // UNIQUE-constraint failure that fails the whole batch.
    await db
      .prepare(
        `INSERT OR IGNORE INTO lead_companies
           (id, canonical_domain, name, website_url, industry, country_code, region, metro,
            city, postal_code, street_address, phone, latitude, longitude,
            first_discovered_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        company.id, company.canonicalDomain, company.name, company.websiteUrl, company.industry,
        company.countryCode, company.region, company.metro, company.city, company.postalCode,
        company.streetAddress, company.phone, company.latitude, company.longitude,
        company.firstDiscoveredAt, company.createdAt, company.updatedAt,
      )
      .run()

    const stored = await findCompanyByDomain(db, domain)
    // `created` reflects whether THIS call inserted it: if the concurrent
    // writer won, the row exists but we did not create it, and the caller must
    // not record a second DISCOVERED activity for it.
    return { company: stored, created: stored?.id === company.id }
  }

  const enriched = {
    name: existing.name && existing.name !== existing.canonicalDomain ? existing.name : bounded(input.name || existing.name, MAX_NAME),
    industry: existing.industry ?? input.industry ?? null,
    countryCode: existing.countryCode ?? (input.countryCode ? String(input.countryCode).toUpperCase().slice(0, 2) : null),
    region: existing.region ?? input.region ?? null,
    metro: existing.metro ?? input.metro ?? null,
    city: existing.city ?? input.city ?? null,
    postalCode: existing.postalCode ?? input.postalCode ?? null,
    streetAddress: existing.streetAddress ?? (input.streetAddress ? bounded(input.streetAddress, MAX_ADDRESS) : null),
    phone: existing.phone ?? input.phone ?? null,
    latitude: existing.latitude ?? (Number.isFinite(input.latitude) ? input.latitude : null),
    longitude: existing.longitude ?? (Number.isFinite(input.longitude) ? input.longitude : null),
  }

  await db
    .prepare(
      `UPDATE lead_companies
       SET name = ?, industry = ?, country_code = ?, region = ?, metro = ?, city = ?,
           postal_code = ?, street_address = ?, phone = ?, latitude = ?, longitude = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      enriched.name, enriched.industry, enriched.countryCode, enriched.region, enriched.metro,
      enriched.city, enriched.postalCode, enriched.streetAddress, enriched.phone,
      enriched.latitude, enriched.longitude, now, existing.id,
    )
    .run()

  return { company: { ...existing, ...enriched, updatedAt: now }, created: false }
}

/**
 * Corrects a company's details from the admin UI.
 *
 * Unlike `upsertCompany`, this DOES overwrite — it is a human deliberately
 * fixing a record, which is the one case where last-writer-wins is correct.
 * The canonical domain is not editable: changing it would silently re-identify
 * every lead, signal, contact and conversation hanging off the row.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function updateCompany(db, id, patch) {
  const existing = await getCompany(db, id)
  if (!existing) throw operationError('Company not found.', 404)

  const next = {
    name: patch.name !== undefined ? bounded(patch.name, MAX_NAME) : existing.name,
    industry: patch.industry !== undefined ? patch.industry : existing.industry,
    countryCode: patch.countryCode !== undefined ? patch.countryCode : existing.countryCode,
    region: patch.region !== undefined ? patch.region : existing.region,
    metro: patch.metro !== undefined ? patch.metro : existing.metro,
    city: patch.city !== undefined ? patch.city : existing.city,
    phone: patch.phone !== undefined ? patch.phone : existing.phone,
  }

  await db
    .prepare(
      `UPDATE lead_companies
       SET name = ?, industry = ?, country_code = ?, region = ?, metro = ?, city = ?, phone = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(next.name, next.industry, next.countryCode, next.region, next.metro, next.city, next.phone, nowIso(), id)
    .run()

  return { ...existing, ...next }
}
