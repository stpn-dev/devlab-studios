/**
 * Shared repository helpers for the Lead Intelligence Engine.
 *
 * Every repository in this directory follows the same conventions as the
 * existing CMS repositories (src/worker/repositories/): plain JavaScript with
 * JSDoc, a `D1Database` as the first argument, snake_case columns mapped to
 * camelCase in the returned objects, and parameters always bound rather than
 * interpolated.
 */

export { nowIso, parseJsonField } from '../../worker/utils/responses.js'

/** @returns {string} */
export function newId() {
  return crypto.randomUUID()
}

/** SQLite has no boolean type; these two keep the 0/1 conversion in one place. */
export function toInt(value) {
  return value ? 1 : 0
}

export function fromInt(value) {
  return value === 1 || value === true
}

/**
 * `YYYY-MM-DD` in UTC, the key format for `lead_usage_daily.usage_date`.
 *
 * UTC rather than local time on purpose: the Worker has no meaningful local
 * time zone, and a budget that rolls over at a different moment depending on
 * which colo served the request is not a budget.
 *
 * @param {Date} [date]
 */
export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/** `YYYY-MM`, for the monthly discovery ceiling. */
export function utcMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

/**
 * Builds a `WHERE` clause and its bindings from a list of optional conditions.
 *
 * Each entry is `[sqlFragment, value]`; an entry whose value is `null` or
 * `undefined` is dropped. Callers therefore express "filter by campaign if one
 * was requested" declaratively instead of push()-ing into two parallel arrays
 * and risking them falling out of step — which is the specific bug that
 * produces a query binding the right number of parameters to the wrong
 * placeholders.
 *
 * @param {Array<[string, unknown]>} conditions
 * @returns {{ clause: string, bindings: unknown[] }}
 */
export function buildWhere(conditions) {
  const active = conditions.filter(([, value]) => value !== null && value !== undefined)
  if (active.length === 0) return { clause: '', bindings: [] }

  return {
    clause: `WHERE ${active.map(([fragment]) => fragment).join(' AND ')}`,
    bindings: active.map(([, value]) => value),
  }
}

/**
 * Clamps a caller-supplied limit.
 *
 * SQLite treats a NEGATIVE limit as "no limit", so an unclamped value is not
 * merely wrong but unbounded. An absent parameter must still reach the default
 * rather than being coerced to 0 — see the note in
 * src/pages/api/admin/leads/index.ts, where exactly that happened.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} max
 */
export function clampLimit(value, fallback = 50, max = 500) {
  const parsed = value === null || value === undefined || value === '' ? NaN : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

/** @param {unknown} value */
export function clampOffset(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

/**
 * Runs a D1 batch, skipping the round trip entirely when there is nothing to do.
 *
 * `db.batch([])` is not universally safe across D1 versions and is never
 * useful, and several call sites here legitimately produce an empty statement
 * list (a crawl that extracted no signals, a lead with no contacts).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {unknown[]} statements
 */
export async function runBatch(db, statements) {
  if (!statements || statements.length === 0) return
  await db.batch(statements)
}

/**
 * Bounds a string before it is written.
 *
 * Applied to every field that originates outside this system — page excerpts,
 * model output, message bodies, upstream error text. Without it a single
 * pathological upstream response can write megabytes into a row that the admin
 * then has to render.
 *
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string}
 */
export function bounded(value, maxLength) {
  const text = String(value ?? '')
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

/**
 * Normalizes a repository-level failure into an error carrying an HTTP status,
 * which `adminErrorResponse` (src/lib/http.ts) already knows how to render.
 *
 * @param {string} message
 * @param {number} status
 */
export function operationError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}
