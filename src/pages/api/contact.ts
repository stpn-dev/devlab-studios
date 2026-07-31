import type { APIRoute } from 'astro'
import { getEnv } from '../../lib/env'

const CONTACT_WINDOW_MS = 10 * 60 * 1000
const CONTACT_MAX_ATTEMPTS = 5
const contactAttempts = new Map<string, { count: number; resetAt: number }>()

interface ContactPayload {
  name?: string
  email?: string
  subject?: string
  message?: string
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

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  const webhookUrl = env.ZOHO_WEBHOOK_URL
  if (!webhookUrl) {
    return jsonResponse({ error: 'Server misconfiguration: ZOHO_WEBHOOK_URL missing.' }, 500)
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

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok) {
      return jsonResponse({ error: `Zoho upstream error: ${upstream.status}` }, 502)
    }

    return jsonResponse({ ok: true })
  } catch {
    return jsonResponse({ error: 'Unable to reach Zoho endpoint.' }, 502)
  }
}
