import { describe, it, expect } from 'vitest'
import { can, hasPermission } from './permissions'

describe('can', () => {
  it('grants ADMIN every permission', () => {
    expect(can('ADMIN', 'MANAGE_OPERATORS')).toBe(true)
    expect(can('ADMIN', 'SCORE_GAME')).toBe(true)
  })

  it('grants SESSION_FACILITATOR session-management but not operator management', () => {
    expect(can('SESSION_FACILITATOR', 'MANAGE_SESSIONS')).toBe(true)
    expect(can('SESSION_FACILITATOR', 'MANAGE_OPERATORS')).toBe(false)
  })

  it('grants SCOREKEEPER only scoring-adjacent permissions', () => {
    expect(can('SCOREKEEPER', 'SCORE_GAME')).toBe(true)
    expect(can('SCOREKEEPER', 'FINISH_GAME')).toBe(true)
    expect(can('SCOREKEEPER', 'UNDO_SCORE_EVENT')).toBe(true)
    expect(can('SCOREKEEPER', 'REOPEN_GAME')).toBe(false)
    expect(can('SCOREKEEPER', 'MANAGE_QUEUE')).toBe(false)
  })

  it('returns false for an unrecognized role', () => {
    // @ts-expect-error — deliberately passing an invalid role to prove the function fails closed
    expect(can('NOT_A_ROLE', 'SCORE_GAME')).toBe(false)
  })
})

describe('hasPermission', () => {
  it('defers to can() for a normal (non-platform-admin) session', () => {
    expect(hasPermission({ role: 'SCOREKEEPER', isPlatformAdmin: false }, 'MANAGE_OPERATORS')).toBe(false)
    expect(hasPermission({ role: 'ADMIN', isPlatformAdmin: false }, 'MANAGE_OPERATORS')).toBe(true)
  })

  it('grants every permission to a platform admin regardless of role', () => {
    expect(hasPermission({ role: null, isPlatformAdmin: true }, 'MANAGE_OPERATORS')).toBe(true)
    expect(hasPermission({ role: 'SCOREKEEPER', isPlatformAdmin: true }, 'CONFIGURE_SYSTEM_DEFAULTS')).toBe(true)
  })

  it('returns false for a null role and no platform-admin override', () => {
    expect(hasPermission({ role: null, isPlatformAdmin: false }, 'MANAGE_OPERATORS')).toBe(false)
  })
})
