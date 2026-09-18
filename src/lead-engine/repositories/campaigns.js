/**
 * Campaigns: the only place vertical-specific knowledge lives.
 *
 * A campaign row holds the country, metros, OSM tag mappings, search queries
 * and industry vocabulary. The engine reads them; no source file in
 * src/lead-engine/ names a vertical.
 */

import { bounded, buildWhere, clampLimit, clampOffset, newId, nowIso, operationError, parseJsonField, toInt } from './helpers.js'

const MAX_NAME = 160
const MAX_DESCRIPTION = 2_000

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    countryCode: row.country_code,
    config: parseJsonField(row.config_json, {}),
    maxCandidates: Number(row.max_candidates),
    maxAiReviews: Number(row.max_ai_reviews),
    scheduleEnabled: row.schedule_enabled === 1,
    scheduleCron: row.schedule_cron,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lastRunError: row.last_run_error,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leadCount: row.lead_count !== undefined ? Number(row.lead_count) : undefined,
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getCampaign(db, id) {
  const row = await db.prepare('SELECT * FROM lead_campaigns WHERE id = ?').bind(id).first()
  return mapRow(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getCampaignBySlug(db, slug) {
  const row = await db.prepare('SELECT * FROM lead_campaigns WHERE slug = ?').bind(slug).first()
  return mapRow(row)
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ status?: string|null, countryCode?: string|null, limit?: number, offset?: number }} [filters]
 */
export async function listCampaigns(db, filters = {}) {
  const { clause, bindings } = buildWhere([
    ['c.status = ?', filters.status ?? null],
    ['c.country_code = ?', filters.countryCode ?? null],
  ])

  const result = await db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM lead_leads WHERE campaign_id = c.id) AS lead_count
       FROM lead_campaigns c
       ${clause}
       ORDER BY c.updated_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, clampLimit(filters.limit, 50, 200), clampOffset(filters.offset))
    .all()

  return (result.results || []).map(mapRow).filter(Boolean)
}

/**
 * Campaigns the scheduler may touch.
 *
 * BOTH switches must be on. `status = 'active'` says the campaign is live;
 * `schedule_enabled = 1` says it may run unattended. Keeping them independent
 * is what lets an operator run a campaign by hand from the admin without also
 * arming the cron for it — which is exactly the state the seeded dry-run
 * campaign ships in.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function listScheduledCampaigns(db) {
  const result = await db
    .prepare("SELECT * FROM lead_campaigns WHERE status = 'active' AND schedule_enabled = 1 ORDER BY last_run_at ASC NULLS FIRST")
    .all()
  return (result.results || []).map(mapRow).filter(Boolean)
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {object} input already validated by the campaign zod schema
 * @param {string|null} [actorEmail]
 */
export async function createCampaign(db, input, actorEmail = null) {
  const existing = await getCampaignBySlug(db, input.slug)
  if (existing) throw operationError(`A campaign with the slug "${input.slug}" already exists.`, 409)

  const id = newId()
  const now = nowIso()

  await db
    .prepare(
      `INSERT INTO lead_campaigns
         (id, name, slug, description, status, country_code, config_json,
          max_candidates, max_ai_reviews, schedule_enabled, schedule_cron,
          created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      bounded(input.name, MAX_NAME),
      input.slug,
      bounded(input.description || '', MAX_DESCRIPTION),
      // A campaign is ALWAYS created as a draft, whatever the caller asked for.
      // Activating is a separate, deliberate action with its own audit entry —
      // there is no request shape that both creates and arms a campaign.
      'draft',
      String(input.countryCode).toUpperCase(),
      JSON.stringify(input.config ?? {}),
      input.maxCandidates ?? 100,
      input.maxAiReviews ?? 40,
      // Likewise never armed on create.
      0,
      input.scheduleCron ?? null,
      actorEmail,
      now,
      now,
    )
    .run()

  return getCampaign(db, id)
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function updateCampaign(db, id, patch) {
  const existing = await getCampaign(db, id)
  if (!existing) throw operationError('Campaign not found.', 404)

  const next = {
    name: patch.name !== undefined ? bounded(patch.name, MAX_NAME) : existing.name,
    description: patch.description !== undefined ? bounded(patch.description, MAX_DESCRIPTION) : existing.description,
    status: patch.status !== undefined ? patch.status : existing.status,
    countryCode: patch.countryCode !== undefined ? String(patch.countryCode).toUpperCase() : existing.countryCode,
    config: patch.config !== undefined ? patch.config : existing.config,
    maxCandidates: patch.maxCandidates !== undefined ? patch.maxCandidates : existing.maxCandidates,
    maxAiReviews: patch.maxAiReviews !== undefined ? patch.maxAiReviews : existing.maxAiReviews,
    scheduleEnabled: patch.scheduleEnabled !== undefined ? patch.scheduleEnabled : existing.scheduleEnabled,
    scheduleCron: patch.scheduleCron !== undefined ? patch.scheduleCron : existing.scheduleCron,
  }

  // A schedule cannot be armed on a campaign that is not active. Enforced here
  // rather than only in the UI, because the API is reachable without it.
  if (next.scheduleEnabled && next.status !== 'active') {
    throw operationError('A campaign must be active before its schedule can be enabled.', 422)
  }

  await db
    .prepare(
      `UPDATE lead_campaigns
       SET name = ?, description = ?, status = ?, country_code = ?, config_json = ?,
           max_candidates = ?, max_ai_reviews = ?, schedule_enabled = ?, schedule_cron = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      next.name, next.description, next.status, next.countryCode, JSON.stringify(next.config),
      next.maxCandidates, next.maxAiReviews, toInt(next.scheduleEnabled), next.scheduleCron, nowIso(), id,
    )
    .run()

  return getCampaign(db, id)
}

/**
 * Records the outcome of a discovery run against the campaign.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function recordCampaignRun(db, id, { status, error = null }) {
  await db
    .prepare('UPDATE lead_campaigns SET last_run_at = ?, last_run_status = ?, last_run_error = ?, updated_at = ? WHERE id = ?')
    .bind(nowIso(), status, error ? bounded(error, 500) : null, nowIso(), id)
    .run()
}
