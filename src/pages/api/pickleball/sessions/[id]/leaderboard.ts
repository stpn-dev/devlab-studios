import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { getSession } from '../../../../../worker/repositories/pickleball/sessions.js'
import { listSessionStandings } from '../../../../../worker/repositories/pickleball/sessionStandings.js'
import { rankStandings } from '../../../../../lib/pickleball/standings'
import { jsonResponse, apiErrorResponse } from '../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../lib/env'

export const GET: APIRoute = async ({ request, params, url }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const sessionId = params.id as string
    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    // Number(null) is 0 (finite), so a naive isFinite guard would let an
    // ABSENT param through as an explicit "0" instead of the session's real
    // default -- the null check must come first. A present-but-garbage value
    // (e.g. "abc") parses to NaN and falls back to the session default too,
    // rather than silently comparing against SQL NULL and returning an
    // empty leaderboard that's indistinguishable from "nobody qualifies."
    const minGamesParam = url.searchParams.get('minGames')
    const parsedMinGames = minGamesParam === null ? NaN : Number(minGamesParam)
    const minGames = Number.isFinite(parsedMinGames) && parsedMinGames >= 0 ? parsedMinGames : pickleballSession.leaderboardMinGames

    // The full attending roster, ranked -- players below the threshold (a
    // brand-new session's entire roster) come back too, flagged
    // `qualified: false` with a null rank, so the board is never blank while
    // a session is under way. `minGames` still governs who is *ranked*, so
    // the session's configured threshold keeps its exact spec meaning.
    const rows = await listSessionStandings(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    const leaderboard = rankStandings(rows, minGames)

    return jsonResponse({ leaderboard, minGames }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
