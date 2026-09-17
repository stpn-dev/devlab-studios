/**
 * Turns an upstream failure into one of three categories that actually mean
 * something operationally:
 *
 *   transient      — worth retrying (5xx, 408, 429, network/timeout)
 *   permanent      — retrying will never help (4xx: bad address, rejected)
 *   configuration  — an operator must set something before any retry works
 *
 * Without this the admin's "Retry" button is a coin flip; with it, the UI can
 * say plainly which failures are worth retrying and which need a person.
 */

export const DELIVERY_ERROR_CATEGORIES = ['transient', 'permanent', 'configuration']

/** Base delay for the bounded in-invocation backoff. */
const BASE_BACKOFF_MS = 400
const MAX_BACKOFF_MS = 5000

export function classifyDeliveryFailure({ statusCode = null, networkError = false } = {}) {
  if (networkError) return 'transient'
  if (statusCode === null || statusCode === undefined) return 'transient'
  if (statusCode === 408 || statusCode === 429) return 'transient'
  if (statusCode >= 500) return 'transient'
  if (statusCode === 401 || statusCode === 403) return 'configuration'
  if (statusCode >= 400) return 'permanent'
  return 'transient'
}

export function isRetryable(category) {
  return category === 'transient'
}

/** Exponential with a hard ceiling — attempt 1 → 400ms, 2 → 800ms, 3 → 1600ms. */
export function backoffDelayMs(attemptNumber) {
  const delay = BASE_BACKOFF_MS * 2 ** Math.max(0, attemptNumber - 1)
  return Math.min(delay, MAX_BACKOFF_MS)
}

/** When the next manual/automatic retry would be reasonable, as an ISO string. */
export function nextRetryAt(attemptNumber, now = Date.now()) {
  return new Date(now + backoffDelayMs(attemptNumber)).toISOString()
}
