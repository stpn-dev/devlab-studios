import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../lib/pickleball/permissions'
import { listPlayers, createPlayer } from '../../../../worker/repositories/pickleball/players.js'
import { createPlayerSchema } from '../../../../lib/schemas/pickleball/players'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, apiErrorResponse, forbiddenResponse } from '../../../../worker/utils/responses.js'

// `players` stays the top-level field it always was, so any existing caller
// keeps working -- it is now one page of results rather than the entire
// roster, with `total`/`hasMore` alongside for callers that page.
export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const url = new URL(request.url)

    const page = await listPlayers(env.PICKLEBALL_DB, session.activeOrgId, {
      search: url.searchParams.get('search') ?? '',
      // Parsed leniently and clamped in the repository: a garbage `limit` is a
      // malformed query string, not something worth 400-ing an operator over,
      // and the clamp is what actually protects the query.
      limit: Number(url.searchParams.get('limit')) || undefined,
      offset: Number(url.searchParams.get('offset')) || 0,
    })

    return jsonResponse(page, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!hasPermission(session, 'MANAGE_PLAYERS')) {
      return await forbiddenResponse(request)
    }

    const result = createPlayerSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const player = await createPlayer(env.PICKLEBALL_DB, { organizationId: session.activeOrgId, ...result.data })
    return jsonResponse({ player }, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
