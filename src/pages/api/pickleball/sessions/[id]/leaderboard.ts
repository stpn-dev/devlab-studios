import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { getSession } from '../../../../../worker/repositories/pickleball/sessions.js'
import { listLeaderboard } from '../../../../../worker/repositories/pickleball/playerPerformanceSnapshots.js'
import { confidenceTier } from '../../../../../lib/pickleball/opi'
import { jsonResponse } from '../../../../../worker/utils/responses.js'
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

    const rows = await listLeaderboard(env.PICKLEBALL_DB, session.activeOrgId, 'SESSION', sessionId, minGames)
    const leaderboard = rows.map((row: { playerId: string; displayName: string; opi: number; eligibleGamesCount: number }) => ({
      playerId: row.playerId,
      displayName: row.displayName,
      opi: row.opi,
      eligibleGamesCount: row.eligibleGamesCount,
      confidenceTier: confidenceTier(row.eligibleGamesCount),
    }))

    return jsonResponse({ leaderboard }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
