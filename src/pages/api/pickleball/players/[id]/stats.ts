import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { getPlayer } from '../../../../../worker/repositories/pickleball/players.js'
import { getPlayerSnapshot } from '../../../../../worker/repositories/pickleball/playerPerformanceSnapshots.js'
import { confidenceTier } from '../../../../../lib/pickleball/opi'
import { jsonResponse, apiErrorResponse } from '../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../lib/env'

function toDto(snapshot: { opi: number; eligibleGamesCount: number } | null, extra: Record<string, unknown> = {}) {
  if (!snapshot) return null
  return { ...extra, opi: snapshot.opi, eligibleGamesCount: snapshot.eligibleGamesCount, confidenceTier: confidenceTier(snapshot.eligibleGamesCount) }
}

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const playerId = params.id as string
    const player = await getPlayer(env.PICKLEBALL_DB, playerId, session.activeOrgId)
    if (!player) return jsonResponse({ error: 'Not found.' }, 404)

    const allTimeSnapshot = await getPlayerSnapshot(env.PICKLEBALL_DB, playerId, 'ALL_TIME', null)

    const sessionRows = await env.PICKLEBALL_DB
      .prepare(
        `SELECT s.opi, s.eligible_games_count, ps.id AS session_id, ps.name AS session_name
         FROM player_performance_snapshots s
         JOIN pickleball_sessions ps ON ps.id = s.scope_id
         WHERE s.player_id = ? AND s.scope_type = 'SESSION' AND ps.organization_id = ?
         ORDER BY ps.created_at DESC`,
      )
      .bind(playerId, session.activeOrgId)
      .all<{ opi: number; eligible_games_count: number; session_id: string; session_name: string }>()

    const sessions = (sessionRows.results || []).map((row) => ({
      sessionId: row.session_id,
      sessionName: row.session_name,
      opi: row.opi,
      eligibleGamesCount: row.eligible_games_count,
      confidenceTier: confidenceTier(row.eligible_games_count),
    }))

    return jsonResponse({ allTime: toDto(allTimeSnapshot), sessions }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
