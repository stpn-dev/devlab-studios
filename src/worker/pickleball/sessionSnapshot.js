import { getSessionById } from '../repositories/pickleball/sessions.js'
import { listSessionCourts } from '../repositories/pickleball/sessionCourts.js'
import { listQueueForSession } from '../repositories/pickleball/queueEntries.js'
import { listGamesForSession } from '../repositories/pickleball/games.js'

// The one place that assembles "everything a connected operator/public
// client needs to render the current session" — reused by both the
// WebSocket accept/broadcast path (SessionCoordinatorDO.ts) and the public
// REST polling fallback (Task 7), so there is exactly one query shape to
// keep correct rather than two that could drift.
export async function buildSessionSnapshot(db, sessionId) {
  const [session, courts, queue, games] = await Promise.all([
    getSessionById(db, sessionId),
    listSessionCourts(db, sessionId),
    listQueueForSession(db, sessionId),
    listGamesForSession(db, sessionId),
  ])
  return { session, courts, queue, games }
}
