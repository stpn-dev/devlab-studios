import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { getPlayer, updatePlayer } from '../../../../worker/repositories/pickleball/players.js'
import { updatePlayerSchema } from '../../../../lib/schemas/pickleball/players'
import { getEnv } from '../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  const id = params.id as string
  try {
    const session = await requirePickleballSession(request, env)
    const player = await getPlayer(env.PICKLEBALL_DB, id, session.activeOrgId)
    if (!player) return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 })
    return new Response(JSON.stringify({ player }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}

export const PUT: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  const id = params.id as string
  try {
    const session = await requirePickleballSession(request, env)
    if (!can(session.role, 'MANAGE_PLAYERS')) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), { status: 403 })
    }

    const result = updatePlayerSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return new Response(JSON.stringify({ error: 'Validation failed.', issues: result.error.issues }), { status: 400 })
    }

    const player = await updatePlayer(env.PICKLEBALL_DB, id, session.activeOrgId, result.data)
    if (!player) return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 })
    return new Response(JSON.stringify({ player }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}
