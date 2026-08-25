import { nowIso, parseJsonField } from '../../utils/responses.js'

export async function getIdempotentResult(db, key) {
  if (!key) return null
  const row = await db.prepare(`SELECT result_json FROM idempotency_keys WHERE key = ?`).bind(key).first()
  if (!row) return null
  return parseJsonField(row.result_json, null)
}

export function buildRecordIdempotentResultStatement(db, { key, gameId, result }) {
  return db
    .prepare(`INSERT INTO idempotency_keys (key, game_id, result_json, created_at) VALUES (?, ?, ?, ?)`)
    .bind(key, gameId, JSON.stringify(result), nowIso())
}
