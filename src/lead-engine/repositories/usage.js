/**
 * Usage guardrails.
 *
 * The rule this module exists to enforce: a budget is checked and consumed in
 * ONE atomic statement, before the work happens. A read-then-write ("are we
 * under the limit? then do the thing, then increment") has a window in which
 * two concurrent jobs both see room for the last unit, and the daily AI budget
 * quietly becomes the daily AI budget plus however many Workers were running.
 *
 * `consumeBudget` below is a single conditional UPDATE. If it changes a row,
 * the caller owns that unit of budget; if it does not, the budget is spent.
 */

import { USAGE_LIMITS, MONTHLY_DISCOVERY_LIMIT } from '../config/defaults.js'
import { newId, nowIso, utcDateKey, utcMonthKey } from './helpers.js'

/**
 * Ensures the counter row for today exists, recording the limit that was in
 * force when it was created.
 *
 * The limit is copied onto the row rather than read live at check time, so the
 * ledger records the budget that actually applied — raising a limit mid-day
 * does not retroactively change what yesterday's runs were allowed.
 */
async function ensureCounter(db, { metric, campaignId, limitValue, date }) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO lead_usage_daily
         (id, usage_date, metric, campaign_id, used, limit_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .bind(newId(), date, metric, campaignId, limitValue, nowIso(), nowIso())
    .run()
}

/**
 * Atomically reserves `amount` units of a budget.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} metric
 * @param {{ amount?: number, campaignId?: string|null, limits?: object, date?: string }} [options]
 * @returns {Promise<{ allowed: boolean, used: number, limit: number, remaining: number }>}
 */
export async function consumeBudget(db, metric, options = {}) {
  const amount = Number.isFinite(options.amount) && options.amount > 0 ? Math.floor(options.amount) : 1
  const campaignId = options.campaignId ?? null
  const date = options.date || utcDateKey()
  const limits = options.limits || USAGE_LIMITS
  const limit = Number.isFinite(limits[metric]) ? limits[metric] : USAGE_LIMITS[metric]

  // No configured limit means no limit. Recorded anyway, so consumption is
  // still visible on the usage screen.
  if (!Number.isFinite(limit)) {
    await ensureCounter(db, { metric, campaignId, limitValue: null, date })
    await db
      .prepare(
        `UPDATE lead_usage_daily SET used = used + ?, updated_at = ?
         WHERE usage_date = ? AND metric = ? AND COALESCE(campaign_id, '') = COALESCE(?, '')`,
      )
      .bind(amount, nowIso(), date, metric, campaignId)
      .run()
    return { allowed: true, used: 0, limit: Infinity, remaining: Infinity }
  }

  await ensureCounter(db, { metric, campaignId, limitValue: limit, date })

  // The whole guarantee is in this WHERE clause. Two concurrent callers both
  // reach it; SQLite serializes them, and the second sees the first's write.
  const result = await db
    .prepare(
      `UPDATE lead_usage_daily
       SET used = used + ?, updated_at = ?
       WHERE usage_date = ? AND metric = ? AND COALESCE(campaign_id, '') = COALESCE(?, '')
         AND used + ? <= ?`,
    )
    .bind(amount, nowIso(), date, metric, campaignId, amount, limit)
    .run()

  const changed = Number(result.meta?.changes ?? result.meta?.rows_written ?? 0) > 0

  const current = await db
    .prepare(
      `SELECT used, limit_value FROM lead_usage_daily
       WHERE usage_date = ? AND metric = ? AND COALESCE(campaign_id, '') = COALESCE(?, '')`,
    )
    .bind(date, metric, campaignId)
    .first()

  const used = Number(current?.used || 0)

  if (!changed) {
    // Stamp the first moment the limit bit, for the admin warning. Only the
    // first time — the `IS NULL` guard keeps it as "when did we run out" rather
    // than "when did we last try".
    await db
      .prepare(
        `UPDATE lead_usage_daily SET limit_reached_at = ?
         WHERE usage_date = ? AND metric = ? AND COALESCE(campaign_id, '') = COALESCE(?, '')
           AND limit_reached_at IS NULL`,
      )
      .bind(nowIso(), date, metric, campaignId)
      .run()
  }

  return { allowed: changed, used, limit, remaining: Math.max(0, limit - used) }
}

/**
 * Returns a reserved unit of budget.
 *
 * Used when work was reserved and then not done — a crawl that was skipped
 * because robots.txt disallowed it should not count against the day's page
 * budget. Clamped at zero so a double-release cannot manufacture budget.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function releaseBudget(db, metric, { amount = 1, campaignId = null, date = utcDateKey() } = {}) {
  await db
    .prepare(
      `UPDATE lead_usage_daily
       SET used = MAX(0, used - ?), updated_at = ?
       WHERE usage_date = ? AND metric = ? AND COALESCE(campaign_id, '') = COALESCE(?, '')`,
    )
    .bind(amount, nowIso(), date, metric, campaignId)
    .run()
}

/**
 * Read-only check, for UI and for deciding whether to enqueue work at all.
 *
 * Never used INSTEAD of `consumeBudget` before doing the work — that is the
 * race this module exists to avoid.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function getUsage(db, { date = utcDateKey(), campaignId = null } = {}) {
  const result = await db
    .prepare(
      `SELECT metric, used, limit_value, limit_reached_at FROM lead_usage_daily
       WHERE usage_date = ? AND COALESCE(campaign_id, '') = COALESCE(?, '')`,
    )
    .bind(date, campaignId)
    .all()

  const rows = Object.fromEntries(
    (result.results || []).map((row) => [
      row.metric,
      {
        used: Number(row.used),
        limit: row.limit_value === null ? null : Number(row.limit_value),
        limitReachedAt: row.limit_reached_at,
      },
    ]),
  )

  // Every known metric appears, whether or not it has a row yet, so the usage
  // screen shows "0 of 60" rather than omitting untouched budgets.
  return Object.fromEntries(
    Object.entries(USAGE_LIMITS).map(([metric, limit]) => [
      metric,
      rows[metric] || { used: 0, limit, limitReachedAt: null },
    ]),
  )
}

/**
 * The monthly discovery ceiling, checked alongside the daily one.
 *
 * Aggregated across the month's daily rows rather than kept as its own counter:
 * one counter that can drift from the daily rows it is supposed to summarize is
 * worse than a sum over thirty indexed rows.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function checkMonthlyDiscoveryBudget(db, { limit = MONTHLY_DISCOVERY_LIMIT } = {}) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(used), 0) AS used FROM lead_usage_daily
       WHERE metric = 'discovery_candidates' AND usage_date LIKE ? AND campaign_id IS NULL`,
    )
    .bind(`${utcMonthKey()}%`)
    .first()

  const used = Number(row?.used || 0)
  return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used) }
}

/**
 * Usage over a window, for the dashboard chart.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function listUsageHistory(db, { days = 14 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const result = await db
    .prepare(
      `SELECT usage_date, metric, SUM(used) AS used FROM lead_usage_daily
       WHERE usage_date >= ? GROUP BY usage_date, metric ORDER BY usage_date DESC`,
    )
    .bind(since)
    .all()

  return (result.results || []).map((row) => ({
    date: row.usage_date,
    metric: row.metric,
    used: Number(row.used),
  }))
}
