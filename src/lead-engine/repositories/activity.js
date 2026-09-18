/**
 * The append-only activity timeline.
 *
 * Nothing in this file updates or deletes. That is the point: the lead detail
 * timeline is trustworthy precisely because it is a record of what happened
 * rather than a projection that can drift from it.
 */

import { ACTIVITY_LABELS, isValidActivityType } from '../domain/activity.js'
import { bounded, buildWhere, clampLimit, clampOffset, newId, nowIso, operationError, parseJsonField } from './helpers.js'

const MAX_SUMMARY = 500
const MAX_METADATA = 4_000

/**
 * Records one event.
 *
 * `dedupeKey` makes the write idempotent: a duplicate queue delivery
 * re-recording CRAWL_COMPLETED for the same crawl run is silently ignored
 * rather than producing two timeline entries. Implemented with
 * `INSERT OR IGNORE` against the partial unique index on `dedupe_key`, so the
 * de-duplication happens in the database and not in a read-then-write race.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{
 *   leadId?: string|null, campaignId?: string|null, conversationId?: string|null,
 *   eventType: string, actor?: string, actorEmail?: string|null,
 *   summary?: string, metadata?: unknown,
 *   fromStage?: string|null, toStage?: string|null,
 *   dedupeKey?: string|null, correlationId?: string|null
 * }} event
 */
export async function recordActivity(db, event) {
  if (!isValidActivityType(event.eventType)) {
    // Thrown rather than tolerated: an unrecognized event type means a caller
    // typo, and a timeline containing 'CRAWL_COMPLETD' is worse than a loud
    // failure because nothing will ever query for it.
    throw operationError(`Unknown activity event type: ${event.eventType}`, 500)
  }

  const id = newId()
  await db
    .prepare(
      `INSERT OR IGNORE INTO lead_activity
         (id, lead_id, campaign_id, conversation_id, event_type, actor, actor_email,
          summary, metadata_json, from_stage, to_stage, dedupe_key, correlation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      event.leadId ?? null,
      event.campaignId ?? null,
      event.conversationId ?? null,
      event.eventType,
      event.actor || 'system',
      event.actorEmail ?? null,
      bounded(event.summary ?? ACTIVITY_LABELS[event.eventType] ?? event.eventType, MAX_SUMMARY),
      bounded(JSON.stringify(event.metadata ?? {}), MAX_METADATA),
      event.fromStage ?? null,
      event.toStage ?? null,
      event.dedupeKey ?? null,
      event.correlationId ?? null,
      nowIso(),
    )
    .run()

  return id
}

/**
 * Records several events in one round trip.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Array<Parameters<typeof recordActivity>[1]>} events
 */
export async function recordActivityBatch(db, events) {
  const usable = events.filter((event) => isValidActivityType(event.eventType))
  if (usable.length === 0) return

  const now = nowIso()
  const statements = usable.map((event) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO lead_activity
           (id, lead_id, campaign_id, conversation_id, event_type, actor, actor_email,
            summary, metadata_json, from_stage, to_stage, dedupe_key, correlation_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId(),
        event.leadId ?? null,
        event.campaignId ?? null,
        event.conversationId ?? null,
        event.eventType,
        event.actor || 'system',
        event.actorEmail ?? null,
        bounded(event.summary ?? ACTIVITY_LABELS[event.eventType] ?? event.eventType, MAX_SUMMARY),
        bounded(JSON.stringify(event.metadata ?? {}), MAX_METADATA),
        event.fromStage ?? null,
        event.toStage ?? null,
        event.dedupeKey ?? null,
        event.correlationId ?? null,
        now,
      ),
  )

  await db.batch(statements)
}

function mapRow(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    campaignId: row.campaign_id,
    conversationId: row.conversation_id,
    eventType: row.event_type,
    label: ACTIVITY_LABELS[row.event_type] || row.event_type,
    actor: row.actor,
    actorEmail: row.actor_email,
    summary: row.summary,
    metadata: parseJsonField(row.metadata_json, {}),
    fromStage: row.from_stage,
    toStage: row.to_stage,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    companyName: row.company_name ?? null,
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ leadId?: string|null, campaignId?: string|null, eventType?: string|null,
 *           since?: string|null, limit?: number, offset?: number }} [filters]
 */
export async function listActivity(db, filters = {}) {
  const { clause, bindings } = buildWhere([
    ['a.lead_id = ?', filters.leadId ?? null],
    ['a.campaign_id = ?', filters.campaignId ?? null],
    ['a.event_type = ?', filters.eventType ?? null],
    ['a.created_at >= ?', filters.since ?? null],
  ])

  const limit = clampLimit(filters.limit, 100, 500)
  const offset = clampOffset(filters.offset)

  const result = await db
    .prepare(
      `SELECT a.*, c.name AS company_name
       FROM lead_activity a
       LEFT JOIN lead_leads l ON l.id = a.lead_id
       LEFT JOIN lead_companies c ON c.id = l.company_id
       ${clause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, limit, offset)
    .all()

  return (result.results || []).map(mapRow)
}

/**
 * Counts by event type over a window. Feeds the dashboard's suppression-events
 * and failed-jobs cards.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} since ISO timestamp
 */
export async function countActivityByType(db, since) {
  const result = await db
    .prepare(
      `SELECT event_type, COUNT(*) AS total
       FROM lead_activity
       WHERE created_at >= ?
       GROUP BY event_type`,
    )
    .bind(since)
    .all()

  return Object.fromEntries((result.results || []).map((row) => [row.event_type, Number(row.total)]))
}
