/**
 * Shared repository helpers for the mailbox.
 *
 * Re-exports the lead engine's, rather than defining a second set. The two
 * feature areas live in the same D1 database and follow the same conventions —
 * `newId`, `nowIso`, bound parameters, snake_case mapped to camelCase — and a
 * parallel copy of `clampLimit` is how the two quietly stop agreeing about what
 * a safe limit is.
 */

export {
  bounded,
  buildWhere,
  clampLimit,
  clampOffset,
  fromInt,
  newId,
  nowIso,
  operationError,
  parseJsonField,
  toInt,
} from '../../lead-engine/repositories/helpers.js'

/**
 * Whether a D1 failure was a uniqueness violation.
 *
 * THE MAILBOX NEVER USES `INSERT OR IGNORE`. Three times in this schema a CHECK
 * constraint plus `OR IGNORE` has silently discarded a row and nothing errored
 * (see the header of migrations/0014_mailbox.sql). So idempotency here is a
 * plain INSERT and this check: a duplicate is recognised explicitly, and a
 * CHECK violation — which is a bug, not a duplicate — propagates as an
 * exception instead of looking like one.
 *
 * Matching on the message text is unpleasant but is what D1 exposes; there is
 * no error code on the thrown object. The string comes from SQLite itself and
 * has been stable across its entire history.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isUniqueViolation(error) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /UNIQUE constraint failed/i.test(message)
}
