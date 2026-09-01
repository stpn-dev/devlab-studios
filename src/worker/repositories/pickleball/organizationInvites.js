// src/worker/repositories/pickleball/organizationInvites.js
import { nowIso } from '../../utils/responses.js'
import { randomBase64Url } from '../../../lib/pickleball/webCrypto.js'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function toInvite(row) {
  if (!row) return null
  return {
    id: row.id,
    token: row.token,
    invitedEmail: row.invited_email,
    status: row.status,
    maxAdmins: row.max_admins,
    maxFacilitators: row.max_facilitators,
    maxScorekeepers: row.max_scorekeepers,
    createdByUserId: row.created_by_user_id,
    organizationId: row.organization_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
  }
}

const INVITE_COLUMNS =
  'id, token, invited_email, status, max_admins, max_facilitators, max_scorekeepers, created_by_user_id, organization_id, created_at, expires_at, accepted_at'

export async function createOrganizationInvite(db, { invitedEmail, maxAdmins = null, maxFacilitators = null, maxScorekeepers = null, createdByUserId }) {
  const id = crypto.randomUUID()
  const token = randomBase64Url(24)
  const timestamp = nowIso()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()

  await db
    .prepare(
      `INSERT INTO organization_invites
         (id, token, invited_email, status, max_admins, max_facilitators, max_scorekeepers, created_by_user_id, organization_id, created_at, expires_at, accepted_at)
       VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, NULL, ?, ?, NULL)`,
    )
    .bind(id, token, String(invitedEmail).trim().toLowerCase(), maxAdmins, maxFacilitators, maxScorekeepers, createdByUserId, timestamp, expiresAt)
    .run()

  return getInviteById(db, id)
}

export async function getInviteById(db, id) {
  const row = await db.prepare(`SELECT ${INVITE_COLUMNS} FROM organization_invites WHERE id = ?`).bind(id).first()
  return toInvite(row)
}

export async function getInviteByToken(db, token) {
  const row = await db.prepare(`SELECT ${INVITE_COLUMNS} FROM organization_invites WHERE token = ?`).bind(token).first()
  return toInvite(row)
}

export async function listOrganizationInvites(db) {
  const result = await db.prepare(`SELECT ${INVITE_COLUMNS} FROM organization_invites ORDER BY created_at DESC`).all()
  return (result.results || []).map(toInvite)
}

// The most recent still-pending, unexpired invite for an email, checked by
// the Google OAuth callback when that email has zero real org memberships
// (see google/callback.ts) — an invite past its expires_at is deliberately
// excluded here rather than being flipped to EXPIRED, since no background
// sweep job exists; the accept route re-validates expiry independently.
export async function getPendingInviteForEmail(db, email) {
  const row = await db
    .prepare(
      `SELECT ${INVITE_COLUMNS} FROM organization_invites
       WHERE invited_email = ? AND status = 'PENDING' AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(String(email).trim().toLowerCase(), nowIso())
    .first()
  return toInvite(row)
}

export async function markInviteAccepted(db, inviteId, organizationId) {
  await db
    .prepare(`UPDATE organization_invites SET status = 'ACCEPTED', organization_id = ?, accepted_at = ? WHERE id = ?`)
    .bind(organizationId, nowIso(), inviteId)
    .run()
}

export async function revokeInvite(db, inviteId) {
  const result = await db
    .prepare(`UPDATE organization_invites SET status = 'REVOKED' WHERE id = ? AND status = 'PENDING'`)
    .bind(inviteId)
    .run()
  return result.meta.changes > 0
}
