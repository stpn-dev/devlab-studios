import { updateLeadStatus } from './repositories/leads.js'
import { countDeliveryAttempts, recordDeliveryAttempt } from './repositories/deliveryAttempts.js'

/**
 * Attempts to deliver a lead to the configured downstream target (Zoho)
 * and records the outcome — called both from the contact API's background
 * waitUntil() task (first attempt) and the admin "Retry" action (any
 * later attempt), so both paths share identical logging/status behavior.
 *
 * @param {{ DB: import('@cloudflare/workers-types').D1Database, ZOHO_WEBHOOK_URL?: string }} env
 * @param {{ id: string, name: string, email: string, subject: string, message: string }} lead
 */
export async function attemptLeadDelivery(env, lead) {
  const attemptNumber = (await countDeliveryAttempts(env.DB, lead.id)) + 1
  const startedAt = Date.now()

  if (!env.ZOHO_WEBHOOK_URL) {
    await recordDeliveryAttempt(env.DB, {
      leadId: lead.id,
      attemptNumber,
      status: 'failure',
      errorMessage: 'ZOHO_WEBHOOK_URL is not configured.',
    })
    await updateLeadStatus(env.DB, lead.id, 'failed')
    console.log(JSON.stringify({ event: 'lead_delivery', outcome: 'failure', leadId: lead.id, attemptNumber, reason: 'missing_webhook_url' }))
    return { ok: false }
  }

  try {
    const response = await fetch(env.ZOHO_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: lead.name, email: lead.email, subject: lead.subject, message: lead.message }),
    })

    const durationMs = Date.now() - startedAt

    if (response.ok) {
      await recordDeliveryAttempt(env.DB, { leadId: lead.id, attemptNumber, status: 'success', statusCode: response.status })
      await updateLeadStatus(env.DB, lead.id, 'delivered')
      console.log(JSON.stringify({ event: 'lead_delivery', outcome: 'success', leadId: lead.id, attemptNumber, durationMs, statusCode: response.status }))
      return { ok: true }
    }

    await recordDeliveryAttempt(env.DB, { leadId: lead.id, attemptNumber, status: 'failure', statusCode: response.status, errorMessage: `Upstream returned ${response.status}` })
    await updateLeadStatus(env.DB, lead.id, 'failed')
    console.log(JSON.stringify({ event: 'lead_delivery', outcome: 'failure', leadId: lead.id, attemptNumber, durationMs, statusCode: response.status }))
    return { ok: false }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await recordDeliveryAttempt(env.DB, { leadId: lead.id, attemptNumber, status: 'failure', errorMessage })
    await updateLeadStatus(env.DB, lead.id, 'failed')
    console.log(JSON.stringify({ event: 'lead_delivery', outcome: 'failure', leadId: lead.id, attemptNumber, durationMs, errorMessage }))
    return { ok: false }
  }
}
