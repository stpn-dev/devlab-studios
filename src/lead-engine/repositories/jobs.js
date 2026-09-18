/**
 * The durable job ledger.
 *
 * This is why the engine runs correctly with NO Cloudflare Queues or Workflows
 * bindings configured. Queues and Workflows are the preferred substrate and the
 * code supports them, but a queue binding naming a queue that does not exist
 * fails the entire Worker deploy — including the public site. So dispatch goes
 * through this table: when the bindings are present the dispatcher hands work
 * to them, and when they are absent the same work is drained by cron. Either
 * way D1 holds the authoritative record of what is outstanding, which is what
 * makes a half-finished run resumable rather than lost.
 *
 * Leasing rather than deleting-on-claim: a Worker that dies mid-job leaves an
 * expired lease, and the next runner reclaims it. Deleting on claim would lose
 * the job entirely in that case.
 */

import { JOBS } from '../config/defaults.js'
import { bounded, buildWhere, clampLimit, newId, nowIso, parseJsonField } from './helpers.js'

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    campaignId: row.campaign_id,
    leadId: row.lead_id,
    payload: parseJsonField(row.payload_json, {}),
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAfter: row.run_after,
    leasedUntil: row.leased_until,
    lastError: row.last_error,
    deadLetteredAt: row.dead_lettered_at,
    dedupeKey: row.dedupe_key,
    correlationId: row.correlation_id,
    workflowInstanceId: row.workflow_instance_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyName: row.company_name ?? null,
  }
}

/**
 * Enqueues a job.
 *
 * Idempotent through `dedupeKey`, which has a partial unique index covering
 * only pending and running rows. Enqueueing the same logical job while one is
 * outstanding is a no-op; enqueueing it again after the first SUCCEEDED is
 * allowed, because re-crawling a lead next week is legitimate work and not a
 * duplicate.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ jobType, campaignId?, leadId?, payload?, priority?, dedupeKey?,
 *           correlationId?, maxAttempts?, delaySeconds? }} input
 * @returns {Promise<{ job: object|null, created: boolean }>}
 */
export async function enqueueJob(db, input) {
  const id = newId()
  const now = nowIso()
  const runAfter = input.delaySeconds
    ? new Date(Date.now() + input.delaySeconds * 1000).toISOString()
    : now

  const payload = JSON.stringify(input.payload ?? {})
  // IDs and small scalars only. A job carrying an HTML document would make this
  // table the crawler's cache, which it is emphatically not.
  if (payload.length > 4_000) {
    throw Object.assign(new Error('Job payloads carry references, not documents.'), { status: 500 })
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO lead_jobs
         (id, job_type, status, campaign_id, lead_id, payload_json, priority, attempts,
          max_attempts, run_after, dedupe_key, correlation_id, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, input.jobType, input.campaignId ?? null, input.leadId ?? null, payload,
      input.priority ?? 0, input.maxAttempts ?? JOBS.maxAttempts, runAfter,
      input.dedupeKey ?? null, input.correlationId ?? null, now, now,
    )
    .run()

  const stored = await db.prepare('SELECT * FROM lead_jobs WHERE id = ?').bind(id).first()
  return { job: mapRow(stored), created: Boolean(stored) }
}

/**
 * Claims up to `limit` runnable jobs.
 *
 * Claimed one at a time by id with a conditional UPDATE, rather than
 * `UPDATE ... LIMIT` over the selection: SQLite's UPDATE has no LIMIT without a
 * compile option, and more importantly the per-row condition
 * (`status = 'pending' OR lease expired`) is what makes two concurrent runners
 * safe. A runner that loses the race for a row simply gets fewer jobs.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ jobTypes?: string[], limit?: number, leaseSeconds?: number }} [options]
 */
export async function claimJobs(db, { jobTypes = null, limit = JOBS.batchSize, leaseSeconds = JOBS.leaseSeconds } = {}) {
  const now = nowIso()
  const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString()

  const typeClause = jobTypes && jobTypes.length ? `AND job_type IN (${jobTypes.map(() => '?').join(', ')})` : ''
  const typeBindings = jobTypes && jobTypes.length ? jobTypes : []

  const candidates = await db
    .prepare(
      `SELECT id FROM lead_jobs
       WHERE run_after <= ?
         AND (status = 'pending' OR (status = 'running' AND leased_until IS NOT NULL AND leased_until < ?))
         ${typeClause}
       ORDER BY priority DESC, run_after ASC
       LIMIT ?`,
    )
    .bind(now, now, ...typeBindings, clampLimit(limit, JOBS.batchSize, 50))
    .all()

  const claimed = []
  for (const candidate of candidates.results || []) {
    const result = await db
      .prepare(
        `UPDATE lead_jobs
         SET status = 'running', attempts = attempts + 1, leased_until = ?, updated_at = ?
         WHERE id = ?
           AND (status = 'pending' OR (status = 'running' AND leased_until IS NOT NULL AND leased_until < ?))`,
      )
      .bind(leaseUntil, now, candidate.id, now)
      .run()

    if (Number(result.meta?.changes ?? 0) > 0) {
      const row = await db.prepare('SELECT * FROM lead_jobs WHERE id = ?').bind(candidate.id).first()
      claimed.push(mapRow(row))
    }
  }

  return claimed
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function completeJob(db, id) {
  await db
    .prepare("UPDATE lead_jobs SET status = 'succeeded', leased_until = NULL, last_error = NULL, updated_at = ? WHERE id = ?")
    .bind(nowIso(), id)
    .run()
}

/**
 * Records a failure and decides whether to retry.
 *
 * `retryable: false` sends a job straight to the dead-letter state without
 * burning its remaining attempts — a robots.txt disallow or an invalid domain
 * will not resolve itself, and retrying it twice more just wastes budget and
 * hits someone's server again.
 *
 * Backoff is exponential and capped, so a Zoho outage produces a handful of
 * spaced retries rather than a tight loop.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} id
 * @param {{ error: string, retryable?: boolean }} outcome
 * @returns {Promise<{ status: 'pending'|'dead', nextRunAt?: string }>}
 */
export async function failJob(db, id, { error, retryable = true }) {
  const job = await db.prepare('SELECT * FROM lead_jobs WHERE id = ?').bind(id).first()
  if (!job) return { status: 'dead' }

  const attempts = Number(job.attempts)
  const maxAttempts = Number(job.max_attempts)
  const now = nowIso()
  const message = bounded(error, 500)

  if (!retryable || attempts >= maxAttempts) {
    await db
      .prepare(
        `UPDATE lead_jobs SET status = 'dead', leased_until = NULL, last_error = ?,
           dead_lettered_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(message, now, now, id)
      .run()
    return { status: 'dead' }
  }

  const delaySeconds = Math.min(JOBS.backoffBaseSeconds * 2 ** (attempts - 1), JOBS.backoffMaxSeconds)
  const nextRunAt = new Date(Date.now() + delaySeconds * 1000).toISOString()

  await db
    .prepare(
      `UPDATE lead_jobs SET status = 'pending', leased_until = NULL, last_error = ?,
         run_after = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(message, nextRunAt, now, id)
    .run()

  return { status: 'pending', nextRunAt }
}

/**
 * Returns a dead-lettered job to the queue. The admin's retry button.
 *
 * Attempts are reset, because a human deciding to retry is new information —
 * usually that whatever was broken has been fixed.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function retryJob(db, id) {
  const now = nowIso()
  await db
    .prepare(
      `UPDATE lead_jobs
       SET status = 'pending', attempts = 0, run_after = ?, leased_until = NULL,
           dead_lettered_at = NULL, updated_at = ?
       WHERE id = ? AND status IN ('dead', 'failed', 'cancelled')`,
    )
    .bind(now, now, id)
    .run()

  const row = await db.prepare('SELECT * FROM lead_jobs WHERE id = ?').bind(id).first()
  return mapRow(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function cancelJob(db, id) {
  await db
    .prepare("UPDATE lead_jobs SET status = 'cancelled', leased_until = NULL, updated_at = ? WHERE id = ? AND status IN ('pending', 'running')")
    .bind(nowIso(), id)
    .run()
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getJob(db, id) {
  const row = await db.prepare('SELECT * FROM lead_jobs WHERE id = ?').bind(id).first()
  return mapRow(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listJobs(db, filters = {}) {
  const { clause, bindings } = buildWhere([
    ['j.status = ?', filters.status ?? null],
    ['j.job_type = ?', filters.jobType ?? null],
    ['j.campaign_id = ?', filters.campaignId ?? null],
    ['j.lead_id = ?', filters.leadId ?? null],
  ])

  const result = await db
    .prepare(
      `SELECT j.*, c.name AS company_name
       FROM lead_jobs j
       LEFT JOIN lead_leads l ON l.id = j.lead_id
       LEFT JOIN lead_companies c ON c.id = l.company_id
       ${clause}
       ORDER BY j.created_at DESC LIMIT ?`,
    )
    .bind(...bindings, clampLimit(filters.limit, 50, 200))
    .all()

  return (result.results || []).map(mapRow)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function countJobsByStatus(db) {
  const result = await db.prepare('SELECT status, COUNT(*) AS total FROM lead_jobs GROUP BY status').all()
  return Object.fromEntries((result.results || []).map((row) => [row.status, Number(row.total)]))
}

/**
 * Housekeeping: drops succeeded jobs older than the retention window.
 *
 * Dead-lettered jobs are NEVER swept — they are the record of what failed and
 * the thing an operator retries.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function pruneCompletedJobs(db, { olderThanDays = 14 } = {}) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
  const result = await db
    .prepare("DELETE FROM lead_jobs WHERE status = 'succeeded' AND updated_at < ?")
    .bind(cutoff)
    .run()
  return Number(result.meta?.changes ?? 0)
}

/**
 * Reclaims jobs whose lease expired while still marked running.
 *
 * Belt and braces: `claimJobs` already treats an expired lease as claimable, so
 * this is only needed to make stuck jobs VISIBLE as pending on the admin
 * screen rather than sitting in a running state nobody is working on.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function reclaimStaleJobs(db) {
  const now = nowIso()
  const result = await db
    .prepare(
      `UPDATE lead_jobs SET status = 'pending', leased_until = NULL, updated_at = ?
       WHERE status = 'running' AND leased_until IS NOT NULL AND leased_until < ?`,
    )
    .bind(now, now)
    .run()
  return Number(result.meta?.changes ?? 0)
}
