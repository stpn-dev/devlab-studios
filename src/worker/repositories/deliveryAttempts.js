import { nowIso } from '../utils/responses'

function toDeliveryAttempt(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    target: row.target,
    attemptNumber: row.attempt_number,
    status: row.status,
    statusCode: row.status_code,
    errorMessage: row.error_message,
    attemptedAt: row.attempted_at,
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function countDeliveryAttempts(db, leadId) {
  const row = await db.prepare('SELECT COUNT(*) as count FROM delivery_attempts WHERE lead_id = ?').bind(leadId).first()
  return Number(row?.count) || 0
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ leadId: string, target?: string, attemptNumber: number, status: string, statusCode?: number | null, errorMessage?: string | null }} input
 */
export async function recordDeliveryAttempt(db, input) {
  await db
    .prepare(
      `INSERT INTO delivery_attempts (id, lead_id, target, attempt_number, status, status_code, error_message, attempted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.leadId,
      input.target || 'resend',
      input.attemptNumber,
      input.status,
      input.statusCode ?? null,
      input.errorMessage ?? null,
      nowIso(),
    )
    .run()
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listDeliveryAttempts(db, leadId) {
  const result = await db
    .prepare(
      `SELECT id, lead_id, target, attempt_number, status, status_code, error_message, attempted_at
       FROM delivery_attempts
       WHERE lead_id = ?
       ORDER BY attempted_at DESC`,
    )
    .bind(leadId)
    .all()

  return (result.results || []).map(toDeliveryAttempt)
}
