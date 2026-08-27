import { nowIso } from '../../utils/responses.js'

function toAuditEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    organizationId: row.organization_id,
    sessionId: row.session_id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email || null,
    actorName: row.actor_name || null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    previousState: row.previous_state_json ? JSON.parse(row.previous_state_json) : null,
    newState: row.new_state_json ? JSON.parse(row.new_state_json) : null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    createdAt: row.created_at,
  }
}

export async function recordAuditEvent(db, { organizationId, sessionId, actorUserId, action, entityType, entityId, previousState, newState, metadata }) {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO audit_events (id, organization_id, session_id, actor_user_id, action, entity_type, entity_id, previous_state_json, new_state_json, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      organizationId,
      sessionId || null,
      actorUserId,
      action,
      entityType,
      entityId,
      previousState ? JSON.stringify(previousState) : null,
      newState ? JSON.stringify(newState) : null,
      metadata ? JSON.stringify(metadata) : null,
      nowIso(),
    )
    .run()
  return id
}

export async function listAuditEvents(db, organizationId, { limit = 50, offset = 0 } = {}) {
  const result = await db
    .prepare(
      `SELECT ae.id, ae.organization_id, ae.session_id, ae.actor_user_id, u.email AS actor_email, u.name AS actor_name,
              ae.action, ae.entity_type, ae.entity_id, ae.previous_state_json, ae.new_state_json, ae.metadata_json, ae.created_at
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id
       WHERE ae.organization_id = ?
       ORDER BY ae.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(organizationId, limit, offset)
    .all()
  return (result.results || []).map(toAuditEvent)
}
