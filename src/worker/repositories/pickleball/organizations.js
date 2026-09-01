import { nowIso } from '../../utils/responses.js'

function toOrganization(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    maxAdmins: row.max_admins,
    maxFacilitators: row.max_facilitators,
    maxScorekeepers: row.max_scorekeepers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const ORG_COLUMNS = 'id, name, slug, status, max_admins, max_facilitators, max_scorekeepers, created_at, updated_at'

export async function getOrganization(db, id) {
  const row = await db.prepare(`SELECT ${ORG_COLUMNS} FROM organizations WHERE id = ?`).bind(id).first()
  return toOrganization(row)
}

// Returns null (rather than throwing) when the slug's UNIQUE constraint is
// violated -- organizations.slug is NOT NULL UNIQUE, so a duplicate slug
// makes the INSERT throw a raw D1 error. Callers (currently just the
// org-invite accept route) treat a null return as "slug already taken" and
// surface a clean 409, matching this repo's convention of returning null
// for an expected "already exists" case instead of letting it throw.
export async function createOrganization(db, { name, slug, maxAdmins = null, maxFacilitators = null, maxScorekeepers = null }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  try {
    await db
      .prepare(
        `INSERT INTO organizations (id, name, slug, status, max_admins, max_facilitators, max_scorekeepers, created_at, updated_at)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
      )
      .bind(id, name, slug, maxAdmins, maxFacilitators, maxScorekeepers, timestamp, timestamp)
      .run()
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return null
    }
    throw error
  }

  return getOrganization(db, id)
}

export async function setOrganizationStatus(db, id, status) {
  const result = await db
    .prepare(`UPDATE organizations SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, nowIso(), id)
    .run()
  return result.meta.changes > 0
}

// Platform-admin overview: every org plus how many ACTIVE members it has
// per role, so the UI can show "3 of 5 scorekeepers" without a second
// round-trip per org.
export async function listAllOrganizationsWithCounts(db) {
  const result = await db
    .prepare(
      `SELECT o.${ORG_COLUMNS.split(', ').map((c) => `${c}`).join(', o.')},
              SUM(CASE WHEN m.role = 'ADMIN' AND m.status = 'ACTIVE' THEN 1 ELSE 0 END) AS admin_count,
              SUM(CASE WHEN m.role = 'SESSION_FACILITATOR' AND m.status = 'ACTIVE' THEN 1 ELSE 0 END) AS facilitator_count,
              SUM(CASE WHEN m.role = 'SCOREKEEPER' AND m.status = 'ACTIVE' THEN 1 ELSE 0 END) AS scorekeeper_count
       FROM organizations o
       LEFT JOIN organization_memberships m ON m.organization_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at ASC`,
    )
    .all()

  return (result.results || []).map((row) => ({
    ...toOrganization(row),
    adminCount: row.admin_count || 0,
    facilitatorCount: row.facilitator_count || 0,
    scorekeeperCount: row.scorekeeper_count || 0,
  }))
}

// Active-membership count for one org+role, used by the quota check at
// invite time (see canAddOperator in src/lib/pickleball/quota.ts).
export async function countActiveMembershipsByRole(db, organizationId, role) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM organization_memberships WHERE organization_id = ? AND role = ? AND status = 'ACTIVE'`)
    .bind(organizationId, role)
    .first()
  return row?.count || 0
}
