/**
 * Contact-form attribution.
 *
 * When a prospect who followed a tracked link later submits the public contact
 * form, this associates that inbound submission with the outbound lead it came
 * from. That is the one place where the two halves of this system meet: the
 * site's own `leads` table (people who asked to be contacted) and
 * `lead_leads` (businesses the engine found).
 *
 * THREE RULES, all of them about not breaking the public form:
 *
 *   1. It NEVER throws. Every path is wrapped, because a contact form that
 *      fails because a CRM lookup failed is a lost customer, and the lost
 *      attribution is worth nothing by comparison.
 *   2. It NEVER changes the public response. Attribution is invisible to the
 *      submitter — no field, no header, no behaviour difference. A prospect
 *      must not be able to tell that they were in a prospecting database.
 *   3. It reads ONLY the opaque token from a first-party cookie. The cookie
 *      holds no lead id, no email and no company, so the browser never carries
 *      anything that would identify the prospect if it leaked.
 */

import { TRACKING } from '../config/defaults.js'
import { ACTIVITY } from '../domain/activity.js'
import { recordActivity } from '../repositories/activity.js'
import { findRecentClickForToken, recordContactFormConversion } from '../repositories/tracking.js'
import { resolveFlags } from '../config/flags.js'

/**
 * Reads the attribution token from a request's cookies.
 *
 * @param {Request} request
 * @returns {string|null}
 */
export function readAttributionToken(request) {
  const header = request?.headers?.get?.('Cookie')
  if (!header) return null

  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue

    const name = part.slice(0, separator).trim()
    if (name !== TRACKING.attributionCookieName) continue

    const value = decodeURIComponent(part.slice(separator + 1).trim())
    // Bounded: a cookie value is attacker-controllable, and an unbounded one
    // would become a database lookup argument.
    return value && value.length <= 128 ? value : null
  }

  return null
}

/**
 * Associates an inbound contact-form submission with a tracked outbound lead.
 *
 * @param {{ DB?: object }} env
 * @param {{ request: Request, inboundLeadId: string }} input the id of the row
 *   in the site's own `leads` table
 * @returns {Promise<{ attributed: boolean, leadId?: string }>}
 */
export async function attributeInquiry(env, { request, inboundLeadId }) {
  try {
    if (!env?.DB || !inboundLeadId) return { attributed: false }
    if (!resolveFlags(env).tracking) return { attributed: false }

    const token = readAttributionToken(request)
    if (!token) return { attributed: false }

    // Bounded by the attribution window, so a click from six months ago is not
    // credited with a conversion that has nothing to do with it.
    const click = await findRecentClickForToken(env.DB, token)
    if (!click) return { attributed: false }

    await recordContactFormConversion(env.DB, {
      tokenId: click.tokenId,
      leadId: click.leadId,
      inboundLeadId,
    })

    await recordActivity(env.DB, {
      leadId: click.leadId,
      eventType: ACTIVITY.WEBSITE_CONTACT_CONVERSION,
      summary: 'Submitted the website contact form after following a tracked link.',
      metadata: { inboundLeadId },
      // One conversion per inbound submission, whatever happens upstream.
      dedupeKey: `conversion:${inboundLeadId}`,
    })

    return { attributed: true, leadId: click.leadId }
  } catch (error) {
    // Swallowed on purpose. See rule 1 above.
    console.log(
      JSON.stringify({
        event: 'lead_engine.attribution_failed',
        error: error instanceof Error ? error.message : 'unknown',
      }),
    )
    return { attributed: false }
  }
}
