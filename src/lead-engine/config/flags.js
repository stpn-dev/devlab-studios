/**
 * Feature flags for the Lead Intelligence Engine.
 *
 * Every flag defaults to OFF. A fresh deploy of this branch to either
 * environment changes nothing observable: no discovery runs, no crawling, no
 * Workers AI spend, no mailbox polling. The admin screens are reachable and
 * show an explicit "disabled" state rather than silently doing nothing.
 *
 * There is deliberately NO flag for automated sending, because there is no
 * automated sending to gate. See docs/lead-engine/architecture.md — the
 * absence of an SMTP/prospecting-provider module is the guarantee; a flag
 * would imply a switch exists.
 *
 * Flags read from `env` (Worker vars/secrets) rather than from D1: a flag is
 * how an operator stops the engine, and it must not depend on the database the
 * engine is failing against.
 */

/**
 * Worker var names, in evaluation order of specificity. LEAD_ENGINE_ENABLED is
 * the master switch — every other flag is ANDed with it, so turning one var off
 * stops the whole engine without having to remember the rest.
 */
export const FLAG_KEYS = Object.freeze({
  engine: 'LEAD_ENGINE_ENABLED',
  discovery: 'LEAD_DISCOVERY_ENABLED',
  crawler: 'LEAD_CRAWLER_ENABLED',
  browserRun: 'LEAD_BROWSER_RUN_ENABLED',
  ai: 'LEAD_AI_ENABLED',
  tracking: 'LEAD_TRACKING_ENABLED',
  zohoMail: 'ZOHO_MAIL_ENABLED',
  zohoMailSync: 'ZOHO_MAIL_SYNC_ENABLED',
  campaignSchedules: 'LEAD_CAMPAIGN_SCHEDULES_ENABLED',
})

/**
 * Truthy only for an explicit affirmative. An unset var, an empty string, and
 * the literal string "false" are all off — the last one matters because
 * Cloudflare vars are always strings, and `Boolean('false')` is `true`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isFlagOn(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes'
}

/**
 * Resolves every flag for a request.
 *
 * @param {Env} env
 * @returns {{
 *   engine: boolean, discovery: boolean, crawler: boolean, browserRun: boolean,
 *   ai: boolean, tracking: boolean, zohoMail: boolean, zohoMailSync: boolean,
 *   campaignSchedules: boolean
 * }}
 */
export function resolveFlags(env) {
  const source = env || {}
  const engine = isFlagOn(source[FLAG_KEYS.engine])

  // Every sub-flag is gated by the master switch. A deployment that sets
  // LEAD_AI_ENABLED but forgets LEAD_ENGINE_ENABLED does nothing, which is the
  // safe direction to fail in.
  const gated = (key) => engine && isFlagOn(source[key])

  return {
    engine,
    discovery: gated(FLAG_KEYS.discovery),
    crawler: gated(FLAG_KEYS.crawler),
    browserRun: gated(FLAG_KEYS.browserRun),
    ai: gated(FLAG_KEYS.ai),
    tracking: gated(FLAG_KEYS.tracking),
    zohoMail: gated(FLAG_KEYS.zohoMail),
    // Sync additionally requires the Zoho integration itself: polling a mailbox
    // we are not configured to talk to is not a meaningful state.
    zohoMailSync: gated(FLAG_KEYS.zohoMail) && gated(FLAG_KEYS.zohoMailSync),
    campaignSchedules: gated(FLAG_KEYS.campaignSchedules),
  }
}

/**
 * Thrown by a service whose flag is off, so a route answers 503 with the exact
 * var to set rather than a generic failure or — worse — a silent success.
 */
export class FeatureDisabledError extends Error {
  /** @param {string} flagKey */
  constructor(flagKey) {
    super(`This capability is disabled. Set ${flagKey}=true to enable it.`)
    this.name = 'FeatureDisabledError'
    this.status = 503
    this.flagKey = flagKey
  }
}

/**
 * @param {Env} env
 * @param {keyof FLAG_KEYS} flag
 */
export function assertFlag(env, flag) {
  const flags = resolveFlags(env)
  if (!flags.engine) throw new FeatureDisabledError(FLAG_KEYS.engine)
  if (!flags[flag]) throw new FeatureDisabledError(FLAG_KEYS[flag])
}
