/**
 * First-party tracking tokens and click events.
 *
 * No tracking pixels exist anywhere in this system. An email open is not
 * recorded, because it is not actionable and recording it means embedding a
 * resource in someone's inbox. A CLICK, by contrast, is a deliberate act by the
 * recipient on a link they chose to follow — and it is the only signal here
 * that leads anywhere useful (a contact-form conversion).
 *
 * Destinations are validated against a code-level allow-list at BOTH write and
 * redirect time, so an open redirect needs a database write AND a code change.
 */

import { TRACKING } from '../config/defaults.js'
import { bounded, newId, nowIso, operationError } from './helpers.js'

/**
 * A cryptographically random, non-sequential token.
 *
 * base64url over 32 random bytes: unguessable, and it reveals nothing about how
 * many leads exist or who they are. A sequential id in a URL would leak both.
 */
function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(TRACKING.tokenBytes))
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/**
 * Whether a URL is an allowed redirect destination.
 *
 * Exact hostname match against the allow-list, and https only. A suffix check
 * (`endsWith('devlabstudios.com')`) would accept
 * `evil-devlabstudios.com` — that is the classic open-redirect bypass and the
 * reason this is a Set membership test rather than string matching.
 *
 * @param {string} url
 * @param {readonly string[]} [allowedHosts]
 */
export function isAllowedDestination(url, allowedHosts = TRACKING.allowedHosts) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  return allowedHosts.includes(parsed.hostname.toLowerCase())
}

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    token: row.token,
    leadId: row.lead_id,
    campaignId: row.campaign_id,
    draftId: row.draft_id,
    destinationUrl: row.destination_url,
    label: row.label,
    clickCount: Number(row.click_count),
    firstClickedAt: row.first_clicked_at,
    lastClickedAt: row.last_clicked_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ leadId, campaignId?, draftId?, destinationUrl, label?, expiryDays?, allowedHosts? }} input
 */
export async function createTrackingToken(db, input) {
  if (!isAllowedDestination(input.destinationUrl, input.allowedHosts)) {
    throw operationError(`"${input.destinationUrl}" is not an allowed tracking destination.`, 422)
  }

  const id = newId()
  const token = generateToken()
  const expiryDays = input.expiryDays ?? TRACKING.defaultExpiryDays
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()

  await db
    .prepare(
      `INSERT INTO lead_tracking_tokens
         (id, token, lead_id, campaign_id, draft_id, destination_url, label, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, token, input.leadId, input.campaignId ?? null, input.draftId ?? null,
      input.destinationUrl, input.label ? bounded(input.label, 120) : null, expiresAt, nowIso(),
    )
    .run()

  return mapRow(await db.prepare('SELECT * FROM lead_tracking_tokens WHERE id = ?').bind(id).first())
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function findTrackingToken(db, token) {
  if (!token || typeof token !== 'string' || token.length > 128) return null
  const row = await db.prepare('SELECT * FROM lead_tracking_tokens WHERE token = ?').bind(token).first()
  return mapRow(row)
}

/**
 * Records a click and returns the destination, or null when the token is not
 * usable.
 *
 * Re-validates the destination against the allow-list even though it was
 * validated at creation. The stored row could have been changed by a direct
 * database edit or a future code path; the cost of re-checking is a URL parse,
 * and the cost of not checking is an open redirect on a public endpoint.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} token
 * @param {{ referrer?: string|null, userAgent?: string|null }} [context]
 * @returns {Promise<{ destinationUrl: string, leadId: string, tokenId: string }|null>}
 */
export async function recordClick(db, token, context = {}) {
  const entry = await findTrackingToken(db, token)
  if (!entry) return null
  if (entry.revokedAt) return null
  if (entry.expiresAt && entry.expiresAt < nowIso()) return null
  if (!isAllowedDestination(entry.destinationUrl)) return null

  const now = nowIso()
  await db.batch([
    db
      .prepare(
        `UPDATE lead_tracking_tokens
         SET click_count = click_count + 1,
             first_clicked_at = COALESCE(first_clicked_at, ?),
             last_clicked_at = ?
         WHERE id = ?`,
      )
      .bind(now, now, entry.id),
    db
      .prepare(
        `INSERT INTO lead_tracking_events
           (id, token_id, lead_id, event_type, destination_url, referrer, user_agent, created_at)
         VALUES (?, ?, ?, 'click', ?, ?, ?, ?)`,
      )
      .bind(
        newId(), entry.id, entry.leadId, entry.destinationUrl,
        context.referrer ? bounded(context.referrer, 500) : null,
        context.userAgent ? bounded(context.userAgent, 300) : null,
        now,
      ),
  ])

  return { destinationUrl: entry.destinationUrl, leadId: entry.leadId, tokenId: entry.id }
}

/**
 * Attributes an inbound contact-form submission to a previously tracked lead.
 *
 * `inboundLeadId` points at the site's own `leads` table and is deliberately
 * NOT a foreign key: that table belongs to the public contact form, and this
 * engine must never be able to block or cascade a delete there.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function recordContactFormConversion(db, { tokenId, leadId, inboundLeadId, destinationUrl = null }) {
  await db
    .prepare(
      `INSERT INTO lead_tracking_events
         (id, token_id, lead_id, event_type, inbound_lead_id, destination_url, created_at)
       VALUES (?, ?, ?, 'contact_form_conversion', ?, ?, ?)`,
    )
    .bind(newId(), tokenId, leadId, inboundLeadId, destinationUrl, nowIso())
    .run()
}

/**
 * Finds a recent click that a contact-form submission could be attributed to.
 *
 * Bounded by the attribution window so an ancient click is not credited with a
 * conversion that has nothing to do with it.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function findRecentClickForToken(db, token, { windowDays = TRACKING.attributionWindowDays } = {}) {
  const entry = await findTrackingToken(db, token)
  if (!entry || entry.revokedAt) return null

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  const row = await db
    .prepare(
      `SELECT id FROM lead_tracking_events
       WHERE token_id = ? AND event_type = 'click' AND created_at >= ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(entry.id, since)
    .first()

  return row ? { tokenId: entry.id, leadId: entry.leadId } : null
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listTrackingTokens(db, leadId) {
  const result = await db
    .prepare('SELECT * FROM lead_tracking_tokens WHERE lead_id = ? ORDER BY created_at DESC')
    .bind(leadId)
    .all()
  return (result.results || []).map(mapRow)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function revokeTrackingToken(db, id) {
  await db.prepare('UPDATE lead_tracking_tokens SET revoked_at = ? WHERE id = ?').bind(nowIso(), id).run()
}
