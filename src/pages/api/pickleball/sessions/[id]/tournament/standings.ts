import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { listTournamentStandings, listFixtures } from '../../../../../../worker/repositories/pickleball/tournaments.js'
import { rankTournamentStandings } from '../../../../../../lib/pickleball/tournament/rankTournamentStandings'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

// Spec §3.7: tournament standings are NOT OPI standings -- wins, losses,
// point differential, then head-to-head, computed entirely from
// tournament_fixtures + games (tournaments.js's listTournamentStandings),
// never player_game_stats.eligible_for_opi (task-8-brief.md's named trap).
// listFixtures is fetched alongside purely to give rankTournamentStandings
// the head-to-head data it needs -- this route does no ranking itself.
export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const [rows, fixtures] = await Promise.all([
      listTournamentStandings(env.PICKLEBALL_DB, params.id as string),
      listFixtures(env.PICKLEBALL_DB, params.id as string),
    ])
    const standings = rankTournamentStandings(rows, fixtures)

    return jsonResponse({ standings }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
