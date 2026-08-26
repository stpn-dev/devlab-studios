import { describe, it, expect } from 'vitest'
import { gamePerformance, opi, confidenceTier } from './opi'

// Canonical numbers from spec §8/§65. Rounded to 6 decimals for the
// assertion to avoid float-equality flakiness -- the function itself
// returns full precision.
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

describe('gamePerformance', () => {
  it('11-7 -> 61.111...', () => {
    expect(round6(gamePerformance(11, 7))).toBe(round6(61.111111111111114))
  })

  it('9-11 -> 45', () => {
    expect(round6(gamePerformance(9, 11))).toBe(45)
  })

  it('11-5 -> 68.75', () => {
    expect(round6(gamePerformance(11, 5))).toBe(68.75)
  })

  it('mean of the three canonical games -> 58.287..., display 58.29', () => {
    const values = [gamePerformance(11, 7), gamePerformance(9, 11), gamePerformance(11, 5)]
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    expect(round6(mean)).toBe(round6(58.287037037037045))
    expect(mean.toFixed(2)).toBe('58.29')
  })
})

describe('opi', () => {
  it('is the mean of the given game performances, matching the canonical three-game example', () => {
    const values = [gamePerformance(11, 7), gamePerformance(9, 11), gamePerformance(11, 5)]
    expect(round6(opi(values))).toBe(round6(58.287037037037045))
    expect(opi(values).toFixed(2)).toBe('58.29')
  })

  it('a single game is its own OPI', () => {
    expect(round6(opi([gamePerformance(11, 5)]))).toBe(round6(68.75))
  })
})

describe('confidenceTier', () => {
  it('0-2 eligible games -> PROVISIONAL', () => {
    expect(confidenceTier(0)).toBe('PROVISIONAL')
    expect(confidenceTier(2)).toBe('PROVISIONAL')
  })

  it('3-9 eligible games -> DEVELOPING', () => {
    expect(confidenceTier(3)).toBe('DEVELOPING')
    expect(confidenceTier(9)).toBe('DEVELOPING')
  })

  it('10+ eligible games -> ESTABLISHED', () => {
    expect(confidenceTier(10)).toBe('ESTABLISHED')
    expect(confidenceTier(50)).toBe('ESTABLISHED')
  })
})
