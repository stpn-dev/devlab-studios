import type { APIRoute } from 'astro'
import { buildClearCookieHeader, SESSION_COOKIE_NAME } from '../../../../worker/pickleball/session.js'
import { jsonResponse } from '../../../../worker/utils/responses.js'

export const POST: APIRoute = async ({ request }) => {
  const secure = new URL(request.url).protocol === 'https:'
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': buildClearCookieHeader(SESSION_COOKIE_NAME, { secure }),
  })
}
