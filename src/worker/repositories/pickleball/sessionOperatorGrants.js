import { nowIso } from '../../utils/responses.js'

export async function hasSessionOperatorGrant(db, sessionId, userId) {
  const row = await db
    .prepare(`SELECT id FROM session_operator_grants WHERE session_id = ? AND user_id = ?`)
    .bind(sessionId, userId)
    .first()
  return Boolean(row)
}

export async function grantSessionOperator(db, { sessionId, userId, grantedByUserId }) {
  await db
    .prepare(
      `INSERT INTO session_operator_grants (id, session_id, user_id, granted_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id, user_id) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), sessionId, userId, grantedByUserId, nowIso())
    .run()
  return hasSessionOperatorGrant(db, sessionId, userId)
}

export async function revokeSessionOperator(db, sessionId, userId) {
  const result = await db
    .prepare(`DELETE FROM session_operator_grants WHERE session_id = ? AND user_id = ?`)
    .bind(sessionId, userId)
    .run()
  return Boolean(result.meta.changes)
}
