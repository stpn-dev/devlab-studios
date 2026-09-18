/**
 * Zoho OAuth.
 *
 * Backend-only, always. The client secret and refresh token are Cloudflare
 * Worker secrets and never reach the browser, never reach D1, and never appear
 * in a log line — `redactZohoError` below exists because upstream error bodies
 * have been known to echo request parameters back.
 *
 * The refresh token is long-lived and is obtained ONCE, out of band, by a human
 * completing the authorization-code flow (documented in
 * docs/lead-engine/zoho-integration.md). This module therefore only implements
 * the refresh half: there is no callback route to protect, no state parameter to
 * validate, and no browser-facing surface at all — which is a smaller attack
 * surface than an in-app authorization flow would be, for a single-operator
 * mailbox that is connected once.
 *
 * Access tokens are cached in memory for the isolate's lifetime. Not in D1:
 * an access token is a bearer credential with a one-hour life, and writing it
 * to the database would put a live credential in every backup for the sake of
 * saving one HTTP request per isolate.
 */

import { ZOHO } from '../config/defaults.js'

/**
 * Per-isolate token cache, keyed by client id so two configurations cannot
 * share a token.
 *
 * Module-level state is safe here in a way it would not be for, say, rate
 * limiting: a Worker isolate is short-lived and single-tenant, so the worst
 * case is a redundant refresh, not a cross-account leak.
 *
 * @type {Map<string, { accessToken: string, expiresAt: number }>}
 */
const tokenCache = new Map()

/** Refresh this long before actual expiry, so a token cannot die mid-request. */
const EXPIRY_SKEW_MS = 60_000

export class ZohoAuthError extends Error {
  constructor(message, { status = 502, code = 'zoho_auth_failed' } = {}) {
    super(message)
    this.name = 'ZohoAuthError'
    this.status = status
    this.code = code
  }
}

/**
 * Reads the Zoho configuration from the environment.
 *
 * Returns what IS configured and what is missing, rather than throwing, so the
 * admin's integration-status screen can list the exact missing variables
 * instead of showing a single unhelpful failure.
 *
 * @param {Env} env
 */
export function readZohoConfig(env) {
  const config = {
    enabled: String(env?.ZOHO_MAIL_ENABLED ?? '').toLowerCase() === 'true',
    accountId: String(env?.ZOHO_ACCOUNT_ID ?? '').trim(),
    userEmail: String(env?.ZOHO_USER_EMAIL ?? '').trim().toLowerCase(),
    clientId: String(env?.ZOHO_OAUTH_CLIENT_ID ?? '').trim(),
    clientSecret: String(env?.ZOHO_OAUTH_CLIENT_SECRET ?? '').trim(),
    refreshToken: String(env?.ZOHO_OAUTH_REFRESH_TOKEN ?? '').trim(),
    apiBaseUrl: String(env?.ZOHO_API_BASE_URL ?? '').trim() || ZOHO.defaultApiBaseUrl,
    accountsBaseUrl: String(env?.ZOHO_ACCOUNTS_BASE_URL ?? '').trim() || ZOHO.accountsBaseUrl,
  }

  const required = ['accountId', 'userEmail', 'clientId', 'clientSecret', 'refreshToken']
  const missing = required.filter((key) => !config[key])

  return { ...config, missing, isConfigured: missing.length === 0 }
}

/**
 * Strips credential material from an upstream error before it is stored or
 * logged.
 *
 * Zoho's token endpoint echoes request parameters into some error responses,
 * and those responses end up in `lead_sync_state.last_error` and on an admin
 * screen. This is the one place that has to get it right.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function redactZohoError(value) {
  return String(value ?? '')
    .replace(/(client_secret|refresh_token|access_token|code)=([^&\s"']+)/gi, '$1=[redacted]')
    .replace(/"(client_secret|refresh_token|access_token)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\b1000\.[A-Za-z0-9._-]{20,}/g, '[redacted-zoho-token]')
    .slice(0, 500)
}

/**
 * Exchanges the refresh token for an access token, using the cache when valid.
 *
 * @param {Env} env
 * @param {{ fetchImpl?: typeof fetch, force?: boolean, now?: () => number }} [options]
 * @returns {Promise<string>}
 */
export async function getAccessToken(env, options = {}) {
  const config = readZohoConfig(env)
  if (!config.isConfigured) {
    throw new ZohoAuthError(`Zoho is not fully configured. Missing: ${config.missing.join(', ')}.`, {
      status: 503,
      code: 'zoho_not_configured',
    })
  }

  const now = options.now ? options.now() : Date.now()
  const cached = tokenCache.get(config.clientId)
  if (!options.force && cached && cached.expiresAt - EXPIRY_SKEW_MS > now) {
    return cached.accessToken
  }

  const fetchImpl = options.fetchImpl || fetch
  const body = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ZOHO.requestTimeoutMs)

  let response
  try {
    response = await fetchImpl(`${config.accountsBaseUrl}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    })
  } catch (error) {
    throw new ZohoAuthError(
      controller.signal.aborted ? 'Zoho token request timed out.' : `Zoho token request failed: ${redactZohoError(error instanceof Error ? error.message : '')}`,
      { code: 'zoho_auth_network' },
    )
  } finally {
    clearTimeout(timer)
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.access_token) {
    // Zoho answers 200 with an `error` field for some failures, so the status
    // alone is not enough to decide this succeeded.
    const detail = redactZohoError(payload?.error || payload?.error_description || `HTTP ${response.status}`)
    throw new ZohoAuthError(`Zoho refused the token request: ${detail}`, {
      // An invalid refresh token needs a human to re-authorize; anything else
      // is worth retrying. The distinction drives the retry policy in the job
      // runner, so it is carried on the error rather than inferred later.
      code: payload?.error === 'invalid_grant' ? 'zoho_reauthorization_required' : 'zoho_auth_rejected',
      status: payload?.error === 'invalid_grant' ? 401 : 502,
    })
  }

  const expiresInSeconds = Number(payload.expires_in) || 3_600
  tokenCache.set(config.clientId, {
    accessToken: payload.access_token,
    expiresAt: now + expiresInSeconds * 1_000,
  })

  return payload.access_token
}

/** Clears the cache. Exported for tests and for a re-authorization action. */
export function clearTokenCache() {
  tokenCache.clear()
}
