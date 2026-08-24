import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { listPlayers, createPlayer } from '../../../../worker/repositories/pickleball/players.js'
import { createPlayerSchema } from '../../../../lib/schemas/pickleball/players'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const players = await listPlayers(env.PICKLEBALL_DB, session.activeOrgId)
    return jsonResponse({ players }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!can(session.role, 'MANAGE_PLAYERS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = createPlayerSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const player = await createPlayer(env.PICKLEBALL_DB, { organizationId: session.activeOrgId, ...result.data })
    return jsonResponse({ player }, 201)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
