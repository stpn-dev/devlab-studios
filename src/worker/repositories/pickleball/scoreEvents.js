import { nowIso, parseJsonField } from '../../utils/responses.js'

function toScoreEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    gameId: row.game_id,
    sequence: row.sequence,
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    payload: parseJsonField(row.payload_json, {}),
    createdAt: row.created_at,
  }
}

export function buildAppendScoreEventStatement(db, { gameId, sequence, eventType, actorUserId, payload }) {
  return db
    .prepare(
      `INSERT INTO score_events (id, game_id, sequence, event_type, actor_user_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), gameId, sequence, eventType, actorUserId, JSON.stringify(payload ?? {}), nowIso())
}

export async function listScoreEventsForGame(db, gameId) {
  const result = await db
    .prepare(`SELECT id, game_id, sequence, event_type, actor_user_id, payload_json, created_at FROM score_events WHERE game_id = ? ORDER BY sequence ASC`)
    .bind(gameId)
    .all()
  return (result.results || []).map(toScoreEvent)
}

export async function getNextSequence(db, gameId) {
  const row = await db.prepare(`SELECT MAX(sequence) AS maxSequence FROM score_events WHERE game_id = ?`).bind(gameId).first()
  return (row?.maxSequence ?? 0) + 1
}
