/**
 * Runtime-editable engine settings, layered over the code defaults.
 *
 * `src/lead-engine/config/defaults.js` is the source of truth for what a
 * setting MEANS and what it defaults to; a row here overrides one value. The
 * layering direction matters: a deploy that adds a new tunable works
 * immediately with its default, and deleting a settings row restores the
 * default rather than producing `undefined`.
 *
 * Real secrets do NOT live here. Zoho's client secret, refresh token and any
 * API key are Cloudflare Worker secrets. `is_secret` on a row marks a merely
 * sensitive operational value (an account id) that the admin UI must mask.
 */

import { DEFAULT_SETTINGS } from '../config/defaults.js'
import { newId, nowIso, operationError, parseJsonField, toInt } from './helpers.js'

/**
 * Deep-merges a stored override onto a default.
 *
 * Shallow assignment would be wrong: `scoring.thresholds` is an object, and an
 * override that sets only `aiReview` must not delete `hold` and
 * `priorityAiReview`. Arrays are replaced wholesale rather than merged
 * element-wise, because an override of `allowedHosts` means "these hosts", not
 * "these hosts as well as the built-in ones".
 */
function mergeSetting(defaultValue, override) {
  if (override === undefined || override === null) return defaultValue
  if (Array.isArray(defaultValue) || Array.isArray(override)) return override
  if (typeof defaultValue !== 'object' || typeof override !== 'object') return override

  const merged = { ...defaultValue }
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeSetting(defaultValue[key], value)
  }
  return merged
}

/**
 * Every effective setting.
 *
 * Reads the whole table in one query and merges in memory. The table has one
 * row per tunable group — a dozen at most — so this is cheaper than the N
 * queries a per-key accessor would cost on a page that renders all of them.
 *
 * A database failure is NOT swallowed here: the caller decides whether to
 * degrade. `getEffectiveSettings` is used both by the Settings screen (where
 * an error should surface) and by the engine (where `resolveSettingsSafely`
 * below falls back to defaults so a D1 blip does not stop a crawl).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function getEffectiveSettings(db) {
  const result = await db.prepare('SELECT key, value_json, is_secret, updated_by, updated_at FROM lead_settings').all()

  const overrides = new Map(
    (result.results || []).map((row) => [row.key, parseJsonField(row.value_json, null)]),
  )

  const effective = {}
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    effective[key] = mergeSetting(defaultValue, overrides.get(key))
  }

  // A stored key with no default is surfaced rather than dropped, so a setting
  // left behind by a removed feature is visible instead of invisibly retained.
  for (const [key, value] of overrides) {
    if (!(key in effective)) effective[key] = value
  }

  return effective
}

/**
 * Settings for the engine's own use, with defaults as the failure mode.
 *
 * Background work must not stop because the settings table was briefly
 * unreadable — the defaults are safe values, not placeholders.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function resolveSettingsSafely(db) {
  try {
    return await getEffectiveSettings(db)
  } catch (error) {
    console.log(
      JSON.stringify({
        event: 'lead_settings_read_failed',
        error: error instanceof Error ? error.message : 'unknown',
      }),
    )
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * The metadata the Settings screen needs: which keys are overridden, by whom,
 * and which must be masked.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function listSettingMetadata(db) {
  const result = await db.prepare('SELECT key, is_secret, updated_by, updated_at FROM lead_settings').all()
  return (result.results || []).map((row) => ({
    key: row.key,
    isSecret: row.is_secret === 1,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    isOverridden: true,
  }))
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} key
 * @param {unknown} value
 */
export async function setSetting(db, key, value, options = {}) {
  const { actorEmail = null, isSecret = false } = /** @type {{ actorEmail?: string|null, isSecret?: boolean }} */ (options)
  if (!key || typeof key !== 'string') throw operationError('A setting key is required.', 422)

  const serialized = JSON.stringify(value)
  if (serialized.length > 20_000) throw operationError('Setting value is too large.', 413)

  const now = nowIso()
  await db
    .prepare(
      `INSERT INTO lead_settings (key, value_json, is_secret, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         is_secret = excluded.is_secret,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
    )
    .bind(key, serialized, toInt(isSecret), actorEmail, now)
    .run()
}

/**
 * Removes an override, restoring the code default.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function clearSetting(db, key) {
  await db.prepare('DELETE FROM lead_settings WHERE key = ?').bind(key).run()
}

/**
 * Masks values marked secret before they leave the Worker.
 *
 * Applied in the API route rather than the UI, so a value marked sensitive
 * never reaches the browser at all — a UI-only mask is visible in the network
 * tab.
 */
export function maskSecrets(settings, metadata) {
  const secretKeys = new Set(metadata.filter((entry) => entry.isSecret).map((entry) => entry.key))
  const masked = {}
  for (const [key, value] of Object.entries(settings)) {
    masked[key] = secretKeys.has(key) ? '••••••••' : value
  }
  return masked
}

/** Exported for the seed script, which writes settings before any admin exists. */
export function newSettingId() {
  return newId()
}
