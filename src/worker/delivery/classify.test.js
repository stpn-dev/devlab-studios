import { describe, it, expect } from 'vitest'
import { backoffDelayMs, classifyDeliveryFailure, isRetryable, nextRetryAt } from './classify.js'

/**
 * Classification is what makes the admin's Retry button meaningful, so the
 * boundaries between "worth retrying" and "needs a person" are pinned here.
 */

describe('classifyDeliveryFailure', () => {
  it('treats a network error as transient', () => {
    expect(classifyDeliveryFailure({ networkError: true })).toBe('transient')
  })

  it('treats a missing status as transient (nothing came back at all)', () => {
    expect(classifyDeliveryFailure({})).toBe('transient')
    expect(classifyDeliveryFailure({ statusCode: null })).toBe('transient')
  })

  it.each([500, 502, 503, 504, 408, 429])('treats %i as transient', (statusCode) => {
    expect(classifyDeliveryFailure({ statusCode })).toBe('transient')
  })

  it.each([401, 403])('treats %i as a configuration problem an operator must fix', (statusCode) => {
    expect(classifyDeliveryFailure({ statusCode })).toBe('configuration')
  })

  it.each([400, 404, 409, 422])('treats %i as permanent', (statusCode) => {
    expect(classifyDeliveryFailure({ statusCode })).toBe('permanent')
  })
})

describe('isRetryable', () => {
  it('only transient failures are worth retrying automatically', () => {
    expect(isRetryable('transient')).toBe(true)
    expect(isRetryable('permanent')).toBe(false)
    expect(isRetryable('configuration')).toBe(false)
  })
})

describe('backoffDelayMs', () => {
  it('grows exponentially from the first attempt', () => {
    expect(backoffDelayMs(1)).toBe(400)
    expect(backoffDelayMs(2)).toBe(800)
    expect(backoffDelayMs(3)).toBe(1600)
  })

  it('is bounded, so a long-failing lead never schedules an absurd delay', () => {
    expect(backoffDelayMs(50)).toBe(5000)
  })

  it('never returns a negative delay for a nonsensical attempt number', () => {
    expect(backoffDelayMs(0)).toBeGreaterThan(0)
    expect(backoffDelayMs(-5)).toBeGreaterThan(0)
  })
})

describe('nextRetryAt', () => {
  it('returns an ISO timestamp in the future', () => {
    const now = Date.parse('2026-09-17T00:00:00.000Z')
    const result = nextRetryAt(1, now)
    expect(result).toBe(new Date(now + 400).toISOString())
  })
})
