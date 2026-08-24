import type { APIRoute } from 'astro'
import { buildClearCookieHeader, SESSION_COOKIE_NAME } from '../../../../worker/pickleball/session.js'

export const POST: APIRoute = async ({ request }) => {
  const secure = new URL(request.url).protocol === 'https:'
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Set-Cookie': buildClearCookieHeader(SESSION_COOKIE_NAME, { secure }) },
  })
}
