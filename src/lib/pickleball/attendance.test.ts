import { describe, it, expect } from 'vitest'
import { summarizeAttendance } from './attendance'

// The state-transition guards are enforced (atomically) by the SQL `WHERE`
// clauses in src/worker/repositories/pickleball/sessionPlayers.js and covered
// by tests/e2e/pickleball/pickleball-attendance.spec.js — not here.
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
