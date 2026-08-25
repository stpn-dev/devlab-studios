// Shared session-status guard for the queue-join, queue-leave, court-enable,
// and court-disable routes.
//
// Before this, only SessionCoordinatorDO.assignCourt checked session.status
// (LIVE only) -- the four routes above never checked it at all, so a
// COMPLETED or CANCELLED session could still have its queue or courts
// mutated. Policy: block these four routes only in the two terminal states
// (COMPLETED, CANCELLED). DRAFT, OPEN_FOR_CHECKIN, LIVE, and PAUSED are all
// allowed here, because a facilitator may reasonably build a queue or toggle
// courts before a session goes fully LIVE.
//
// This is deliberately MORE permissive than assignCourt's LIVE-only gate --
// do not use this to guard assignCourt, replaceAssignedPlayer, or
// releaseCourt, which are unchanged and already correct for the
// assignment/replace/release actions specifically.
const TERMINAL_SESSION_STATUSES = new Set(['COMPLETED', 'CANCELLED'])

export function isSessionOpenForQueueOrCourtChanges(status: string): boolean {
  return !TERMINAL_SESSION_STATUSES.has(status)
}
