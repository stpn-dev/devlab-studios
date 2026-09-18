/**
 * Crawl runs and the deterministic signals extracted from them.
 *
 * Crawl runs are append-only: a failed crawl and its later successful retry
 * both survive, so "this site blocks us" stays distinguishable from "we never
 * tried". Signals are the opposite — a re-crawl REPLACES a lead's signals
 * wholesale, because a stale signal that the site no longer supports would
 * keep scoring forever.
 */

import { EXTRACTOR_VERSION } from '../config/defaults.js'
import { bounded, newId, nowIso, parseJsonField, toInt } from './helpers.js'

const MAX_EVIDENCE = 240
const MAX_ERROR = 500

function mapRun(row) {
  if (!row) return null
  return {
    id: row.id,
    leadId: row.lead_id,
    companyId: row.company_id,
    status: row.status,
    method: row.method,
    pagesAttempted: Number(row.pages_attempted),
    pagesFetched: Number(row.pages_fetched),
    bytesFetched: Number(row.bytes_fetched),
    robotsAllowed: row.robots_allowed === null ? null : row.robots_allowed === 1,
    skipReason: row.skip_reason,
    errorMessage: row.error_message,
    pages: parseJsonField(row.pages_json, []),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function startCrawlRun(db, { leadId, companyId, method = 'fetch' }) {
  const id = newId()
  const now = nowIso()
  await db
    .prepare(
      `INSERT INTO lead_crawl_runs (id, lead_id, company_id, status, method, started_at, created_at)
       VALUES (?, ?, ?, 'running', ?, ?, ?)`,
    )
    .bind(id, leadId, companyId, method, now, now)
    .run()
  return id
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} runId
 * @param {{ status: 'completed'|'failed'|'skipped', pagesAttempted?, pagesFetched?, bytesFetched?,
 *           robotsAllowed?, skipReason?, errorMessage?, pages?, method? }} outcome
 */
export async function finishCrawlRun(db, runId, outcome) {
  await db
    .prepare(
      `UPDATE lead_crawl_runs
       SET status = ?, method = COALESCE(?, method), pages_attempted = ?, pages_fetched = ?,
           bytes_fetched = ?, robots_allowed = ?, skip_reason = ?, error_message = ?,
           pages_json = ?, finished_at = ?
       WHERE id = ?`,
    )
    .bind(
      outcome.status,
      outcome.method ?? null,
      outcome.pagesAttempted ?? 0,
      outcome.pagesFetched ?? 0,
      outcome.bytesFetched ?? 0,
      outcome.robotsAllowed === undefined || outcome.robotsAllowed === null ? null : toInt(outcome.robotsAllowed),
      outcome.skipReason ? bounded(outcome.skipReason, MAX_ERROR) : null,
      outcome.errorMessage ? bounded(outcome.errorMessage, MAX_ERROR) : null,
      // Per-page outcomes only: url, status, content type, bytes, whether used.
      // Never page bodies — see docs/lead-engine/crawler.md on data minimization.
      JSON.stringify(outcome.pages ?? []),
      nowIso(),
      runId,
    )
    .run()
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getLatestCrawlRun(db, leadId) {
  const row = await db
    .prepare('SELECT * FROM lead_crawl_runs WHERE lead_id = ? ORDER BY started_at DESC LIMIT 1')
    .bind(leadId)
    .first()
  return mapRun(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listCrawlRuns(db, leadId, limit = 10) {
  const result = await db
    .prepare('SELECT * FROM lead_crawl_runs WHERE lead_id = ? ORDER BY started_at DESC LIMIT ?')
    .bind(leadId, limit)
    .all()
  return (result.results || []).map(mapRun)
}

/**
 * Crawl runs that failed, for the dashboard's "failed research jobs" card.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function listFailedCrawlRuns(db, { since, limit = 25 }) {
  const result = await db
    .prepare(
      `SELECT r.*, c.name AS company_name, c.canonical_domain
       FROM lead_crawl_runs r
       JOIN lead_companies c ON c.id = r.company_id
       WHERE r.status = 'failed' AND r.started_at >= ?
       ORDER BY r.started_at DESC LIMIT ?`,
    )
    .bind(since, limit)
    .all()

  return (result.results || []).map((row) => ({
    ...mapRun(row),
    companyName: row.company_name,
    canonicalDomain: row.canonical_domain,
  }))
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

function mapSignal(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    crawlRunId: row.crawl_run_id,
    category: row.category,
    signalKey: row.signal_key,
    valueText: row.value_text,
    detected: row.detected === 1,
    confidence: row.confidence,
    sourceUrl: row.source_url,
    evidence: row.evidence,
    extractorVersion: Number(row.extractor_version),
    createdAt: row.created_at,
  }
}

/**
 * Replaces a lead's signals with a freshly extracted set.
 *
 * Delete-then-insert in ONE D1 batch. Two separate statements would leave a
 * window in which the lead has no signals at all — and a scoring job that ran
 * in that window would produce a zero and route an otherwise good lead to
 * NOT_QUALIFIED. The batch makes the swap atomic.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} leadId
 * @param {Array<{ category, signalKey, valueText?, detected?, confidence?, sourceUrl?, evidence? }>} signals
 * @param {string|null} crawlRunId
 */
export async function replaceSignals(db, leadId, signals, crawlRunId = null) {
  const now = nowIso()

  // Deduplicate in memory first: the unique index is (lead_id, category,
  // signal_key), and two extractors legitimately producing the same key inside
  // one run would otherwise fail the whole batch. Last writer wins, which is
  // the more specific extractor by construction — they run in priority order.
  const unique = new Map()
  for (const signal of signals) {
    unique.set(`${signal.category}:${signal.signalKey}`, signal)
  }

  const statements = [db.prepare('DELETE FROM lead_signals WHERE lead_id = ?').bind(leadId)]

  for (const signal of unique.values()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO lead_signals
             (id, lead_id, crawl_run_id, category, signal_key, value_text, detected,
              confidence, source_url, evidence, extractor_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(), leadId, crawlRunId, signal.category, signal.signalKey,
          signal.valueText ? bounded(signal.valueText, 500) : null,
          toInt(signal.detected !== false),
          Number.isFinite(signal.confidence) ? Math.max(0, Math.min(1, signal.confidence)) : 1,
          signal.sourceUrl ?? null,
          signal.evidence ? bounded(signal.evidence, MAX_EVIDENCE) : null,
          EXTRACTOR_VERSION, now,
        ),
    )
  }

  await db.batch(statements)
  return unique.size
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listSignals(db, leadId) {
  const result = await db
    .prepare('SELECT * FROM lead_signals WHERE lead_id = ? ORDER BY category, signal_key')
    .bind(leadId)
    .all()
  return (result.results || []).map(mapSignal)
}

/**
 * The detected signal keys as a Set, which is the shape the scoring engine
 * wants. Kept here rather than derived at each call site so scoring cannot
 * accidentally count an undetected signal.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function getDetectedSignalKeys(db, leadId) {
  const result = await db
    .prepare('SELECT signal_key FROM lead_signals WHERE lead_id = ? AND detected = 1')
    .bind(leadId)
    .all()
  return new Set((result.results || []).map((row) => row.signal_key))
}
