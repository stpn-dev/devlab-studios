/**
 * Publicly published business contacts, and the evidence for where each was
 * published.
 *
 * Provenance is an ADMISSION REQUIREMENT here, not metadata: `source_url` and
 * `source_type` are NOT NULL, and this file has no code path that writes a
 * contact without them. The `source_type` CHECK has no `inferred` value by
 * design — an address derived from a name pattern rather than observed on a
 * page cannot be represented in this table at all.
 */

import { normalizeEmail } from '../domain/domains.js'
import { CONTACTS } from '../config/defaults.js'
import { newId, nowIso, operationError, toInt } from './helpers.js'

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    leadId: row.lead_id,
    companyId: row.company_id,
    email: row.email,
    fullName: row.full_name,
    roleTitle: row.role_title,
    emailType: row.email_type,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    publishedPublicly: row.published_publicly === 1,
    isBusinessContact: row.is_business_contact === 1,
    syntaxValid: row.syntax_valid === 1,
    domainMatchesCompany: row.domain_matches_company === 1,
    // Tri-state on purpose: null means "not checked", which is different from
    // "checked, no MX". The UI distinguishes them.
    mxPresent: row.mx_present === null ? null : row.mx_present === 1,
    mxCheckedAt: row.mx_checked_at,
    isPrimary: row.is_primary === 1,
    discoveredAt: row.discovered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Stores a discovered contact.
 *
 * Idempotent on `(lead_id, email)`. Re-running contact discovery over the same
 * pages must not produce duplicates, and a second sighting of the same address
 * on a different page is not new information worth a second row.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ leadId, companyId, email, fullName?, roleTitle?, emailType?, sourceUrl,
 *           sourceType, publishedPublicly?, isBusinessContact?, syntaxValid?,
 *           domainMatchesCompany?, mxPresent?, isPrimary? }} input
 */
export async function upsertContact(db, input) {
  const email = normalizeEmail(input.email)
  if (!email) throw operationError('A valid email address is required.', 422)
  if (!input.sourceUrl) throw operationError('A contact cannot be stored without its source URL.', 422)
  if (!input.sourceType) throw operationError('A contact cannot be stored without its source type.', 422)

  const localPart = email.slice(0, email.indexOf('@'))
  if (CONTACTS.excludedLocalParts.includes(localPart)) {
    throw operationError(`"${localPart}@" is not a business-development contact address.`, 422)
  }

  const now = nowIso()
  const existing = await db
    .prepare('SELECT * FROM lead_contacts WHERE lead_id = ? AND email = ?')
    .bind(input.leadId, email)
    .first()

  if (existing) {
    // Enrichment only. A later sighting can add an MX result or a name, but
    // must not downgrade provenance that is already recorded.
    await db
      .prepare(
        `UPDATE lead_contacts
         SET full_name = COALESCE(full_name, ?), role_title = COALESCE(role_title, ?),
             mx_present = COALESCE(?, mx_present),
             mx_checked_at = CASE WHEN ? IS NULL THEN mx_checked_at ELSE ? END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.fullName ?? null, input.roleTitle ?? null,
        input.mxPresent === undefined || input.mxPresent === null ? null : toInt(input.mxPresent),
        input.mxPresent === undefined || input.mxPresent === null ? null : now,
        now, now, existing.id,
      )
      .run()

    const refreshed = await db.prepare('SELECT * FROM lead_contacts WHERE id = ?').bind(existing.id).first()
    return { contact: mapRow(refreshed), created: false }
  }

  const id = newId()
  await db
    .prepare(
      `INSERT OR IGNORE INTO lead_contacts
         (id, lead_id, company_id, email, full_name, role_title, email_type, source_url, source_type,
          published_publicly, is_business_contact, syntax_valid, domain_matches_company,
          mx_present, mx_checked_at, is_primary, discovered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, input.leadId, input.companyId, email, input.fullName ?? null, input.roleTitle ?? null,
      input.emailType || 'role', input.sourceUrl, input.sourceType,
      toInt(input.publishedPublicly !== false), toInt(input.isBusinessContact !== false),
      toInt(input.syntaxValid !== false), toInt(input.domainMatchesCompany === true),
      input.mxPresent === undefined || input.mxPresent === null ? null : toInt(input.mxPresent),
      input.mxPresent === undefined || input.mxPresent === null ? null : now,
      toInt(input.isPrimary === true), now, now, now,
    )
    .run()

  const stored = await db
    .prepare('SELECT * FROM lead_contacts WHERE lead_id = ? AND email = ?')
    .bind(input.leadId, email)
    .first()

  return { contact: mapRow(stored), created: stored?.id === id }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listContacts(db, leadId) {
  const result = await db
    .prepare('SELECT * FROM lead_contacts WHERE lead_id = ? ORDER BY is_primary DESC, created_at ASC')
    .bind(leadId)
    .all()
  return (result.results || []).map(mapRow)
}

/**
 * The address outreach would actually use.
 *
 * Prefers the explicitly primary contact, then a role address over a named
 * one — a role address is unambiguously published for business contact and
 * holds less personal data, which is the preference both the privacy and the
 * deliverability arguments point at.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function getPrimaryContact(db, leadId) {
  const row = await db
    .prepare(
      `SELECT * FROM lead_contacts
       WHERE lead_id = ?
       ORDER BY is_primary DESC,
                CASE email_type WHEN 'role' THEN 0 WHEN 'generic' THEN 1 ELSE 2 END,
                created_at ASC
       LIMIT 1`,
    )
    .bind(leadId)
    .first()
  return mapRow(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function setPrimaryContact(db, leadId, contactId) {
  await db.batch([
    db.prepare('UPDATE lead_contacts SET is_primary = 0, updated_at = ? WHERE lead_id = ?').bind(nowIso(), leadId),
    db.prepare('UPDATE lead_contacts SET is_primary = 1, updated_at = ? WHERE id = ? AND lead_id = ?').bind(nowIso(), contactId, leadId),
  ])
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function deleteContact(db, leadId, contactId) {
  await db.prepare('DELETE FROM lead_contacts WHERE id = ? AND lead_id = ?').bind(contactId, leadId).run()
}

/**
 * Finds the lead a inbound address belongs to.
 *
 * Used by mailbox sync to match a reply to a conversation when no thread
 * identifier is available. Most recent first, because the same address can
 * legitimately appear on two leads (two campaigns, one business) and the newest
 * conversation is the one a reply almost certainly belongs to.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} email
 */
export async function findContactsByEmail(db, email) {
  const normalized = normalizeEmail(email)
  if (!normalized) return []

  const result = await db
    .prepare(
      `SELECT c.* FROM lead_contacts c
       JOIN lead_leads l ON l.id = c.lead_id
       WHERE c.email = ?
       ORDER BY l.updated_at DESC`,
    )
    .bind(normalized)
    .all()

  return (result.results || []).map(mapRow)
}
