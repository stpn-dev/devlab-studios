/**
 * The source registry and the raw records each source produced.
 *
 * A source that is not a row here cannot be used. That is the mechanism that
 * stops an arbitrary directory URL from quietly becoming an automated scrape
 * target: the discovery dispatcher looks a source up by slug and refuses when
 * it is absent, disabled, or not policy-approved.
 */

import { bounded, buildWhere, clampLimit, clampOffset, newId, nowIso, operationError, parseJsonField, toInt } from './helpers.js'

function mapSource(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    automationAllowed: row.automation_allowed === 1,
    crawlAllowed: row.crawl_allowed === 1,
    policyStatus: row.policy_status,
    policyNotes: row.policy_notes,
    lastPolicyReviewedAt: row.last_policy_reviewed_at,
    lastPolicyReviewedBy: row.last_policy_reviewed_by,
    parserVersion: Number(row.parser_version),
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lastRunError: row.last_run_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recordCount: row.record_count !== undefined ? Number(row.record_count) : undefined,
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getSourceBySlug(db, slug) {
  const row = await db.prepare('SELECT * FROM lead_sources WHERE slug = ?').bind(slug).first()
  return mapSource(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listSources(db) {
  const result = await db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM lead_source_records WHERE source_id = s.id) AS record_count
       FROM lead_sources s ORDER BY s.name ASC`,
    )
    .all()
  return (result.results || []).map(mapSource)
}

/**
 * The gate every discovery adapter passes through.
 *
 * Three separate conditions, all required, each with its own message — an
 * operator who sees "not enabled" knows to flip a switch, and one who sees
 * "policy status is unreviewed" knows to go and read the source's terms first.
 * Collapsing them into one boolean would lose exactly the information needed
 * to act.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @returns {Promise<{ allowed: boolean, reason?: string, source?: object }>}
 */
export async function assertSourceUsable(db, slug) {
  const source = await getSourceBySlug(db, slug)
  if (!source) return { allowed: false, reason: `Source "${slug}" is not registered.` }
  if (!source.enabled) return { allowed: false, reason: `Source "${slug}" is not enabled.`, source }
  if (!source.automationAllowed) {
    return { allowed: false, reason: `Source "${slug}" is not approved for automated access.`, source }
  }
  if (source.policyStatus !== 'approved') {
    return { allowed: false, reason: `Source "${slug}" has policy status "${source.policyStatus}".`, source }
  }
  return { allowed: true, source }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {object} input
 */
export async function upsertSource(db, input, actorEmail = null) {
  const existing = await getSourceBySlug(db, input.slug)
  const now = nowIso()

  if (!existing) {
    const id = newId()
    await db
      .prepare(
        `INSERT INTO lead_sources
           (id, name, slug, type, base_url, enabled, automation_allowed, crawl_allowed,
            policy_status, policy_notes, last_policy_reviewed_at, last_policy_reviewed_by,
            parser_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, bounded(input.name, 160), input.slug, input.type, input.baseUrl ?? null,
        // A newly registered source is never enabled or approved on creation.
        // Approving one means a human has read its terms, which cannot happen
        // in the same request that registers it.
        0, 0, 0,
        'unreviewed', bounded(input.policyNotes || '', 2_000), null, null,
        input.parserVersion ?? 1, now, now,
      )
      .run()
    return getSourceBySlug(db, input.slug)
  }

  const next = {
    name: input.name !== undefined ? bounded(input.name, 160) : existing.name,
    baseUrl: input.baseUrl !== undefined ? input.baseUrl : existing.baseUrl,
    enabled: input.enabled !== undefined ? input.enabled : existing.enabled,
    automationAllowed: input.automationAllowed !== undefined ? input.automationAllowed : existing.automationAllowed,
    crawlAllowed: input.crawlAllowed !== undefined ? input.crawlAllowed : existing.crawlAllowed,
    policyStatus: input.policyStatus !== undefined ? input.policyStatus : existing.policyStatus,
    policyNotes: input.policyNotes !== undefined ? bounded(input.policyNotes, 2_000) : existing.policyNotes,
  }

  // Enabling automation requires the policy to have been reviewed and approved.
  // Refused here rather than in the UI so the API cannot be used to skip it.
  if (next.enabled && next.automationAllowed && next.policyStatus !== 'approved') {
    throw operationError('A source cannot be automated until its policy status is "approved".', 422)
  }

  const policyChanged = next.policyStatus !== existing.policyStatus || next.policyNotes !== existing.policyNotes

  await db
    .prepare(
      `UPDATE lead_sources
       SET name = ?, base_url = ?, enabled = ?, automation_allowed = ?, crawl_allowed = ?,
           policy_status = ?, policy_notes = ?,
           last_policy_reviewed_at = ?, last_policy_reviewed_by = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      next.name, next.baseUrl, toInt(next.enabled), toInt(next.automationAllowed), toInt(next.crawlAllowed),
      next.policyStatus, next.policyNotes,
      policyChanged ? now : existing.lastPolicyReviewedAt,
      policyChanged ? actorEmail : existing.lastPolicyReviewedBy,
      now, existing.id,
    )
    .run()

  return getSourceBySlug(db, input.slug)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function recordSourceRun(db, sourceId, { status, error = null }) {
  const now = nowIso()
  await db
    .prepare('UPDATE lead_sources SET last_run_at = ?, last_run_status = ?, last_run_error = ?, updated_at = ? WHERE id = ?')
    .bind(now, status, error ? bounded(error, 500) : null, now, sourceId)
    .run()
}

// ---------------------------------------------------------------------------
// Source records
// ---------------------------------------------------------------------------

function mapRecord(row) {
  if (!row) return null
  return {
    id: row.id,
    sourceId: row.source_id,
    campaignId: row.campaign_id,
    externalId: row.external_id,
    companyId: row.company_id,
    rawName: row.raw_name,
    rawWebsite: row.raw_website,
    rawPhone: row.raw_phone,
    rawEmail: row.raw_email,
    rawAddress: row.raw_address,
    rawCity: row.raw_city,
    rawRegion: row.raw_region,
    rawCountryCode: row.raw_country_code,
    rawCategory: row.raw_category,
    payload: parseJsonField(row.payload_json, {}),
    parserVersion: Number(row.parser_version),
    discoveredAt: row.discovered_at,
    sourceName: row.source_name ?? null,
  }
}

/**
 * Records what a source said, idempotently.
 *
 * `(source_id, external_id)` is UNIQUE, so re-running discovery updates the
 * record rather than creating a second one — which is what makes a campaign
 * safe to re-run without inflating the candidate count.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {object} input
 * @returns {Promise<{ record: object, created: boolean }>}
 */
export async function upsertSourceRecord(db, input) {
  const now = nowIso()
  const existing = await db
    .prepare('SELECT * FROM lead_source_records WHERE source_id = ? AND external_id = ?')
    .bind(input.sourceId, input.externalId)
    .first()

  if (existing) {
    await db
      .prepare(
        `UPDATE lead_source_records
         SET company_id = COALESCE(?, company_id), raw_name = ?, raw_website = ?, raw_phone = ?,
             raw_email = ?, raw_address = ?, raw_city = ?, raw_region = ?, raw_country_code = ?,
             raw_category = ?, payload_json = ?, parser_version = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.companyId ?? null, bounded(input.rawName || '', 200), input.rawWebsite ?? null,
        input.rawPhone ?? null, input.rawEmail ?? null, bounded(input.rawAddress || '', 300),
        input.rawCity ?? null, input.rawRegion ?? null, input.rawCountryCode ?? null,
        input.rawCategory ?? null, JSON.stringify(input.payload ?? {}), input.parserVersion ?? 1,
        now, existing.id,
      )
      .run()
    return { record: mapRecord({ ...existing, company_id: input.companyId ?? existing.company_id }), created: false }
  }

  const id = newId()
  await db
    .prepare(
      `INSERT OR IGNORE INTO lead_source_records
         (id, source_id, campaign_id, external_id, company_id, raw_name, raw_website, raw_phone,
          raw_email, raw_address, raw_city, raw_region, raw_country_code, raw_category,
          payload_json, parser_version, discovered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, input.sourceId, input.campaignId ?? null, input.externalId, input.companyId ?? null,
      bounded(input.rawName || '', 200), input.rawWebsite ?? null, input.rawPhone ?? null,
      input.rawEmail ?? null, bounded(input.rawAddress || '', 300), input.rawCity ?? null,
      input.rawRegion ?? null, input.rawCountryCode ?? null, input.rawCategory ?? null,
      JSON.stringify(input.payload ?? {}), input.parserVersion ?? 1, now, now, now,
    )
    .run()

  const stored = await db
    .prepare('SELECT * FROM lead_source_records WHERE source_id = ? AND external_id = ?')
    .bind(input.sourceId, input.externalId)
    .first()

  return { record: mapRecord(stored), created: stored?.id === id }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listSourceRecordsForCompany(db, companyId) {
  const result = await db
    .prepare(
      `SELECT r.*, s.name AS source_name
       FROM lead_source_records r
       JOIN lead_sources s ON s.id = r.source_id
       WHERE r.company_id = ?
       ORDER BY r.discovered_at DESC`,
    )
    .bind(companyId)
    .all()
  return (result.results || []).map(mapRecord)
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ sourceId?, campaignId?, limit?, offset? }} [filters]
 */
export async function listSourceRecords(db, filters = {}) {
  const { clause, bindings } = buildWhere([
    ['r.source_id = ?', filters.sourceId ?? null],
    ['r.campaign_id = ?', filters.campaignId ?? null],
  ])

  const result = await db
    .prepare(
      `SELECT r.*, s.name AS source_name
       FROM lead_source_records r
       JOIN lead_sources s ON s.id = r.source_id
       ${clause}
       ORDER BY r.discovered_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, clampLimit(filters.limit, 50, 200), clampOffset(filters.offset))
    .all()

  return (result.results || []).map(mapRecord)
}
