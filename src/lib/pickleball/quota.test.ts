import { describe, it, expect } from 'vitest'
import { canAddOperator } from './quota'

const unlimited = { maxAdmins: null, maxFacilitators: null, maxScorekeepers: null }

describe('canAddOperator', () => {
  it('allows any count when the role cap is null (unlimited)', () => {
    expect(canAddOperator(unlimited, 'SCOREKEEPER', 999)).toBe(true)
  })

  it('allows adding when current active count is below the cap', () => {
    expect(canAddOperator({ ...unlimited, maxScorekeepers: 5 }, 'SCOREKEEPER', 4)).toBe(true)
  })

  it('blocks adding when current active count is already at the cap', () => {
    expect(canAddOperator({ ...unlimited, maxScorekeepers: 5 }, 'SCOREKEEPER', 5)).toBe(false)
  })

  it('blocks adding when current active count exceeds the cap', () => {
    expect(canAddOperator({ ...unlimited, maxScorekeepers: 5 }, 'SCOREKEEPER', 6)).toBe(false)
  })

  it('checks the cap matching the role being added, not other roles', () => {
    const org = { maxAdmins: 1, maxFacilitators: 2, maxScorekeepers: 3 }
    expect(canAddOperator(org, 'ADMIN', 1)).toBe(false)
    expect(canAddOperator(org, 'SESSION_FACILITATOR', 1)).toBe(true)
  })
})
