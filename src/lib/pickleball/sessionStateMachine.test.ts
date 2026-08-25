import { describe, it, expect } from 'vitest'
import {
  openForCheckIn,
  startSession,
  pauseSession,
  resumeSession,
  completeSession,
  cancelSession,
  transitionSession,
} from './sessionStateMachine'

function session(status: string) {
  return { status }
}

function expectThrowsWithStatus(fn: () => unknown, expectedStatus: number) {
  try {
    fn()
    throw new Error('Expected function to throw but it did not.')
  } catch (error: any) {
    expect(error.status).toBe(expectedStatus)
  }
}

describe('sessionStateMachine', () => {
  describe('openForCheckIn', () => {
    it('transitions DRAFT to OPEN_FOR_CHECKIN', () => {
      expect(openForCheckIn(session('DRAFT'))).toBe('OPEN_FOR_CHECKIN')
    })

    it('throws a 409 when the session is not DRAFT', () => {
      expectThrowsWithStatus(() => openForCheckIn(session('LIVE')), 409)
    })
  })

  describe('startSession', () => {
    it('transitions OPEN_FOR_CHECKIN to LIVE', () => {
      expect(startSession(session('OPEN_FOR_CHECKIN'))).toBe('LIVE')
    })

    it('throws a 409 when the session is not OPEN_FOR_CHECKIN (e.g. DRAFT straight to LIVE)', () => {
      expectThrowsWithStatus(() => startSession(session('DRAFT')), 409)
    })
  })

  describe('pauseSession', () => {
    it('transitions LIVE to PAUSED', () => {
      expect(pauseSession(session('LIVE'))).toBe('PAUSED')
    })

    it('throws a 409 when the session is not LIVE', () => {
      expectThrowsWithStatus(() => pauseSession(session('PAUSED')), 409)
    })
  })

  describe('resumeSession', () => {
    it('transitions PAUSED to LIVE', () => {
      expect(resumeSession(session('PAUSED'))).toBe('LIVE')
    })

    it('throws a 409 when the session is not PAUSED', () => {
      expectThrowsWithStatus(() => resumeSession(session('LIVE')), 409)
    })
  })

  describe('completeSession', () => {
    it('transitions LIVE to COMPLETED', () => {
      expect(completeSession(session('LIVE'))).toBe('COMPLETED')
    })

    it('transitions PAUSED to COMPLETED', () => {
      expect(completeSession(session('PAUSED'))).toBe('COMPLETED')
    })

    it('throws a 409 when the session is neither LIVE nor PAUSED', () => {
      expectThrowsWithStatus(() => completeSession(session('OPEN_FOR_CHECKIN')), 409)
      expectThrowsWithStatus(() => completeSession(session('DRAFT')), 409)
      expectThrowsWithStatus(() => completeSession(session('COMPLETED')), 409)
      expectThrowsWithStatus(() => completeSession(session('CANCELLED')), 409)
    })
  })

  describe('cancelSession', () => {
    it.each(['DRAFT', 'OPEN_FOR_CHECKIN', 'LIVE', 'PAUSED'])('cancels from %s', (status) => {
      expect(cancelSession(session(status))).toBe('CANCELLED')
    })

    it.each(['COMPLETED', 'CANCELLED'])('throws a 409 when cancelling from %s', (status) => {
      expectThrowsWithStatus(() => cancelSession(session(status)), 409)
    })
  })

  describe('transitionSession', () => {
    it('dispatches to openForCheckIn for target OPEN_FOR_CHECKIN', () => {
      expect(transitionSession(session('DRAFT'), 'OPEN_FOR_CHECKIN')).toBe('OPEN_FOR_CHECKIN')
    })

    it('dispatches to startSession for target LIVE from OPEN_FOR_CHECKIN', () => {
      expect(transitionSession(session('OPEN_FOR_CHECKIN'), 'LIVE')).toBe('LIVE')
    })

    it('dispatches to resumeSession for target LIVE from PAUSED', () => {
      expect(transitionSession(session('PAUSED'), 'LIVE')).toBe('LIVE')
    })

    it('dispatches to pauseSession for target PAUSED', () => {
      expect(transitionSession(session('LIVE'), 'PAUSED')).toBe('PAUSED')
    })

    it('dispatches to completeSession for target COMPLETED', () => {
      expect(transitionSession(session('LIVE'), 'COMPLETED')).toBe('COMPLETED')
    })

    it('dispatches to cancelSession for target CANCELLED', () => {
      expect(transitionSession(session('DRAFT'), 'CANCELLED')).toBe('CANCELLED')
    })

    it('throws a 409 for a legal-status-but-illegal-transition target (DRAFT -> LIVE directly)', () => {
      expectThrowsWithStatus(() => transitionSession(session('DRAFT'), 'LIVE'), 409)
    })

    it('throws a 409 for a legal-status-but-illegal-transition target (LIVE -> DRAFT)', () => {
      expectThrowsWithStatus(() => transitionSession(session('LIVE'), 'DRAFT'), 409)
    })

    it('throws a 409 for COMPLETED -> anything', () => {
      expectThrowsWithStatus(() => transitionSession(session('COMPLETED'), 'LIVE'), 409)
      expectThrowsWithStatus(() => transitionSession(session('COMPLETED'), 'CANCELLED'), 409)
    })

    it('throws a 409 for CANCELLED -> anything', () => {
      expectThrowsWithStatus(() => transitionSession(session('CANCELLED'), 'LIVE'), 409)
      expectThrowsWithStatus(() => transitionSession(session('CANCELLED'), 'OPEN_FOR_CHECKIN'), 409)
    })

    it('throws a 400 for a targetStatus that is not a recognized session status at all', () => {
      expectThrowsWithStatus(() => transitionSession(session('DRAFT'), 'NOT_A_REAL_STATUS'), 400)
    })
  })
})
