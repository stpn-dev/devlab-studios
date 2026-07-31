import type { APIRoute } from 'astro'
import { listLeads } from '../../../../worker/repositories/leads.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../lib/http'

export const GET: APIRoute = async ({ url }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const status = url.searchParams.get('status') || null
  const limit = Number(url.searchParams.get('limit')) || 100
  const leads = await listLeads(env.DB, { status, limit })
  return jsonResponse(leads)
}
