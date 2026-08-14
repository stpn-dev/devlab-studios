import type { APIRoute } from 'astro'
import { listLeads } from '../../../../worker/repositories/leads.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../lib/http'

export const GET: APIRoute = async ({ url }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const status = url.searchParams.get('status') || null
  // SQLite treats a negative LIMIT as "no limit", so a requested value must
  // be clamped to a positive range — but an absent param must still fall
  // back to the default rather than being coerced to 0 (Number(null) is 0,
  // which is finite, so a naive isFinite guard let a missing param through
  // as an explicit "limit 1" instead of the intended default).
  const limitParam = url.searchParams.get('limit')
  const requestedLimit = limitParam === null ? NaN : Number(limitParam)
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100
  const leads = await listLeads(env.DB, { status, limit })
  return jsonResponse(leads)
}
