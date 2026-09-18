/**
 * The suppression registry: the hard boundary on outreach.
 *
 * A match here stops outreach generation entirely. It is checked at draft
 * generation, at Zoho draft creation AND at review-queue admission, so no
 * single missed call site can let a suppressed address through. The redundancy
 * is deliberate — this is the check that must not have a gap.
 *
 * Rows are never hard-deleted by normal operation. Removing a suppression sets
 * `removed_at`, so the history of "we suppressed this, then someone
 * unsuppressed it" survives the change.
 */

import { emailDomain, normalizeEmail } from '../domain/domains.js'
import { bounded, buildWhere, clampLimit, clampOffset, newId, nowIso, operationError } from './helpers.js'

export const SUPPRESSION_REASONS = Object.freeze([
  'unsubscribe', 'do_not_contact', 'hard_bounce', 'complaint',
  'manual_block', 'existing_client', 'competitor', 'other',
])

/** Maps a present row. Callers that may have none guard with `mapped()` below. */
function mapRow(row) {
  return {
    id: row.id,
    scope: row.scope,
    value: row.value,
    reason: row.reason,
    source: row.source,
    leadId: row.lead_id,
    messageId: row.message_id,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    removedAt: row.removed_at,
    removedBy: row.removed_by,
    removalReason: row.removal_reason,
    companyName: row.company_name ?? null,
  }
}

/** `null` for an absent row, the mapped shape otherwise. */
const mappedRow = (row) => (row ? mapRow(row) : null)


/**
 * Whether an address may be contacted.
 *
 * Checks BOTH the exact address and its domain in one query. Checking only the
 * address would let a domain-scoped suppression be bypassed by any address at
 * that domain the engine had not yet discovered — which is the whole reason
 * domain scope exists.
 *
 * Returns the matching entry, not just a boolean, so the UI can say WHY a lead
 * is blocked rather than only that it is.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} email
 * @returns {Promise<{ suppressed: boolean, entry: object|null }>}
 */
export async function checkSuppression(db, email) {
  const normalized = normalizeEmail(email)
  // An address we cannot even normalize is not contactable. Failing closed is
  // the only defensible direction for this particular check.
  if (!normalized) return { suppressed: true, entry: null }

  const domain = emailDomain(normalized)

  const row = await db
    .prepare(
      `SELECT * FROM lead_suppression
       WHERE removed_at IS NULL
         AND ((scope = 'email' AND value = ?) OR (scope = 'domain' AND value = ?))
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .bind(normalized, domain)
    .first()

  return { suppressed: Boolean(row), entry: mappedRow(row) }
}

/**
 * Checks many addresses in one query.
 *
 * The review queue renders dozens of leads at once; one round trip per lead
 * would be the dominant cost of that page.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string[]} emails
 * @returns {Promise<Set<string>>} the normalized addresses that are suppressed
 */
export async function filterSuppressed(db, emails) {
  const normalized = emails.map(normalizeEmail).filter(Boolean)
  if (normalized.length === 0) return new Set()

  const domains = [...new Set(normalized.map(emailDomain).filter(Boolean))]
  const placeholders = (list) => list.map(() => '?').join(', ')

  const result = await db
    .prepare(
      `SELECT scope, value FROM lead_suppression
       WHERE removed_at IS NULL
         AND ((scope = 'email' AND value IN (${placeholders(normalized)}))
           OR (scope = 'domain' AND value IN (${placeholders(domains)})))`,
    )
    .bind(...normalized, ...domains)
    .all()

  const suppressedEmails = new Set()
  const suppressedDomains = new Set()
  for (const row of result.results || []) {
    if (row.scope === 'email') suppressedEmails.add(row.value)
    else suppressedDomains.add(row.value)
  }

  return new Set(
    normalized.filter((email) => suppressedEmails.has(email) || suppressedDomains.has(emailDomain(email))),
  )
}

/**
 * Adds a suppression entry.
 *
 * Idempotent: suppressing an already-suppressed value returns the existing
 * entry rather than failing, because the callers include an inbound-reply
 * handler that may legitimately see the same "remove me" message twice.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ scope: 'email'|'domain', value: string, reason: string, source?: string,
 *           leadId?: string|null, messageId?: string|null, notes?: string, createdBy?: string|null }} input
 */
export async function addSuppression(db, input) {
  const scope = input.scope === 'domain' ? 'domain' : 'email'
  const value = scope === 'email' ? normalizeEmail(input.value) : String(input.value || '').trim().toLowerCase()

  if (!value) throw operationError('A valid email address or domain is required.', 422)
  if (!SUPPRESSION_REASONS.includes(input.reason)) {
    throw operationError(`Unknown suppression reason: ${input.reason}`, 422)
  }

  const existing = await db
    .prepare('SELECT * FROM lead_suppression WHERE scope = ? AND value = ? AND removed_at IS NULL')
    .bind(scope, value)
    .first()
  if (existing) return { entry: mappedRow(existing), created: false }

  const id = newId()
  await db
    .prepare(
      `INSERT OR IGNORE INTO lead_suppression
         (id, scope, value, reason, source, lead_id, message_id, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, scope, value, input.reason, input.source || 'manual',
      input.leadId ?? null, input.messageId ?? null,
      bounded(input.notes || '', 1_000), input.createdBy ?? null, nowIso(),
    )
    .run()

  const stored = await db
    .prepare('SELECT * FROM lead_suppression WHERE scope = ? AND value = ? AND removed_at IS NULL')
    .bind(scope, value)
    .first()

  const entry = mappedRow(stored)
  // The row was just written (or already existed); a null here means the insert
  // silently did nothing, which callers must not have to defend against on a
  // suppression path.
  if (!entry) throw operationError('The suppression entry could not be stored.', 500)

  return { entry, created: stored?.id === id }
}

/**
 * Removes a suppression entry.
 *
 * Privileged and audited: the caller must supply who did it and why, and the
 * row is retained with the removal recorded rather than deleted. A reason is
 * required because the only legitimate uses (wrong address suppressed, the
 * business asked to be re-added) are both explainable in a sentence.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function removeSuppression(db, id, { actorEmail, reason }) {
  if (!reason || String(reason).trim().length < 3) {
    throw operationError('A reason is required to remove a suppression entry.', 422)
  }

  const existing = await db.prepare('SELECT * FROM lead_suppression WHERE id = ?').bind(id).first()
  if (!existing) throw operationError('Suppression entry not found.', 404)
  if (existing.removed_at) throw operationError('That suppression entry has already been removed.', 409)

  await db
    .prepare('UPDATE lead_suppression SET removed_at = ?, removed_by = ?, removal_reason = ? WHERE id = ?')
    .bind(nowIso(), actorEmail ?? null, bounded(reason, 500), id)
    .run()

  const removed = mappedRow({ ...existing, removed_at: nowIso(), removed_by: actorEmail, removal_reason: reason })
  if (!removed) throw operationError('The suppression entry could not be read back.', 500)
  return removed
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ scope?, reason?, includeRemoved?, search?, limit?, offset? }} [filters]
 */
export async function listSuppression(db, filters = {}) {
  const { clause, bindings } = buildWhere([
    ['s.scope = ?', filters.scope ?? null],
    ['s.reason = ?', filters.reason ?? null],
  ])

  const extra = []
  const extraBindings = []
  if (!filters.includeRemoved) extra.push('s.removed_at IS NULL')
  if (filters.search) {
    extra.push('s.value LIKE ?')
    extraBindings.push(`%${String(filters.search).slice(0, 120)}%`)
  }

  const where = [clause.replace(/^WHERE /, ''), ...extra].filter(Boolean)
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const result = await db
    .prepare(
      `SELECT s.*, c.name AS company_name
       FROM lead_suppression s
       LEFT JOIN lead_leads l ON l.id = s.lead_id
       LEFT JOIN lead_companies c ON c.id = l.company_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, ...extraBindings, clampLimit(filters.limit, 100, 500), clampOffset(filters.offset))
    .all()

  // `mapRow` is nullable for the single-row accessors; a list query cannot
  // produce a null row, and filtering says so rather than asserting it.
  return (result.results || []).map(mapRow)
}
