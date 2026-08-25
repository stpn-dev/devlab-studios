import { nowIso, parseJsonField } from '../../utils/responses.js'

export async function getIdempotentResult(db, { gameId, commandType, key }) {
  if (!key) return null
  const row = await db
    .prepare(`SELECT result_json FROM idempotency_keys WHERE game_id = ? AND command_type = ? AND key = ?`)
    .bind(gameId, commandType, key)
    .first()
  if (!row) return null
  return parseJsonField(row.result_json, null)
}

// Only ever call this after a command's mutation statements are ALREADY in
// the same statements array this will be batched with -- see the plan's
// Ruling 8/9. Never call this for a command that is about to fail domain
// validation; only for one that is about to commit a real mutation.
export function buildRecordIdempotentResultStatement(db, { gameId, commandType, key, result }) {
  return db
    .prepare(`INSERT INTO idempotency_keys (id, game_id, command_type, key, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), gameId, commandType, key, JSON.stringify(result), nowIso())
}
