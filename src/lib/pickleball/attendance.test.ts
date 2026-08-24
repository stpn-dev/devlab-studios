import { describe, it, expect } from 'vitest'
import { canCheckIn, canSetAvailability, canLeaveSession, canCancelRegistration, summarizeAttendance } from './attendance'

const base = { registrationStatus: 'REGISTERED' as const, attendanceStatus: 'NOT_CHECKED_IN' as const, availabilityStatus: 'AVAILABLE' as const }

describe('canCheckIn', () => {
  it('allows a registered, not-checked-in player', () => {
    expect(canCheckIn(base)).toBe(true)
  })

  it('rejects a cancelled registration', () => {
    expect(canCheckIn({ ...base, registrationStatus: 'CANCELLED' })).toBe(false)
  })

  it('rejects a player already checked in', () => {
    expect(canCheckIn({ ...base, attendanceStatus: 'CHECKED_IN' })).toBe(false)
  })
})

describe('canSetAvailability', () => {
  it('allows a checked-in player', () => {
    expect(canSetAvailability({ ...base, attendanceStatus: 'CHECKED_IN' })).toBe(true)
  })

  it('rejects a player not checked in', () => {
    expect(canSetAvailability(base)).toBe(false)
  })

  it('rejects a player who left the session', () => {
    expect(canSetAvailability({ ...base, attendanceStatus: 'LEFT_SESSION' })).toBe(false)
  })
})

describe('canLeaveSession', () => {
  it('allows a checked-in player', () => {
    expect(canLeaveSession({ ...base, attendanceStatus: 'CHECKED_IN' })).toBe(true)
  })

  it('rejects a player who never checked in', () => {
    expect(canLeaveSession(base)).toBe(false)
  })
})

describe('canCancelRegistration', () => {
  it('allows a registered, not-checked-in player', () => {
    expect(canCancelRegistration(base)).toBe(true)
  })

  it('rejects a player already checked in (must leave, not cancel)', () => {
    expect(canCancelRegistration({ ...base, attendanceStatus: 'CHECKED_IN' })).toBe(false)
  })
})

describe('summarizeAttendance', () => {
  it('matches the spec example counts', () => {
    const players = [
      { registrationStatus: 'REGISTERED' as const, attendanceStatus: 'CHECKED_IN' as const, availabilityStatus: 'AVAILABLE' as const },
      { registrationStatus: 'REGISTERED' as const, attendanceStatus: 'CHECKED_IN' as const, availabilityStatus: 'TEMPORARILY_UNAVAILABLE' as const },
      { registrationStatus: 'REGISTERED' as const, attendanceStatus: 'NOT_CHECKED_IN' as const, availabilityStatus: 'AVAILABLE' as const },
      { registrationStatus: 'REGISTERED' as const, attendanceStatus: 'LEFT_SESSION' as const, availabilityStatus: 'AVAILABLE' as const },
      { registrationStatus: 'CANCELLED' as const, attendanceStatus: 'NOT_CHECKED_IN' as const, availabilityStatus: 'AVAILABLE' as const },
    ]

    expect(summarizeAttendance(players)).toEqual({
      registered: 4,
      checkedIn: 2,
      notArrived: 1,
      leftSession: 1,
      available: 1,
      temporarilyUnavailable: 1,
      resting: 0,
    })
  })

  it('returns all zeros for an empty session', () => {
    expect(summarizeAttendance([])).toEqual({
      registered: 0,
      checkedIn: 0,
      notArrived: 0,
      leftSession: 0,
      available: 0,
      temporarilyUnavailable: 0,
      resting: 0,
    })
  })
})
