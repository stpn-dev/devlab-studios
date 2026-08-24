// Read-side aggregation only. The authoritative state-transition guards live in
// src/worker/repositories/pickleball/sessionPlayers.js's SQL `WHERE` clauses,
// where they are atomic; this module intentionally does not duplicate them.

export type RegistrationStatus = 'REGISTERED' | 'CANCELLED'
export type AttendanceStatus = 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'LEFT_SESSION'
export type AvailabilityStatus = 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'RESTING'

export interface SessionPlayerState {
  registrationStatus: RegistrationStatus
  attendanceStatus: AttendanceStatus
  availabilityStatus: AvailabilityStatus
}

export interface AttendanceCounts {
  registered: number
  checkedIn: number
  notArrived: number
  leftSession: number
  available: number
  temporarilyUnavailable: number
  resting: number
}

export function summarizeAttendance(players: SessionPlayerState[]): AttendanceCounts {
  return players.reduce<AttendanceCounts>(
    (counts, player) => ({
      registered: counts.registered + (player.registrationStatus === 'REGISTERED' ? 1 : 0),
      checkedIn: counts.checkedIn + (player.attendanceStatus === 'CHECKED_IN' ? 1 : 0),
      notArrived: counts.notArrived + (player.registrationStatus === 'REGISTERED' && player.attendanceStatus === 'NOT_CHECKED_IN' ? 1 : 0),
      leftSession: counts.leftSession + (player.attendanceStatus === 'LEFT_SESSION' ? 1 : 0),
      available: counts.available + (player.attendanceStatus === 'CHECKED_IN' && player.availabilityStatus === 'AVAILABLE' ? 1 : 0),
      temporarilyUnavailable: counts.temporarilyUnavailable + (player.attendanceStatus === 'CHECKED_IN' && player.availabilityStatus === 'TEMPORARILY_UNAVAILABLE' ? 1 : 0),
      resting: counts.resting + (player.attendanceStatus === 'CHECKED_IN' && player.availabilityStatus === 'RESTING' ? 1 : 0),
    }),
    { registered: 0, checkedIn: 0, notArrived: 0, leftSession: 0, available: 0, temporarilyUnavailable: 0, resting: 0 },
  )
}
