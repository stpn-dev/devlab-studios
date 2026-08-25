import { describe, it, expect } from 'vitest'
import { nextBackoffDelayMs } from './useSessionRealtime'

describe('nextBackoffDelayMs', () => {
  it('doubles starting from 1000ms', () => {
    expect(nextBackoffDelayMs(0)).toBe(1000)
    expect(nextBackoffDelayMs(1)).toBe(2000)
    expect(nextBackoffDelayMs(2)).toBe(4000)
    expect(nextBackoffDelayMs(3)).toBe(8000)
  })

  it('caps at 8000ms for any further attempt', () => {
    expect(nextBackoffDelayMs(4)).toBe(8000)
    expect(nextBackoffDelayMs(10)).toBe(8000)
  })
})
