const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verifies a Cloudflare Turnstile token. Returns true (skips verification)
 * when TURNSTILE_SECRET_KEY isn't configured, matching this codebase's
 * established pattern of graceful degradation for not-yet-configured
 * optional integrations (see adminAuth.js's auth-mode fallback).
 *
 * @param {string | undefined} secretKey
 * @param {string | undefined} token
 * @param {string | undefined} remoteIp
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function verifyTurnstileToken(secretKey, token, remoteIp) {
  if (!secretKey) return { ok: true }
  if (!token) return { ok: false, reason: 'missing-token' }

  const body = new URLSearchParams({ secret: secretKey, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body })
    const result = await response.json()
    if (result.success) return { ok: true }
    return { ok: false, reason: Array.isArray(result['error-codes']) ? result['error-codes'].join(',') : 'verification-failed' }
  } catch {
    return { ok: false, reason: 'verification-request-failed' }
  }
}
