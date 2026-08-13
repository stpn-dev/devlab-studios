const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const VERIFY_TIMEOUT_MS = 5000
const MAX_TOKEN_LENGTH = 2048

/**
 * Validate a Turnstile token with Cloudflare. Deployed environments fail
 * closed when the secret is missing; localhost may explicitly opt into the
 * official test-key flow so local and static browser tests remain usable.
 *
 * @param {string | undefined} secretKey
 * @param {string | undefined} token
 * @param {string | undefined} remoteIp
 * @param {{ expectedHostname?: string, expectedAction?: string, allowMissingSecret?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function verifyTurnstileToken(secretKey, token, remoteIp, options = {}) {
  if (!secretKey) return options.allowMissingSecret ? { ok: true } : { ok: false, reason: 'configuration-missing' }
  if (!token) return { ok: false, reason: 'missing-token' }
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'invalid-token' }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
    idempotency_key: crypto.randomUUID(),
  })
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)

  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body, signal: controller.signal })
    if (!response.ok) return { ok: false, reason: 'verification-request-failed' }

    const result = await response.json()
    if (!result.success) {
      const codes = Array.isArray(result['error-codes']) ? result['error-codes'] : []
      return { ok: false, reason: codes.includes('timeout-or-duplicate') ? 'timeout-or-duplicate' : 'verification-failed' }
    }

    if (options.expectedHostname && result.hostname !== options.expectedHostname) {
      return { ok: false, reason: 'hostname-mismatch' }
    }
    if (options.expectedAction && result.action !== options.expectedAction) {
      return { ok: false, reason: 'action-mismatch' }
    }

    return { ok: true }
  } catch {
    return { ok: false, reason: 'verification-request-failed' }
  } finally {
    clearTimeout(timeout)
  }
}
