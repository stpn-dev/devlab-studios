import type { APIRoute } from 'astro'
import { getLead } from '../../../../../worker/repositories/leads.js'
import { listDeliveryAttempts } from '../../../../../worker/repositories/deliveryAttempts.js'
import { attemptLeadDelivery } from '../../../../../worker/leadDelivery.js'
import { recordAuditEvent } from '../../../../../worker/repositories/auditLog.js'
import { getEnv } from '../../../../../lib/env'
import { jsonResponse } from '../../../../../lib/http'

export const POST: APIRoute = async ({ params, locals }) => {
  const id = params.id as string
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const lead = await getLead(env.DB, id)
  if (!lead) return jsonResponse({ error: 'Lead not found.' }, 404)

  const result = await attemptLeadDelivery(env, lead)
  await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'retry_delivery', entityType: 'leads', entityId: id, metadata: { ok: result.ok } })

  const updatedLead = await getLead(env.DB, id)
  const attempts = await listDeliveryAttempts(env.DB, id)
  return jsonResponse({ ...updatedLead, attempts })
}
