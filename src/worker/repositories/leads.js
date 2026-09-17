import { nowIso, parseJsonField } from '../utils/responses'

/**
 * Operational lead/inquiry storage. Deliberately separate from every content
 * table (see docs/content-model.md's "content vs operations" split) — an
 * inquiry is never editorial content and must never surface in a public
 * content read path.
 *
 * `status` is DELIVERY state (pending/delivered/failed) and keeps its
 * original meaning; `pipeline_status` is the human workflow state. See
 * migrations/0009_business_inquiry_platform.sql for why they are separate.
 */

const SELECT_COLUMNS = `
  id, name, email, subject, message, source, status, created_at, updated_at,
  inquiry_type, pipeline_status, company, website, phone,
  current_workflow, desired_outcome, current_tools, team_size, timeline,
  budget_range, volume, preferred_contact, solution_interest,
  role_title, employment_type, work_arrangement, location_requirement,
  job_posting_url, hiring_timeline,
  qualification, qualification_score, qualification_reasons_json,
  assigned_owner, internal_notes, archived_at, idempotency_key
`

function normalizeString(value) {
  return String(value ?? '').trim()
}

function nullable(value) {
  const normalized = normalizeString(value)
  return normalized === '' ? null : normalized
}

function toLead(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    inquiryType: row.inquiry_type || 'general',
    pipelineStatus: row.pipeline_status || 'new',
    company: row.company || '',
    website: row.website || '',
    phone: row.phone || '',
    currentWorkflow: row.current_workflow || '',
    desiredOutcome: row.desired_outcome || '',
    currentTools: row.current_tools || '',
    teamSize: row.team_size || '',
    timeline: row.timeline || '',
    budgetRange: row.budget_range || '',
    volume: row.volume || '',
    preferredContact: row.preferred_contact || '',
    solutionInterest: row.solution_interest || '',
    roleTitle: row.role_title || '',
    employmentType: row.employment_type || '',
    workArrangement: row.work_arrangement || '',
    locationRequirement: row.location_requirement || '',
    jobPostingUrl: row.job_posting_url || '',
    hiringTimeline: row.hiring_timeline || '',
    qualification: row.qualification || 'unscored',
    qualificationScore: Number(row.qualification_score) || 0,
    qualificationReasons: parseJsonField(row.qualification_reasons_json, []),
    assignedOwner: row.assigned_owner || '',
    internalNotes: row.internal_notes || '',
    archivedAt: row.archived_at || null,
  }
}

/**
 * Persists a fully-typed inquiry. Called before any external delivery is
 * attempted — that ordering is the whole durability guarantee.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function createInquiry(db, input) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO leads (
        id, name, email, subject, message, source, status, created_at, updated_at,
        inquiry_type, pipeline_status, company, website, phone,
        current_workflow, desired_outcome, current_tools, team_size, timeline,
        budget_range, volume, preferred_contact, solution_interest,
        role_title, employment_type, work_arrangement, location_requirement,
        job_posting_url, hiring_timeline,
        qualification, qualification_score, qualification_reasons_json, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      normalizeString(input.name),
      normalizeString(input.email),
      normalizeString(input.subject),
      normalizeString(input.message),
      normalizeString(input.source) || 'contact-form',
      timestamp,
      timestamp,
      normalizeString(input.inquiryType) || 'general',
      nullable(input.company),
      nullable(input.website),
      nullable(input.phone),
      nullable(input.currentWorkflow),
      nullable(input.desiredOutcome),
      nullable(input.currentTools),
      nullable(input.teamSize),
      nullable(input.timeline),
      nullable(input.budgetRange),
      nullable(input.volume),
      nullable(input.preferredContact),
      nullable(input.solutionInterest),
      nullable(input.roleTitle),
      nullable(input.employmentType),
      nullable(input.workArrangement),
      nullable(input.locationRequirement),
      nullable(input.jobPostingUrl),
      nullable(input.hiringTimeline),
      normalizeString(input.qualification) || 'unscored',
      Number(input.qualificationScore) || 0,
      JSON.stringify(Array.isArray(input.qualificationReasons) ? input.qualificationReasons : []),
      nullable(input.idempotencyKey),
    )
    .run()

  return getLead(db, id)
}

/**
 * Back-compatible wrapper for the original four-field contact shape. Kept so
 * nothing that already calls createLead() has to change.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function createLead(db, input) {
  return createInquiry(db, { ...input, inquiryType: input.inquiryType || 'general' })
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function findLeadByIdempotencyKey(db, key) {
  if (!key) return null
  const row = await db.prepare(`SELECT ${SELECT_COLUMNS} FROM leads WHERE idempotency_key = ?`).bind(key).first()
  return toLead(row)
}

/**
 * Dedupes near-identical resubmissions (double-click, retry-after-timeout)
 * — same email + message within the window counts as the same lead. Retained
 * as a second line of defence behind the idempotency key, which covers the
 * concurrent case the key's UNIQUE index would otherwise have to reject.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function findRecentDuplicateLead(db, { email, message, windowMinutes = 5 }) {
  const row = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM leads
       WHERE email = ? AND message = ? AND created_at >= datetime('now', ?)
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(normalizeString(email), normalizeString(message), `-${windowMinutes} minutes`)
    .first()

  return toLead(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getLead(db, id) {
  const row = await db.prepare(`SELECT ${SELECT_COLUMNS} FROM leads WHERE id = ?`).bind(id).first()
  return toLead(row)
}

/**
 * Filtered, paginated admin listing.
 *
 * Every filter is bound, never interpolated; `sortOrder`-style free text has
 * no path into the SQL at all. `includeArchived` defaults to false so a soft
 * archive actually removes a row from the working inbox.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function listLeads(db, options = {}) {
  const {
    status = null,
    inquiryType = null,
    pipelineStatus = null,
    qualification = null,
    assignedOwner = null,
    search = null,
    includeArchived = false,
    limit = 100,
    offset = 0,
  } = options

  const clauses = []
  const bindings = []

  if (status) {
    clauses.push('status = ?')
    bindings.push(status)
  }
  if (inquiryType) {
    clauses.push('inquiry_type = ?')
    bindings.push(inquiryType)
  }
  if (pipelineStatus) {
    clauses.push('pipeline_status = ?')
    bindings.push(pipelineStatus)
  }
  if (qualification) {
    clauses.push('qualification = ?')
    bindings.push(qualification)
  }
  if (assignedOwner) {
    clauses.push('assigned_owner = ?')
    bindings.push(assignedOwner)
  }
  if (!includeArchived) {
    clauses.push('archived_at IS NULL')
  }
  if (search) {
    // LIKE with bound parameters — the wildcards are added to the VALUE, not
    // to the SQL text, so a search string can never change the statement. The
    // explicit ESCAPE is what makes a literal `%` or `_` in the search term
    // match itself instead of acting as a wildcard.
    clauses.push(
      "(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\')",
    )
    const pattern = `%${String(search).replace(/[%_\\]/g, (character) => `\\${character}`)}%`
    bindings.push(pattern, pattern, pattern, pattern)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

  const result = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM leads
       ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, limit, offset)
    .all()

  return (result.results || []).map(toLead)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function updateLeadStatus(db, id, status) {
  await db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?').bind(status, nowIso(), id).run()
}

/**
 * Admin workflow mutation. Only ever writes the three operator-owned fields —
 * a visitor-supplied column can never be edited through this path.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function updateLeadWorkflow(db, id, changes) {
  const assignments = []
  const bindings = []

  if (changes.pipelineStatus !== undefined) {
    assignments.push('pipeline_status = ?')
    bindings.push(changes.pipelineStatus)
    assignments.push('archived_at = ?')
    bindings.push(changes.pipelineStatus === 'archived' ? nowIso() : null)
  }
  if (changes.assignedOwner !== undefined) {
    assignments.push('assigned_owner = ?')
    bindings.push(nullable(changes.assignedOwner))
  }
  if (changes.internalNotes !== undefined) {
    assignments.push('internal_notes = ?')
    bindings.push(nullable(changes.internalNotes))
  }

  if (!assignments.length) return getLead(db, id)

  assignments.push('updated_at = ?')
  bindings.push(nowIso(), id)

  await db.prepare(`UPDATE leads SET ${assignments.join(', ')} WHERE id = ?`).bind(...bindings).run()
  return getLead(db, id)
}
