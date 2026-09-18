import type { APIRoute } from 'astro'
import { getEnv } from '../../lib/env'
import { resolveFlags } from '../../lead-engine/config/flags.js'
import { TRACKING } from '../../lead-engine/config/defaults.js'
import { isAllowedDestination, recordClick } from '../../lead-engine/repositories/tracking.js'
import { ACTIVITY } from '../../lead-engine/domain/activity.js'
import { recordActivity } from '../../lead-engine/repositories/activity.js'

export const prerender = false

/**
 * First-party tracked redirect: `/r/:token`.
 *
 * A PUBLIC endpoint — the person following the link has not signed in to
 * anything, and the token is all the authority there is. Three properties it
 * has to hold:
 *
 *   1. NO OPEN REDIRECT. The destination is validated against a code-level
 *      host allow-list at redirect time, not merely when the token was
 *      created. An attacker who could write a row in `lead_tracking_tokens`
 *      still cannot redirect anyone off-site without also changing the code.
 *   2. NO ENUMERATION. An invalid, expired or revoked token gets exactly the
 *      same answer as an unknown one — a redirect to the site root. No 404
 *      distinguishing a real token from a fake, and no error page that says
 *      "expired", which would confirm the token existed.
 *   3. NO PIXEL, NO PROFILE. A click is recorded; nothing else is. The
 *      attribution cookie is first-party, opaque, and holds only the token.
 */

/** Where an unusable token goes. Deliberately the same for every failure mode. */
const FALLBACK = 'https://www.devlabstudios.com/'

function redirectTo(destination: string, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      // A tracked link must not be cached by an intermediary: the click is the
      // thing being recorded, and a cached 302 records nothing.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      // The destination is our own site; the referrer would leak the token to
      // it, and the token identifies a specific prospect.
      'Referrer-Policy': 'no-referrer',
      ...headers,
    },
  })
}

export const GET: APIRoute = async ({ params, request }) => {
  const env = getEnv()
  const flags = resolveFlags(env)

  // With tracking off, or no database, the link still WORKS — it just records
  // nothing. A prospect clicking a link in an email must never see an error
  // because of how this system is configured.
  if (!flags.tracking || !env.DB) return redirectTo(FALLBACK)

  const token = String(params.token ?? '')
  if (!token || token.length > 128) return redirectTo(FALLBACK)

  let click: { destinationUrl: string; leadId: string; tokenId: string } | null = null
  try {
    click = await recordClick(env.DB, token, {
      referrer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent'),
    })
  } catch {
    // A database failure must not break the link. The click is lost; the
    // prospect still reaches the page they asked for.
    return redirectTo(FALLBACK)
  }

  if (!click) return redirectTo(FALLBACK)

  // Re-validated here as well as in `recordClick`. Cheap, and it is the last
  // thing standing between a tampered row and an open redirect.
  if (!isAllowedDestination(click.destinationUrl, TRACKING.allowedHosts)) return redirectTo(FALLBACK)

  try {
    await recordActivity(env.DB, {
      leadId: click.leadId,
      eventType: ACTIVITY.TRACKED_LINK_CLICKED,
      summary: 'Clicked a tracked link.',
      metadata: { destination: click.destinationUrl },
    })
  } catch {
    // Same reasoning: the timeline entry is not worth failing the redirect for.
  }

  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''

  return redirectTo(click.destinationUrl, {
    // First-party, HttpOnly, opaque. It carries the token and nothing else, so
    // a later contact-form submission can be attributed without the browser
    // ever holding a lead id or an email address.
    'Set-Cookie': `${TRACKING.attributionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${TRACKING.attributionWindowDays * 24 * 60 * 60}`,
  })
}
