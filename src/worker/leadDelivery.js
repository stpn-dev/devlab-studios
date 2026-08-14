import { updateLeadStatus } from './repositories/leads.js'
import { countDeliveryAttempts, recordDeliveryAttempt } from './repositories/deliveryAttempts.js'

const DELIVERY_TARGET = 'resend'
const DEFAULT_SENDER = 'hello@devlabstudios.com'

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** @param {{ name: string, email: string, subject: string, message: string }} lead */
function buildLeadEmail(lead) {
  const text = [
    `New contact form submission from ${lead.name} <${lead.email}>`,
    '',
    `Subject: ${lead.subject}`,
    '',
    lead.message,
  ].join('\n')

  const html = `
    <p>New contact form submission from <strong>${escapeHtml(lead.name)}</strong> &lt;${escapeHtml(lead.email)}&gt;</p>
    <p><strong>Subject:</strong> ${escapeHtml(lead.subject)}</p>
    <p>${escapeHtml(lead.message).replace(/\n/g, '<br>')}</p>
  `.trim()

  return { text, html }
}

/**
 * Attempts to deliver a lead notification via Resend and records the
 * outcome — called both from the contact API's background waitUntil()
 * task (first attempt) and the admin "Retry" action (any later attempt),
 * so both paths share identical logging/status behavior.
 *
 * @param {{ DB: import('@cloudflare/workers-types').D1Database, RESEND_API_KEY?: string, RESEND_FROM_EMAIL?: string, LEAD_NOTIFICATION_EMAIL?: string }} env
 * @param {{ id: string, name: string, email: string, subject: string, message: string }} lead
 */
export async function attemptLeadDelivery(env, lead) {
  const attemptNumber = (await countDeliveryAttempts(env.DB, lead.id)) + 1
  const startedAt = Date.now()

  if (!env.RESEND_API_KEY) {
    await recordDeliveryAttempt(env.DB, {
      leadId: lead.id,
      target: DELIVERY_TARGET,
      attemptNumber,
      status: 'failure',
      errorMessage: 'RESEND_API_KEY is not configured.',
    })
    await updateLeadStatus(env.DB, lead.id, 'failed')
    console.log(JSON.stringify({ event: 'lead_delivery', outcome: 'failure', leadId: lead.id, attemptNumber, reason: 'missing_api_key' }))
    return { ok: false }
  }

  const fromEmail = env.RESEND_FROM_EMAIL || DEFAULT_SENDER
  const toEmail = env.LEAD_NOTIFICATION_EMAIL || DEFAULT_SENDER
  const { text, html } = buildLeadEmail(lead)

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `DevLab Studios <${fromEmail}>`,
        to: [toEmail],
        reply_to: lead.email,
        subject: `New contact form lead: ${lead.subject}`,
        text,
        html,
      }),
    })

    const durationMs = Date.now() - startedAt
    const body = await response.json().catch(() => null)

    if (response.ok && body?.id) {
      await recordDeliveryAttempt(env.DB, { leadId: lead.id, target: DELIVERY_TARGET, attemptNumber, status: 'success', statusCode: response.status })
      await updateLeadStatus(env.DB, lead.id, 'delivered')
      console.log(JSON.stringify({ event: 'lead_delivery', outcome: 'success', leadId: lead.id, attemptNumber, durationMs, statusCode: response.status, resendId: body.id }))
      return { ok: true }
    }

    const errorMessage = body?.message || `Upstream returned ${response.status}`
    await recordDeliveryAttempt(env.DB, { leadId: lead.id, target: DELIVERY_TARGET, attemptNumber, status: 'failure', statusCode: response.status, errorMessage })
    await updateLeadStatus(env.DB, lead.id, 'failed')
    console.log(JSON.stringify({ event: 'lead_delivery', outcome: 'failure', leadId: lead.id, attemptNumber, durationMs, statusCode: response.status, errorMessage }))
    return { ok: false }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await recordDeliveryAttempt(env.DB, { leadId: lead.id, target: DELIVERY_TARGET, attemptNumber, status: 'failure', errorMessage })
    await updateLeadStatus(env.DB, lead.id, 'failed')
    console.log(JSON.stringify({ event: 'lead_delivery', outcome: 'failure', leadId: lead.id, attemptNumber, durationMs, errorMessage }))
    return { ok: false }
  }
}
