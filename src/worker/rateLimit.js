// One place every rate limit goes through, so a limiter can never again be
// "configured but not actually enforcing" without it being visible here.
//
// The Durable Object behind this is what makes the count global; see
// RateLimiterDO.ts for why the previous in-memory Maps did not work on
// Workers.

/**
 * The client address, preferring Cloudflare's own header. `x-forwarded-for` is
 * client-controllable in general, but on Workers `cf-connecting-ip` is set by
 * the edge and cannot be spoofed by the caller, so it is tried first.
 *
 * @param {Request} request
 * @returns {string}
 */
export function clientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
}

/**
 * Records an attempt and says whether the caller is over its allowance.
 *
 * FAILS OPEN. If the Durable Object is unreachable, this returns "not
 * limited" rather than throwing, because a rate limiter that takes the login
 * page down with it when it has a bad minute is a worse outcome than one that
 * briefly stops counting. The trade-off is deliberate and worth knowing about.
 *
 * @param {{ RATE_LIMITER?: DurableObjectNamespace }} env
 * @param {string} bucket  coarse scope, e.g. 'admin-login' -- keeps unrelated
 *   limits from sharing a counter
 * @param {string} identity  who is being limited, e.g. an IP or `ip:email`
 * @param {{ limit: number, windowMs: number }} options
 * @returns {Promise<{ limited: boolean, retryAfterSeconds: number }>}
 */
export async function checkRateLimit(env, bucket, identity, { limit, windowMs }) {
  if (!env?.RATE_LIMITER) return { limited: false, retryAfterSeconds: 0 }

  try {
    // Keyed by bucket AND identity, so every distinct client gets its own
    // object and one noisy address cannot slow everyone else down.
    const key = `${bucket}:${identity}`
    const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(key))
    return await stub.check(key, limit, windowMs)
  } catch {
    return { limited: false, retryAfterSeconds: 0 }
  }
}

/**
 * Read-only check, for call sites that count only failures (see
 * `recordRateLimitFailure`). Fails open for the same reason as checkRateLimit.
 *
 * @param {{ RATE_LIMITER?: DurableObjectNamespace }} env
 * @param {string} bucket
 * @param {string} identity
 * @param {{ limit: number }} options
 * @returns {Promise<{ limited: boolean, retryAfterSeconds: number }>}
 */
export async function peekRateLimit(env, bucket, identity, { limit }) {
  if (!env?.RATE_LIMITER) return { limited: false, retryAfterSeconds: 0 }
  try {
    const key = `${bucket}:${identity}`
    return await env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(key)).peek(key, limit)
  } catch {
    return { limited: false, retryAfterSeconds: 0 }
  }
}

/**
 * Counts one failed attempt.
 *
 * @param {{ RATE_LIMITER?: DurableObjectNamespace }} env
 * @param {string} bucket
 * @param {string} identity
 * @param {{ windowMs: number }} options
 */
export async function recordRateLimitFailure(env, bucket, identity, { windowMs }) {
  if (!env?.RATE_LIMITER) return
  try {
    const key = `${bucket}:${identity}`
    await env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(key)).record(key, windowMs)
  } catch {
    /* best-effort: losing one count is better than failing the request */
  }
}

/**
 * Clears a counter after a legitimate success, so someone who mistyped a
 * password twice is not left throttled once they get it right.
 *
 * @param {{ RATE_LIMITER?: DurableObjectNamespace }} env
 * @param {string} bucket
 * @param {string} identity
 */
export async function clearRateLimit(env, bucket, identity) {
  if (!env?.RATE_LIMITER) return
  try {
    const key = `${bucket}:${identity}`
    await env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(key)).reset(key)
  } catch {
    /* clearing is best-effort: the window expires on its own */
  }
}

/**
 * The 429 every caller should return, with Retry-After so a well-behaved
 * client backs off instead of spinning.
 *
 * @param {string} message
 * @param {number} retryAfterSeconds
 */
export function rateLimitedResponse(message, retryAfterSeconds) {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      ...(retryAfterSeconds > 0 ? { 'retry-after': String(retryAfterSeconds) } : {}),
    },
  })
}
