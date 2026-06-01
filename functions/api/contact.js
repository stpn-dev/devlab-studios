const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_BODY_LENGTH = 10_000
const MAX_LENGTHS = {
  email: 254,
  message: 5_000,
  name: 120,
  subject: 200,
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  })
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
  })
}

export async function onRequestPost(context) {
  const webhookUrl = context.env.ZOHO_WEBHOOK_URL

  if (!webhookUrl) {
    return jsonResponse(500, {
      error: 'Server misconfiguration: ZOHO_WEBHOOK_URL missing.',
    })
  }

  let payload
  let rawBody

  try {
    rawBody = await context.request.text()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload.' })
  }

  if (!rawBody || rawBody.length > MAX_BODY_LENGTH) {
    return jsonResponse(413, { error: 'Payload too large.' })
  }

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload.' })
  }

  const sanitizedPayload = {
    email: String(payload.email || '').trim(),
    message: String(payload.message || '').trim(),
    name: String(payload.name || '').trim(),
    source: String(payload.source || '').trim(),
    subject: String(payload.subject || '').trim(),
  }

  const requiredFields = ['name', 'email', 'subject', 'message']
  const missingFields = requiredFields.filter((field) => !sanitizedPayload[field])

  if (missingFields.length > 0) {
    return jsonResponse(400, {
      error: `Missing required fields: ${missingFields.join(', ')}`,
    })
  }

  if (!EMAIL_PATTERN.test(sanitizedPayload.email)) {
    return jsonResponse(400, { error: 'Invalid email address.' })
  }

  const oversizedField = Object.entries(MAX_LENGTHS).find(
    ([field, maxLength]) => sanitizedPayload[field].length > maxLength,
  )

  if (oversizedField) {
    return jsonResponse(400, {
      error: `${oversizedField[0]} exceeds the allowed length.`,
    })
  }

  try {
    const upstreamResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sanitizedPayload),
      signal: AbortSignal.timeout(10_000),
    })

    if (!upstreamResponse.ok) {
      return jsonResponse(502, { error: 'Unable to process the request.' })
    }

    return jsonResponse(200, { ok: true })
  } catch {
    return jsonResponse(502, { error: 'Unable to process the request.' })
  }
}