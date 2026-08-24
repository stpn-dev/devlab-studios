import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { getSession } from '../../../../worker/repositories/pickleball/sessions.js'
import { getEnv } from '../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const record = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!record) return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 })
    return new Response(JSON.stringify({ session: record }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}
