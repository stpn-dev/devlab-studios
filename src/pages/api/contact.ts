import type { APIRoute } from 'astro'
import { getEnv } from '../../lib/env'
import { createLead, findRecentDuplicateLead } from '../../worker/repositories/leads.js'
import { attemptLeadDelivery } from '../../worker/leadDelivery.js'
import { verifyTurnstileToken } from '../../worker/turnstile.js'

const CONTACT_WINDOW_MS = 10 * 60 * 1000
const CONTACT_MAX_ATTEMPTS = 5
const contactAttempts = new Map<string, { count: number; resetAt: number }>()

interface ContactPayload {
  name?: string
  email?: string
  subject?: string
  message?: string
  turnstileToken?: string
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
}

/**
 * Fast, in-memory first line of defense — not durable across Worker
 * isolates, but cheap and catches obvious abuse before it touches D1.
 * Turnstile and the D1-backed duplicate check handle the rest.
 */
function isContactRateLimited(request: Request): boolean {
  const key = getClientIp(request)
  const now = Date.now()
  const attempt = contactAttempts.get(key)

  if (!attempt || now >= attempt.resetAt) {
    contactAttempts.set(key, { count: 1, resetAt: now + CONTACT_WINDOW_MS })
    return false
  }

  attempt.count += 1
  return attempt.count > CONTACT_MAX_ATTEMPTS
}

function validateContactPayload(payload: ContactPayload): string | null {
  const limits: Record<string, number> = { name: 120, email: 254, subject: 180, message: 5000 }
  const required = Object.keys(limits)
  const missing = required.filter((key) => !String(payload[key as keyof ContactPayload] || '').trim())
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`
  }

  const oversized = required.filter((key) => String(payload[key as keyof ContactPayload] || '').length > limits[key])
  if (oversized.length > 0) {
    return `Fields exceed maximum length: ${oversized.join(', ')}`
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email || '').trim())) {
    return 'Email address is invalid.'
  }

  return null
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv()
  if (!env.DB) {
    return jsonResponse({ error: 'Server misconfiguration: D1 DB binding missing.' }, 503)
  }

  if (isContactRateLimited(request)) {
    return jsonResponse({ error: 'Too many contact submissions. Try again later.' }, 429)
  }

  let payload: ContactPayload
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
  }

  const validationError = validateContactPayload(payload)
  if (validationError) {
    return jsonResponse({ error: validationError }, 400)
  }

  const requestHostname = new URL(request.url).hostname
  const isLocalRequest = requestHostname === 'localhost' || requestHostname === '127.0.0.1'
  const turnstileResult = await verifyTurnstileToken(
    env.TURNSTILE_SECRET_KEY,
    payload.turnstileToken,
    getClientIp(request),
    {
      expectedHostname: requestHostname,
      expectedAction: 'contact_form',
      allowMissingSecret: isLocalRequest,
    },
  )
  if (!turnstileResult.ok) {
    console.log(JSON.stringify({ event: 'contact_submission', outcome: 'turnstile_rejected', reason: turnstileResult.reason }))
    if (turnstileResult.reason === 'configuration-missing' || turnstileResult.reason === 'verification-request-failed') {
      return jsonResponse({ code: 'verification_unavailable', error: 'Verification is temporarily unavailable. Please try again later.' }, 503)
    }
    if (turnstileResult.reason === 'timeout-or-duplicate') {
      return jsonResponse({ code: 'verification_expired', error: 'Verification expired. Please try again.' }, 400)
    }
    return jsonResponse({ code: 'verification_failed', error: "We couldn't verify the request. Please retry." }, 400)
  }

  // Durability guarantee starts here: once this insert succeeds, the lead
  // survives regardless of what happens to the downstream email delivery.
  const duplicate = await findRecentDuplicateLead(env.DB, { email: payload.email, message: payload.message })
  const lead = duplicate || (await createLead(env.DB, {
    name: payload.name || '',
    email: payload.email || '',
    subject: payload.subject || '',
    message: payload.message || '',
  }))

  if (!lead) {
    return jsonResponse({ error: 'Unable to save your message. Please try again.' }, 500)
  }

  if (!duplicate) {
    // attemptLeadDelivery already catches its own errors and records them
    // as a failed attempt — this catch is only a last-resort net so a bug
    // there can never surface as an unhandled rejection in the background.
    const deliveryTask = attemptLeadDelivery(env, lead).catch((error) => {
      console.log(JSON.stringify({ event: 'lead_delivery', outcome: 'unhandled_error', leadId: lead.id, error: error instanceof Error ? error.message : String(error) }))
    })
    if (locals.cfContext) {
      locals.cfContext.waitUntil(deliveryTask)
    } else {
      // Dev fallback (astro preview / no cfContext available) — await inline
      // so the attempt still happens instead of silently never running.
      await deliveryTask
    }
  }

  return jsonResponse({ ok: true })
}
