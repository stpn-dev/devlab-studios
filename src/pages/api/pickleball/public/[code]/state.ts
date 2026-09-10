import type { APIRoute } from 'astro'
import { getSessionByPublicCode } from '../../../../../worker/repositories/pickleball/publicSessionTokens.js'
import { buildSessionSnapshot, buildPublicSnapshotExtras } from '../../../../../worker/pickleball/sessionSnapshot.js'
import { toPublicSessionView } from '../../../../../lib/pickleball/publicSessionView'
import { jsonResponse } from '../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../lib/env'
import { checkRateLimit, clientIp, rateLimitedResponse } from '../../../../../worker/rateLimit.js'

// A public share code is 10 hex characters (publicSessionTokens.js), ~40 bits,
// and it is the only gate on a view carrying real player names -- this is the
// one endpoint here that takes no credential at all.
//
// The limiter is Durable-Object backed. It was an in-memory Map first, and
// that did not work: 70 requests to this endpoint from one address returned
// zero 429s, because Workers give every isolate its own memory. See
// src/worker/RateLimiterDO.ts.
const PUBLIC_STATE_WINDOW_MS = 60_000
const PUBLIC_STATE_MAX_REQUESTS = 60

// Spec §9's degraded path: if a client's socket is down, poll this every
// 5s instead of a blank screen. Reuses the SAME buildSessionSnapshot +
// toPublicSessionView pipeline the WebSocket public channel uses, so
// there is exactly one "what does the public see" pipeline, not two that
// could drift.
export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const rate = await checkRateLimit(env, 'public-state', clientIp(request), {
      limit: PUBLIC_STATE_MAX_REQUESTS,
      windowMs: PUBLIC_STATE_WINDOW_MS,
    })
    if (rate.limited) {
      return rateLimitedResponse('Too many requests. Try again shortly.', rate.retryAfterSeconds)
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
