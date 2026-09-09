import type { APIRoute } from 'astro'
import { getSessionByPublicCode } from '../../../../../worker/repositories/pickleball/publicSessionTokens.js'
import { buildSessionSnapshot, buildPublicSnapshotExtras } from '../../../../../worker/pickleball/sessionSnapshot.js'
import { toPublicSessionView } from '../../../../../lib/pickleball/publicSessionView'
import { jsonResponse } from '../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../lib/env'

// A public share code is 10 hex characters (publicSessionTokens.js), which is
// ~40 bits -- unguessable in one shot, but this is the only gate on a view
// that carries real player names, and it is the one endpoint here that takes
// no credential at all. Without a limit, an attacker can grind codes as fast
// as the Worker will answer. The window below caps a single IP at roughly one
// request per second sustained, which is far above what the 5s degraded-path
// poll needs and far below what enumeration requires.
//
// Same shape as contact.ts's limiter, and the same caveat: in-memory means
// per-isolate, so it is a cheap first line of defence rather than a hard
// guarantee. It costs nothing and removes the trivially-scriptable case.
const PUBLIC_STATE_WINDOW_MS = 60_000
const PUBLIC_STATE_MAX_REQUESTS = 60
const publicStateAttempts = new Map<string, { count: number; resetAt: number }>()

function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
}

function isPublicStateRateLimited(request: Request): boolean {
  const key = getClientIp(request)
  const now = Date.now()
  const attempt = publicStateAttempts.get(key)

  if (!attempt || now >= attempt.resetAt) {
    publicStateAttempts.set(key, { count: 1, resetAt: now + PUBLIC_STATE_WINDOW_MS })
    return false
  }

  attempt.count += 1
  return attempt.count > PUBLIC_STATE_MAX_REQUESTS
}

// Spec §9's degraded path: if a client's socket is down, poll this every
// 5s instead of a blank screen. Reuses the SAME buildSessionSnapshot +
// toPublicSessionView pipeline the WebSocket public channel uses, so
// there is exactly one "what does the public see" pipeline, not two that
// could drift.
export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    if (isPublicStateRateLimited(request)) {
      return jsonResponse({ error: 'Too many requests. Try again shortly.' }, 429)
    }

    const code = params.code as string
    const publicSession = await getSessionByPublicCode(env.PICKLEBALL_DB, code)
    if (!publicSession || !publicSession.publicViewEnabled) return jsonResponse({ error: 'Not found.' }, 404)

    const snapshot = await buildSessionSnapshot(env.PICKLEBALL_DB, publicSession.id)
    // Same non-null narrowing requirement as SessionCoordinatorDO.ts's
    // fetch()/sendSnapshotTo() (Task 3's fix round 1): buildSessionSnapshot's
    // plain-JS return type carries `session: {...} | null` because
    // getSessionById can theoretically return null, and TS won't accept
    // `snapshot` as-is where toPublicSessionView requires a non-null
    // `session`. Unreachable today (getSessionByPublicCode already 404'd
    // above), but this is a real runtime guard -- not a type-erasing cast --
    // so a future delete-session feature fails loudly here instead of
    // silently compiling past the same invariant this DO's two call sites
    // already enforce.
    const { session } = snapshot
    if (!session) return jsonResponse({ error: 'Not found.' }, 404)
    const extras = await buildPublicSnapshotExtras(env.PICKLEBALL_DB, session, snapshot.games)
    return jsonResponse(toPublicSessionView({ ...snapshot, session, ...extras }), 200)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error.'
    const status = error instanceof Error && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : 500
    return jsonResponse({ error: message }, status)
  }
}
