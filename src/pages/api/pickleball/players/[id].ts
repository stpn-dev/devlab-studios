import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { getPlayer, updatePlayer } from '../../../../worker/repositories/pickleball/players.js'
import { updatePlayerSchema } from '../../../../lib/schemas/pickleball/players'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  const id = params.id as string
  try {
    const session = await requirePickleballSession(request, env)
    const player = await getPlayer(env.PICKLEBALL_DB, id, session.activeOrgId)
    if (!player) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ player }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}

export const PUT: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  const id = params.id as string
  try {
    const session = await requirePickleballSession(request, env)
    if (!can(session.role, 'MANAGE_PLAYERS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = updatePlayerSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const player = await updatePlayer(env.PICKLEBALL_DB, id, session.activeOrgId, result.data)
    if (!player) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ player }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
