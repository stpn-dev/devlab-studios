/**
 * What is actually usable right now, and what is missing before it is.
 *
 * The flags say what an operator has *asked for*. They do not say whether the
 * credentials behind it exist. Those are different failures and they fail at
 * different times: a flag that is off does nothing quietly and on purpose, while
 * a flag that is on without its credentials fails later, inside a job, against a
 * real lead.
 *
 * This module closes that gap by reporting both together, so the dashboard can
 * say "Brave discovery is on but BRAVE_SEARCH_API_KEY is not set" before a run
 * rather than after one. Nothing here performs I/O or contacts a provider — it
 * reads `env`, the stored `business.identity`, and the source registry, so it
 * is safe to call on every dashboard load and cannot itself be the thing that
 * breaks.
 *
 * Deliberately NOT reported: anything resembling a send capability. There is
 * nothing to report, because there is no sender. See
 * docs/lead-engine/architecture.md.
 */

import { BUSINESS_IDENTITY_FIELDS } from './defaults.js'
import { FLAG_KEYS, isFlagOn } from './flags.js'

/** @param {unknown} value */
function present(value) {
  return String(value ?? '').trim().length > 0
}

/**
 * Env var names behind each capability, as an operator would type them into
 * `wrangler secret put`. `readZohoConfig` reports the same gaps under camelCase
 * property names, which is right for its callers and wrong for this one.
 */
const ZOHO_SECRETS = Object.freeze([
  'ZOHO_ACCOUNT_ID',
  'ZOHO_USER_EMAIL',
  'ZOHO_OAUTH_CLIENT_ID',
  'ZOHO_OAUTH_CLIENT_SECRET',
  'ZOHO_OAUTH_REFRESH_TOKEN',
])

const BROWSER_RUN_SECRETS = Object.freeze(['CLOUDFLARE_ACCOUNT_ID', 'BROWSER_RENDERING_API_TOKEN'])

/**
 * @param {Env} env
 * @param {readonly string[]} names
 * @returns {string[]}
 */
function missingEnv(env, names) {
  return names.filter((name) => !present(env?.[name]))
}

/**
 * Severity of a capability being unavailable.
 *
 * `required` means the pipeline cannot produce a reviewable lead without it.
 * `optional` means the pipeline works and is simply narrower — fewer businesses
 * found, or fewer pages readable. The distinction matters because an operator
 * reading a wall of warnings needs to know which ones actually stop them.
 */
const REQUIRED = 'required'
const OPTIONAL = 'optional'

/**
 * Reports every capability's flag state and credential state side by side.
 *
 * @param {Env} env
 * @param {{ businessIdentity?: Record<string, unknown>|null, sources?: Array<object>|null }} [options]
 * @returns {{
 *   ready: boolean,
 *   blocking: string[],
 *   capabilities: Array<{
 *     key: string, label: string, importance: string, flag: string|null,
 *     enabled: boolean, configured: boolean, missing: string[], impact: string
 *   }>
 * }}
 */
export function resolveReadiness(env, options = {}) {
  const source = env || {}
  const identity = options.businessIdentity || {}
  const sources = Array.isArray(options.sources) ? options.sources : null

  const identityMissing = [...BUSINESS_IDENTITY_FIELDS.sender, ...BUSINESS_IDENTITY_FIELDS.postal].filter(
    (field) => !present(identity[field]),
  )
  const approvedAutomatedSources = sources?.filter(
    (entry) => entry?.enabled && entry?.automationAllowed && entry?.policyStatus === 'approved',
  )
  const automatedDiscoveryConfigured =
    approvedAutomatedSources === undefined ||
    approvedAutomatedSources.some(
      (entry) => entry.slug === 'osm-overpass' || (entry.slug === 'brave-search' && present(source.BRAVE_SEARCH_API_KEY)),
    )

  /**
   * `configured` answers "would this work if its flag were on". A capability
   * needing no credentials is configured by definition, which is why several
   * rows below are always `true` — they are listed so the screen shows one
   * complete picture rather than only the broken parts.
   */
  const capabilities = [
    {
      key: 'engine',
      label: 'Engine',
      importance: REQUIRED,
      flag: FLAG_KEYS.engine,
      enabled: isFlagOn(source[FLAG_KEYS.engine]),
      configured: true,
      missing: [],
      impact: 'Master switch. Every other capability is ANDed with this one.',
    },
    {
      key: 'discovery',
      label: 'Automated discovery',
      importance: REQUIRED,
      flag: FLAG_KEYS.discovery,
      enabled: isFlagOn(source[FLAG_KEYS.discovery]),
      configured: automatedDiscoveryConfigured,
      missing: automatedDiscoveryConfigured ? [] : ['approved automated source (Lead CRM > Sources)'],
      impact: 'No automated source is enabled and policy-approved. Manual import remains available.',
    },
    {
      key: 'discovery_brave',
      label: 'Discovery — Brave Search',
      importance: OPTIONAL,
      flag: FLAG_KEYS.discovery,
      enabled: isFlagOn(source[FLAG_KEYS.discovery]),
      configured: present(source.BRAVE_SEARCH_API_KEY),
      missing: missingEnv(source, ['BRAVE_SEARCH_API_KEY']),
      impact: 'A second discovery source. Overpass alone still finds businesses.',
    },
    {
      key: 'crawler',
      label: 'Website research',
      importance: REQUIRED,
      flag: FLAG_KEYS.crawler,
      enabled: isFlagOn(source[FLAG_KEYS.crawler]),
      configured: true,
      missing: [],
      impact: 'Without it nothing is researched, so nothing is ever scored.',
    },
    {
      key: 'browser_run',
      label: 'Website research — JavaScript rendering',
      importance: OPTIONAL,
      flag: FLAG_KEYS.browserRun,
      enabled: isFlagOn(source[FLAG_KEYS.browserRun]),
      configured: missingEnv(source, BROWSER_RUN_SECRETS).length === 0,
      missing: missingEnv(source, BROWSER_RUN_SECRETS),
      impact: 'Only affects sites that render their content client-side. Plain fetch covers the rest.',
    },
    {
      key: 'ai',
      label: 'AI review',
      importance: REQUIRED,
      flag: FLAG_KEYS.ai,
      enabled: isFlagOn(source[FLAG_KEYS.ai]),
      configured: Boolean(source.AI),
      missing: source.AI ? [] : ['AI (Workers AI binding)'],
      impact: 'Without it leads stop at rule qualification and never reach review.',
    },
    {
      key: 'outreach_identity',
      label: 'Business identity',
      importance: REQUIRED,
      flag: null,
      enabled: true,
      configured: identityMissing.length === 0,
      missing: identityMissing.map((field) => `business.identity.${field}`),
      impact: 'The US profile blocks every lead at review until this is complete. No draft can be generated.',
    },
    {
      key: 'zoho_draft',
      label: 'Zoho drafts',
      importance: REQUIRED,
      flag: FLAG_KEYS.zohoMail,
      enabled: isFlagOn(source[FLAG_KEYS.zohoMail]),
      configured: missingEnv(source, ZOHO_SECRETS).length === 0,
      missing: missingEnv(source, ZOHO_SECRETS),
      impact: 'Drafts are prepared in the CRM but cannot be placed in the mailbox. You still send them yourself.',
    },
    {
      key: 'zoho_sync',
      label: 'Zoho mailbox sync',
      importance: OPTIONAL,
      flag: FLAG_KEYS.zohoMailSync,
      enabled: isFlagOn(source[FLAG_KEYS.zohoMailSync]),
      configured: missingEnv(source, ZOHO_SECRETS).length === 0,
      missing: missingEnv(source, ZOHO_SECRETS),
      impact: 'Replies are not imported, so conversations must be tracked by hand.',
    },
    {
      key: 'tracking',
      label: 'Link tracking',
      importance: OPTIONAL,
      flag: FLAG_KEYS.tracking,
      enabled: isFlagOn(source[FLAG_KEYS.tracking]),
      configured: true,
      missing: [],
      impact: 'Click recording only. There is no open tracking in this system.',
    },
    {
      key: 'schedules',
      label: 'Campaign schedules',
      importance: OPTIONAL,
      flag: FLAG_KEYS.campaignSchedules,
      enabled: isFlagOn(source[FLAG_KEYS.campaignSchedules]),
      configured: true,
      missing: [],
      impact: 'Runs campaigns unattended. Also needs schedule_enabled on the campaign itself.',
    },
  ]

  /**
   * Only a REQUIRED capability that is missing its credentials blocks. A
   * required capability whose flag is merely off is not a gap — it is an
   * operator part-way through the documented enable sequence, and reporting
   * that as broken would train them to ignore this panel.
   */
  const blocking = capabilities
    .filter((capability) => capability.importance === REQUIRED && !capability.configured)
    .map((capability) => capability.key)

  return { ready: blocking.length === 0, blocking, capabilities }
}
