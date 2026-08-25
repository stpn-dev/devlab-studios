import { describe, it, expect } from 'vitest'
import { initialGameState } from './gameState'

describe('initialGameState', () => {
  it('doubles opens on server 2 (the traditional 0-0-2 start)', () => {
    expect(initialGameState('A', 'DOUBLES')).toEqual({ scoreA: 0, scoreB: 0, servingTeam: 'A', serverNumber: 2 })
  })

  it('singles opens on server 1 -- never exposes a meaningless server 2', () => {
    expect(initialGameState('B', 'SINGLES')).toEqual({ scoreA: 0, scoreB: 0, servingTeam: 'B', serverNumber: 1 })
  })
})
