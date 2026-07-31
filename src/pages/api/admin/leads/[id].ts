import type { APIRoute } from 'astro'
import { getLead } from '../../../../worker/repositories/leads.js'
import { listDeliveryAttempts } from '../../../../worker/repositories/deliveryAttempts.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../lib/http'

export const GET: APIRoute = async ({ params }) => {
  const id = params.id as string
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const lead = await getLead(env.DB, id)
  if (!lead) return jsonResponse({ error: 'Lead not found.' }, 404)

  const attempts = await listDeliveryAttempts(env.DB, id)
  return jsonResponse({ ...lead, attempts })
}
