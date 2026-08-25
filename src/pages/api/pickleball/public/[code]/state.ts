import type { APIRoute } from 'astro'
import { getSessionByPublicCode } from '../../../../../worker/repositories/pickleball/publicSessionTokens.js'
import { buildSessionSnapshot } from '../../../../../worker/pickleball/sessionSnapshot.js'
import { toPublicSessionView } from '../../../../../lib/pickleball/publicSessionView'
import { jsonResponse } from '../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../lib/env'

// Spec §9's degraded path: if a client's socket is down, poll this every
// 5s instead of a blank screen. Reuses the SAME buildSessionSnapshot +
// toPublicSessionView pipeline the WebSocket public channel uses, so
// there is exactly one "what does the public see" pipeline, not two that
// could drift.
export const GET: APIRoute = async ({ params }) => {
  const env = getEnv()
  try {
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
    return jsonResponse(toPublicSessionView({ ...snapshot, session }), 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
