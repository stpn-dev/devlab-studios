import { nowIso } from '../../utils/responses.js'

function toMembership(row) {
  if (!row) return null
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    invitedEmail: row.invited_email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const MEMBERSHIP_COLUMNS = 'id, organization_id, user_id, invited_email, role, status, created_at, updated_at'

export async function listActiveMembershipsForEmail(db, email) {
  const result = await db
    .prepare(`SELECT ${MEMBERSHIP_COLUMNS} FROM organization_memberships WHERE invited_email = ? AND status = 'ACTIVE'`)
    .bind(String(email).trim().toLowerCase())
    .all()
  return (result.results || []).map(toMembership)
}

export async function getMembership(db, { organizationId, userId }) {
  const row = await db
    .prepare(`SELECT ${MEMBERSHIP_COLUMNS} FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND status = 'ACTIVE'`)
    .bind(organizationId, userId)
    .first()
  return toMembership(row)
}

export async function listMembershipsForOrganization(db, organizationId) {
  const result = await db
    .prepare(`SELECT ${MEMBERSHIP_COLUMNS} FROM organization_memberships WHERE organization_id = ? ORDER BY created_at ASC`)
    .bind(organizationId)
    .all()
  return (result.results || []).map(toMembership)
}

export async function createMembership(db, { organizationId, invitedEmail, role }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()
  const normalizedEmail = String(invitedEmail).trim().toLowerCase()

  await db
    .prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_id, invited_email, role, status, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 'ACTIVE', ?, ?)
       ON CONFLICT(organization_id, invited_email) DO UPDATE SET
         role = excluded.role,
         status = 'ACTIVE',
         updated_at = excluded.updated_at`,
    )
    .bind(id, organizationId, normalizedEmail, role, timestamp, timestamp)
    .run()

  const row = await db
    .prepare(`SELECT ${MEMBERSHIP_COLUMNS} FROM organization_memberships WHERE organization_id = ? AND invited_email = ?`)
    .bind(organizationId, normalizedEmail)
    .first()

  return toMembership(row)
}

export async function linkMembershipUser(db, { organizationId, invitedEmail, userId }) {
  await db
    .prepare(`UPDATE organization_memberships SET user_id = ?, updated_at = ? WHERE organization_id = ? AND invited_email = ?`)
    .bind(userId, nowIso(), organizationId, String(invitedEmail).trim().toLowerCase())
    .run()
}

export async function getMembershipByEmail(db, organizationId, invitedEmail) {
  const row = await db
    .prepare(`SELECT ${MEMBERSHIP_COLUMNS} FROM organization_memberships WHERE organization_id = ? AND invited_email = ?`)
    .bind(organizationId, String(invitedEmail).trim().toLowerCase())
    .first()
  return toMembership(row)
}

export async function getMembershipById(db, organizationId, membershipId) {
  const row = await db
    .prepare(`SELECT ${MEMBERSHIP_COLUMNS} FROM organization_memberships WHERE id = ? AND organization_id = ?`)
    .bind(membershipId, organizationId)
    .first()
  return toMembership(row)
}

export async function revokeMembership(db, organizationId, membershipId) {
  const result = await db
    .prepare(`UPDATE organization_memberships SET status = 'REVOKED', updated_at = ? WHERE id = ? AND organization_id = ? AND status = 'ACTIVE'`)
    .bind(nowIso(), membershipId, organizationId)
    .run()
  return result.meta.changes > 0
}
