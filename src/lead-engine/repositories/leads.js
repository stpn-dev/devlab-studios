/**
 * Leads: one company inside one campaign, and its pipeline state.
 *
 * `lead_leads` is the pipeline entity `lead_id` refers to everywhere else.
 * Distinct from the site's pre-existing `leads` table, which holds INBOUND
 * contact-form submissions — people who asked to be contacted. Nothing in this
 * file reads or writes that table.
 */

import { ACTIVITY } from '../domain/activity.js'
import { canTransition, describeNextAction, STAGES } from '../domain/pipeline.js'

import { buildWhere, clampLimit, clampOffset, newId, nowIso, operationError } from './helpers.js'

/** Maps a present row. Callers that may have none guard with `mapped()` below. */
function mapRow(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    companyId: row.company_id,
    stage: row.stage,
    priority: row.priority,
    ruleScore: row.rule_score,
    aiConfidence: row.ai_confidence,
    opportunityType: row.opportunity_type,
    nextAction: row.next_action,
    holdReason: row.hold_reason,
    lostReason: row.lost_reason,
    lastActivityAt: row.last_activity_at,
    stageChangedAt: row.stage_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Present on the joined list/detail queries only.
    companyName: row.company_name ?? null,
    canonicalDomain: row.canonical_domain ?? null,
    websiteUrl: row.website_url ?? null,
    industry: row.industry ?? null,
    countryCode: row.country_code ?? null,
    metro: row.metro ?? null,
    city: row.city ?? null,
    campaignName: row.campaign_name ?? null,
    contactEmail: row.contact_email ?? null,
    complianceState: row.compliance_state ?? null,
    isSuppressed: row.suppressed_count ? Number(row.suppressed_count) > 0 : undefined,
  }
}

/** `null` for an absent row, the mapped shape otherwise. */
const mappedRow = (row) => (row ? mapRow(row) : null)


const LEAD_SELECT = `
  SELECT l.*,
         c.name AS company_name, c.canonical_domain, c.website_url, c.industry,
         c.country_code, c.metro, c.city,
         cam.name AS campaign_name,
         (SELECT email FROM lead_contacts WHERE lead_id = l.id ORDER BY is_primary DESC, created_at ASC LIMIT 1) AS contact_email,
         (SELECT state FROM lead_compliance_reviews WHERE lead_id = l.id) AS compliance_state
  FROM lead_leads l
  JOIN lead_companies c ON c.id = l.company_id
  JOIN lead_campaigns cam ON cam.id = l.campaign_id
`

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getLead(db, id) {
  const row = await db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).bind(id).first()
  return mappedRow(row)
}

/**
 * Creates the pipeline record for a company in a campaign, or returns the
 * existing one.
 *
 * Idempotent against the `(campaign_id, company_id)` unique index, which is
 * what guarantees duplicate workflow or queue delivery cannot create a second
 * lead. `created` tells the caller whether to record DISCOVERED.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ campaignId: string, companyId: string, priority?: string }} input
 * @returns {Promise<{ lead: object, created: boolean }>}
 */
export async function upsertLead(db, { campaignId, companyId, priority = 'normal' }) {
  const existing = await db
    .prepare('SELECT * FROM lead_leads WHERE campaign_id = ? AND company_id = ?')
    .bind(campaignId, companyId)
    .first()

  if (existing) return { lead: mappedRow(existing), created: false }

  const id = newId()
  const now = nowIso()

  await db
    .prepare(
      `INSERT OR IGNORE INTO lead_leads
         (id, campaign_id, company_id, stage, priority, last_activity_at, stage_changed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, campaignId, companyId, STAGES.DISCOVERED, priority, now, now, now, now)
    .run()

  const stored = await db
    .prepare('SELECT * FROM lead_leads WHERE campaign_id = ? AND company_id = ?')
    .bind(campaignId, companyId)
    .first()

  return { lead: mappedRow(stored), created: stored?.id === id }
}

/**
 * Moves a lead to a new stage and records the transition.
 *
 * The stage write and the activity row are a single D1 batch, so the timeline
 * can never claim a transition that did not land — the failure mode of two
 * separate writes is an audit trail that lies.
 *
 * Returns `{ moved: false, reason }` rather than throwing when the transition
 * is refused, because most callers are background jobs for which "already
 * terminal" is an ordinary outcome, not an error. Routes that need it to be an
 * error check `moved`.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} leadId
 * @param {string} toStage
 * @param {{ actor?: string, actorEmail?: string|null, summary?: string,
 *           metadata?: unknown, eventType?: string, correlationId?: string|null,
 *           allowComplianceOverride?: boolean, dedupeKey?: string|null }} [options]
 * @returns {Promise<{ moved: boolean, reason?: string, from?: string, to?: string }>}
 */
export async function transitionLead(db, leadId, toStage, options = {}) {
  const lead = await db.prepare('SELECT id, campaign_id, stage FROM lead_leads WHERE id = ?').bind(leadId).first()
  if (!lead) throw operationError('Lead not found.', 404)

  const check = canTransition(lead.stage, toStage, {
    allowComplianceOverride: options.allowComplianceOverride === true,
  })
  if (!check.allowed) return { moved: false, reason: check.reason, from: lead.stage, to: toStage }

  const now = nowIso()

  await db.batch([
    db
      .prepare(
        `UPDATE lead_leads
         SET stage = ?, stage_changed_at = ?, last_activity_at = ?, updated_at = ?
         WHERE id = ? AND stage = ?`,
      )
      .bind(toStage, now, now, now, leadId, lead.stage),
    db
      .prepare(
        `INSERT OR IGNORE INTO lead_activity
           (id, lead_id, campaign_id, event_type, actor, actor_email, summary, metadata_json,
            from_stage, to_stage, dedupe_key, correlation_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId(),
        leadId,
        lead.campaign_id,
        options.eventType || ACTIVITY.STAGE_CHANGED,
        options.actor || 'system',
        options.actorEmail ?? null,
        options.summary || `Moved from ${lead.stage} to ${toStage}`,
        JSON.stringify(options.metadata ?? {}),
        lead.stage,
        toStage,
        options.dedupeKey ?? null,
        options.correlationId ?? null,
        now,
      ),
  ])

  return { moved: true, from: lead.stage, to: toStage }
}

/**
 * Refreshes the denormalized columns the leads table sorts and filters on.
 *
 * These are a cache of the latest `lead_scores` / `lead_ai_runs` rows, which
 * remain the auditable record. Kept denormalized so the leads list does not
 * need a correlated subquery per row.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function updateLeadSummary(db, leadId, patch) {
  const assignments = []
  const bindings = []

  const columns = {
    ruleScore: 'rule_score',
    aiConfidence: 'ai_confidence',
    opportunityType: 'opportunity_type',
    nextAction: 'next_action',
    priority: 'priority',
    holdReason: 'hold_reason',
    lostReason: 'lost_reason',
  }

  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] !== undefined) {
      assignments.push(`${column} = ?`)
      bindings.push(patch[key])
    }
  }

  if (assignments.length === 0) return

  assignments.push('last_activity_at = ?', 'updated_at = ?')
  const now = nowIso()
  bindings.push(now, now, leadId)

  await db.prepare(`UPDATE lead_leads SET ${assignments.join(', ')} WHERE id = ?`).bind(...bindings).run()
}

/**
 * Recomputes and stores the human-readable next action.
 *
 * Derived from state the lead detail screen would otherwise each compute for
 * itself; centralizing it here is what stops the leads table, the detail panel
 * and the dashboard from disagreeing about what a lead needs.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function refreshNextAction(db, leadId) {
  const row = await db
    .prepare(
      `SELECT l.stage,
              (SELECT COUNT(*) FROM lead_contacts WHERE lead_id = l.id) AS contact_count,
              (SELECT state FROM lead_compliance_reviews WHERE lead_id = l.id) AS compliance_state,
              (SELECT COUNT(*) FROM lead_outreach_drafts WHERE lead_id = l.id AND status IN ('draft','edited','zoho_draft_created')) AS draft_count,
              (SELECT COUNT(*) FROM lead_outreach_drafts WHERE lead_id = l.id AND status = 'zoho_draft_created') AS zoho_count,
              (SELECT COUNT(*) FROM lead_messages m
                 WHERE m.lead_id = l.id AND m.direction = 'inbound'
                   AND m.created_at > COALESCE((SELECT MAX(created_at) FROM lead_messages o
                                                 WHERE o.lead_id = l.id AND o.direction = 'outbound'), '')) AS unanswered_inbound
       FROM lead_leads l WHERE l.id = ?`,
    )
    .bind(leadId)
    .first()

  if (!row) return null

  const nextAction = describeNextAction({
    stage: row.stage,
    hasContact: Number(row.contact_count) > 0,
    complianceState: row.compliance_state,
    hasDraft: Number(row.draft_count) > 0,
    zohoDraftCreated: Number(row.zoho_count) > 0,
    hasUnansweredReply: Number(row.unanswered_inbound) > 0,
  })

  await db
    .prepare('UPDATE lead_leads SET next_action = ?, updated_at = ? WHERE id = ?')
    .bind(nextAction, nowIso(), leadId)
    .run()

  return nextAction
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ campaignId?, stage?, stages?, countryCode?, industry?, metro?, priority?,
 *           minScore?, maxScore?, aiStatus?, contactability?, complianceState?,
 *           search?, since?, discoveredAfter?, limit?, offset?, sort? }} [filters]
 */
export async function listLeads(db, filters = {}) {
  const conditions = [
    ['l.campaign_id = ?', filters.campaignId ?? null],
    ['l.stage = ?', filters.stage ?? null],
    ['c.country_code = ?', filters.countryCode ?? null],
    ['c.industry = ?', filters.industry ?? null],
    ['c.metro = ?', filters.metro ?? null],
    ['l.priority = ?', filters.priority ?? null],
    ['l.rule_score >= ?', Number.isFinite(filters.minScore) ? filters.minScore : null],
    ['l.rule_score <= ?', Number.isFinite(filters.maxScore) ? filters.maxScore : null],
    ['l.last_activity_at >= ?', filters.since ?? null],
    ['l.created_at >= ?', filters.discoveredAfter ?? null],
  ]

  const { clause, bindings } = buildWhere(conditions)
  const extra = []
  const extraBindings = []

  // A multi-stage filter (the review queue asks for several at once) cannot go
  // through buildWhere's single-value shape, so it is appended explicitly with
  // one placeholder per stage — never interpolated.
  if (Array.isArray(filters.stages) && filters.stages.length > 0) {
    extra.push(`l.stage IN (${filters.stages.map(() => '?').join(', ')})`)
    extraBindings.push(...filters.stages)
  }

  if (filters.search) {
    extra.push('(c.name LIKE ? OR c.canonical_domain LIKE ?)')
    const pattern = `%${String(filters.search).slice(0, 120)}%`
    extraBindings.push(pattern, pattern)
  }

  if (filters.aiStatus === 'qualified') extra.push('l.ai_confidence IS NOT NULL AND l.opportunity_type IS NOT NULL')
  else if (filters.aiStatus === 'pending') extra.push('l.ai_confidence IS NULL')

  if (filters.contactability === 'contactable') {
    extra.push('EXISTS (SELECT 1 FROM lead_contacts WHERE lead_id = l.id)')
  } else if (filters.contactability === 'no_contact') {
    extra.push('NOT EXISTS (SELECT 1 FROM lead_contacts WHERE lead_id = l.id)')
  }

  if (filters.complianceState) {
    extra.push('EXISTS (SELECT 1 FROM lead_compliance_reviews r WHERE r.lead_id = l.id AND r.state = ?)')
    extraBindings.push(filters.complianceState)
  }

  const where = [clause.replace(/^WHERE /, ''), ...extra].filter(Boolean)
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // An allow-list, not caller-supplied SQL. `sort` reaches this from a query
  // string, so anything not listed falls back to the default rather than being
  // concatenated into the statement.
  const SORTS = {
    recent: 'l.last_activity_at DESC',
    score: 'l.rule_score DESC, l.last_activity_at DESC',
    confidence: 'l.ai_confidence DESC, l.rule_score DESC',
    created: 'l.created_at DESC',
    company: 'c.name ASC',
  }
  const orderBy = SORTS[filters.sort] || SORTS.recent

  const limit = clampLimit(filters.limit, 50, 200)
  const offset = clampOffset(filters.offset)

  const [rows, total] = await Promise.all([
    db
      .prepare(`${LEAD_SELECT} ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...bindings, ...extraBindings, limit, offset)
      .all(),
    db
      .prepare(
        `SELECT COUNT(*) AS total FROM lead_leads l
         JOIN lead_companies c ON c.id = l.company_id
         JOIN lead_campaigns cam ON cam.id = l.campaign_id
         ${whereClause}`,
      )
      .bind(...bindings, ...extraBindings)
      .first(),
  ])

  return {
    leads: (rows.results || []).map(mapRow),
    total: Number(total?.total || 0),
    limit,
    offset,
  }
}

/**
 * Pipeline counts for the dashboard funnel.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string|null} [campaignId]
 */
export async function countLeadsByStage(db, campaignId = null) {
  const { clause, bindings } = buildWhere([['campaign_id = ?', campaignId]])
  const result = await db
    .prepare(`SELECT stage, COUNT(*) AS total FROM lead_leads ${clause} GROUP BY stage`)
    .bind(...bindings)
    .all()

  return Object.fromEntries((result.results || []).map((row) => [row.stage, Number(row.total)]))
}

/**
 * Leads ready for a given piece of background work.
 *
 * Used by the job dispatcher to find work without scanning the whole table.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} stage
 * @param {{ campaignId?: string|null, limit?: number }} [options]
 */
export async function listLeadsInStage(db, stage, { campaignId = null, limit = 25 } = {}) {
  const { clause, bindings } = buildWhere([
    ['l.stage = ?', stage],
    ['l.campaign_id = ?', campaignId],
  ])

  const result = await db
    .prepare(`${LEAD_SELECT} ${clause} ORDER BY l.rule_score DESC NULLS LAST, l.created_at ASC LIMIT ?`)
    .bind(...bindings, clampLimit(limit, 25, 200))
    .all()

  return (result.results || []).map(mapRow)
}
