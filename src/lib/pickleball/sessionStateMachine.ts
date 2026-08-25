export interface SessionLike {
  status: string
}

export type SessionStatus = 'DRAFT' | 'OPEN_FOR_CHECKIN' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'

const VALID_STATUSES: readonly SessionStatus[] = ['DRAFT', 'OPEN_FOR_CHECKIN', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']

interface DomainError extends Error {
  status: number
}

function domainError(message: string, status: number): DomainError {
  const error = new Error(message) as DomainError
  error.status = status
  return error
}

function isValidStatus(value: string): value is SessionStatus {
  return (VALID_STATUSES as readonly string[]).includes(value)
}

// DRAFT -> OPEN_FOR_CHECKIN
export function openForCheckIn(session: SessionLike): SessionStatus {
  if (session.status !== 'DRAFT') {
    throw domainError('Cannot open check-in for a session that is not in draft.', 409)
  }
  return 'OPEN_FOR_CHECKIN'
}

// OPEN_FOR_CHECKIN -> LIVE
export function startSession(session: SessionLike): SessionStatus {
  if (session.status !== 'OPEN_FOR_CHECKIN') {
    throw domainError('Cannot start a session that is not open for check-in.', 409)
  }
  return 'LIVE'
}

// LIVE -> PAUSED
export function pauseSession(session: SessionLike): SessionStatus {
  if (session.status !== 'LIVE') {
    throw domainError('Cannot pause a session that is not live.', 409)
  }
  return 'PAUSED'
}

// PAUSED -> LIVE
export function resumeSession(session: SessionLike): SessionStatus {
  if (session.status !== 'PAUSED') {
    throw domainError('Cannot resume a session that is not paused.', 409)
  }
  return 'LIVE'
}

// LIVE or PAUSED -> COMPLETED
export function completeSession(session: SessionLike): SessionStatus {
  if (session.status !== 'LIVE' && session.status !== 'PAUSED') {
    throw domainError('Cannot complete a session that is not live or paused.', 409)
  }
  return 'COMPLETED'
}

// Anything except COMPLETED or CANCELLED -> CANCELLED
export function cancelSession(session: SessionLike): SessionStatus {
  if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
    throw domainError('Cannot cancel a session that is already completed or cancelled.', 409)
  }
  return 'CANCELLED'
}

// Nothing transitions a session back to DRAFT — it is a legal enum member
// but not a reachable transition target, hence a 409 (legal status, illegal
// transition) rather than a 400 (unrecognized status).
function rejectDraftTarget(): SessionStatus {
  throw domainError('Cannot transition a session back to draft.', 409)
}

// LIVE is reachable from two source states (OPEN_FOR_CHECKIN via
// startSession, PAUSED via resumeSession). This only *routes* to the right
// named function based on the session's current status — the precondition
// check that actually rejects an illegal source state still lives solely
// inside startSession/resumeSession, so a session in neither state falls
// through to startSession's own check and throws from there.
function dispatchToLive(session: SessionLike): SessionStatus {
  return session.status === 'PAUSED' ? resumeSession(session) : startSession(session)
}

const TARGET_TRANSITIONS: Record<SessionStatus, (session: SessionLike) => SessionStatus> = {
  DRAFT: rejectDraftTarget,
  OPEN_FOR_CHECKIN: openForCheckIn,
  LIVE: dispatchToLive,
  PAUSED: pauseSession,
  COMPLETED: completeSession,
  CANCELLED: cancelSession,
}

export function transitionSession(session: SessionLike, targetStatus: string): SessionStatus {
  if (!isValidStatus(targetStatus)) {
    throw domainError(`"${targetStatus}" is not a recognized session status.`, 400)
  }
  return TARGET_TRANSITIONS[targetStatus](session)
}
