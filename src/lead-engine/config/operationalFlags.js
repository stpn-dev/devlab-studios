/**
 * Admin-controlled feature switches, bounded by deployment-level Worker vars.
 *
 * Worker vars remain the hard ceiling and emergency stop. D1 may turn an
 * allowed capability off or back on, but it can never enable a capability the
 * deployed Worker has forbidden. A failed D1 read fails closed: every
 * effective capability is off for that operation.
 */

import { FLAG_KEYS, isFlagOn } from './flags.js'
import { operationError, parseJsonField } from '../repositories/helpers.js'
import { setSetting } from '../repositories/settings.js'

export const OPERATIONAL_FLAGS_SETTING_KEY = 'operations.flags'
export const OPERATIONAL_FLAG_NAMES = Object.freeze(Object.keys(FLAG_KEYS))

const RESOLVED_OPERATIONAL_FLAGS = Symbol('resolvedOperationalFlags')

function falseFlags() {
  return Object.fromEntries(OPERATIONAL_FLAG_NAMES.map((key) => [key, false]))
}

function normalizeFlags(value, fallback) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.fromEntries(
    OPERATIONAL_FLAG_NAMES.map((key) => [key, typeof source[key] === 'boolean' ? source[key] : fallback[key]]),
  )
}

/** Deployment allowances are raw vars; unlike resolveFlags they are not master-gated. */
export function resolveDeploymentAllowances(env) {
  const source = env || {}
  return Object.fromEntries(
    Object.entries(FLAG_KEYS).map(([key, varName]) => [key, isFlagOn(source[varName])]),
  )
}

/**
 * Returns requested, deployment-allowed and effective states together so the
 * UI can explain a locked switch instead of presenting a control that lies.
 */
export async function getOperationalFlagState(env) {
  const deployment = resolveDeploymentAllowances(env)
  const safeDefault = falseFlags()

  if (!env?.DB) {
    return {
      available: false,
      persisted: false,
      deployment,
      requested: falseFlags(),
      effective: falseFlags(),
    }
  }

  let requested
  let persisted = false
  try {
    const row = await env.DB
      .prepare('SELECT value_json FROM lead_settings WHERE key = ?')
      .bind(OPERATIONAL_FLAGS_SETTING_KEY)
      .first()
    persisted = Boolean(row)
    requested = normalizeFlags(parseJsonField(row?.value_json, null), safeDefault)
  } catch (error) {
    console.log(
      JSON.stringify({
        event: 'lead_operational_flags_read_failed',
        error: error instanceof Error ? error.message : 'unknown',
      }),
    )
    return {
      available: false,
      persisted: false,
      deployment,
      requested: falseFlags(),
      effective: falseFlags(),
    }
  }

  const effective = falseFlags()
  effective.engine = deployment.engine && requested.engine
  for (const key of OPERATIONAL_FLAG_NAMES) {
    if (key === 'engine') continue
    effective[key] = effective.engine && deployment[key] && requested[key]
  }
  effective.zohoMailSync = effective.zohoMail && effective.zohoMailSync

  return { available: true, persisted, deployment, requested, effective }
}

/**
 * Returns an env view whose flag vars are the effective operational state.
 * Bindings remain on the original object; only flag reads are intercepted.
 */
export async function withOperationalFlags(env) {
  if (env?.[RESOLVED_OPERATIONAL_FLAGS]) return env

  const state = await getOperationalFlagState(env)
  const valueByVar = new Map(
    Object.entries(FLAG_KEYS).map(([key, varName]) => [varName, state.effective[key] ? 'true' : 'false']),
  )

  return new Proxy(env || {}, {
    get(target, property, receiver) {
      if (property === RESOLVED_OPERATIONAL_FLAGS) return true
      if (valueByVar.has(property)) return valueByVar.get(property)
      return Reflect.get(target, property, receiver)
    },
  })
}

export async function updateOperationalFlag(env, key, enabled, options = {}) {
  if (!OPERATIONAL_FLAG_NAMES.includes(key)) throw operationError('Unknown feature flag.', 422)

  const state = await getOperationalFlagState(env)
  if (!state.available) throw operationError('Feature controls are unavailable because settings could not be read.', 503)
  if (enabled && !state.deployment[key]) {
    throw operationError(`${FLAG_KEYS[key]} is disabled by the deployed Worker configuration.`, 409)
  }
  if (key === 'zohoMailSync' && enabled && !state.requested.zohoMail) {
    throw operationError('Enable Zoho Mail before enabling mailbox sync.', 409)
  }

  const requested = { ...state.requested, [key]: enabled }
  if (key === 'zohoMail' && !enabled) requested.zohoMailSync = false

  await setSetting(env.DB, OPERATIONAL_FLAGS_SETTING_KEY, requested, {
    actorEmail: options.actorEmail ?? null,
  })

  return getOperationalFlagState(env)
}
