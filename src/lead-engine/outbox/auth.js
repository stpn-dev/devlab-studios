/**
 * Bearer-token auth for the outbox endpoints.
 *
 * These routes live OUTSIDE `/api/admin/`, so the admin session gate in
 * src/middleware.ts does not cover them. An external automation cannot hold a
 * browser session, so they carry their own token check — and because this is a
 * new authentication surface on an endpoint that hands out prospect email
 * addresses and message bodies, it is written to fail closed in every direction.
 *
 * FAILS CLOSED WHEN UNCONFIGURED. With `LEAD_OUTBOX_TOKEN` unset the endpoints
 * refuse every request. The alternative — treating "no token configured" as
 * "no auth required" — would mean a deploy that forgot the secret silently
 * published the outbox to the internet.
 *
 * The comparison is constant-time. A naive `===` leaks the token one byte at a
 * time to anyone willing to measure, and this token authorizes reading contact
 * details for every lead in the pipeline.
 */

/** Minimum length worth accepting. A short token is a guessable one. */
const MIN_TOKEN_LENGTH = 32

/**
 * Compares two strings without an early exit.
 *
 * Length is compared first and separately, which does leak the length — that
 * is unavoidable without hashing and is not sensitive here.
 *
 * @param {string} a
 * @param {string} b
 */
export function timingSafeEqual(a, b) {
  const left = String(a ?? '')
  const right = String(b ?? '')
  if (left.length !== right.length) return false

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return difference === 0
}

/**
 * Reads a bearer token from the Authorization header.
 *
 * @param {Request} request
 * @returns {string}
 */
export function readBearerToken(request) {
  const header = request?.headers?.get?.('authorization') || ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : ''
}

/**
 * Whether this request may use the outbox.
 *
 * @param {Env} env
 * @param {Request} request
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function authorizeOutbox(env, request) {
  const expected = String(env?.LEAD_OUTBOX_TOKEN ?? '').trim()

  if (!expected) {
    // 503, not 401: the caller's credentials are not the problem, and saying
    // "unauthorized" would send an operator hunting for a token that the
    // deployment never had.
    return { ok: false, status: 503, error: 'The outbox is not configured. Set LEAD_OUTBOX_TOKEN.' }
  }

  if (expected.length < MIN_TOKEN_LENGTH) {
    return {
      ok: false,
      status: 503,
      error: `LEAD_OUTBOX_TOKEN is too short to be safe. Use at least ${MIN_TOKEN_LENGTH} random characters.`,
    }
  }

  if (!timingSafeEqual(readBearerToken(request), expected)) {
    return { ok: false, status: 401, error: 'Unauthorized.' }
  }

  return { ok: true }
}
