import { nowIso } from '../utils/responses'

/**
 * One row per delivery attempt, never overwritten — the full history of what
 * was tried, when, and why it failed stays visible to an administrator.
 *
 * `error_category` is what makes a retry button meaningful: `transient` can
 * usefully be retried, `permanent` cannot and needs a human, `configuration`
 * means an operator has to set an environment variable first.
 */

function toDeliveryAttempt(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    target: row.target,
    attemptNumber: row.attempt_number,
    status: row.status,
    statusCode: row.status_code,
    errorMessage: row.error_message,
    errorCategory: row.error_category || null,
    nextRetryAt: row.next_retry_at || null,
    completedAt: row.completed_at || null,
    attemptedAt: row.attempted_at,
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function countDeliveryAttempts(db, leadId, target = null) {
  const row = target
    ? await db
        .prepare('SELECT COUNT(*) as count FROM delivery_attempts WHERE lead_id = ? AND target = ?')
        .bind(leadId, target)
        .first()
    : await db.prepare('SELECT COUNT(*) as count FROM delivery_attempts WHERE lead_id = ?').bind(leadId).first()
  return Number(row?.count) || 0
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ leadId: string, target?: string, attemptNumber: number, status: string,
 *           statusCode?: number | null, errorMessage?: string | null,
 *           errorCategory?: string | null, nextRetryAt?: string | null }} input
 */
export async function recordDeliveryAttempt(db, input) {
  const timestamp = nowIso()
  await db
    .prepare(
      `INSERT INTO delivery_attempts (
        id, lead_id, target, attempt_number, status, status_code, error_message,
        error_category, next_retry_at, completed_at, attempted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.leadId,
      input.target || 'resend',
      input.attemptNumber,
      input.status,
      input.statusCode ?? null,
      // Truncated: an upstream error body is not a place to store unbounded
      // text, and a provider response can contain more than a summary.
      input.errorMessage ? String(input.errorMessage).slice(0, 500) : null,
      input.errorCategory ?? null,
      input.nextRetryAt ?? null,
      timestamp,
      timestamp,
    )
    .run()
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listDeliveryAttempts(db, leadId) {
  const result = await db
    .prepare(
      `SELECT id, lead_id, target, attempt_number, status, status_code, error_message,
              error_category, next_retry_at, completed_at, attempted_at
       FROM delivery_attempts
       WHERE lead_id = ?
       ORDER BY attempted_at DESC`,
    )
    .bind(leadId)
    .all()

  return (result.results || []).map(toDeliveryAttempt)
}
