/**
 * Server-side revocation list for admin session tokens.
 *
 * Admin sessions are stateless HMAC-signed tokens, so "Log out" could only
 * ever clear the cookie — the token itself stayed valid for its full 8-hour
 * lifetime, and anyone holding a copy (shared machine, unlocked device) could
 * keep using it after the admin believed they had signed out. This table is
 * the missing half: logout records the token's `jti`, and requireAdmin
 * refuses any token listed here.
 *
 * A row is only useful until the token would have expired on its own, so
 * every write opportunistically prunes the ones that are past that point
 * rather than relying on a scheduled job.
 */

/** Drops rows for tokens that have expired on their own. Best-effort. */
async function pruneExpired(db) {
  await db
    .prepare('DELETE FROM admin_session_revocations WHERE expires_at <= ?')
    .bind(new Date().toISOString())
    .run()
}

/**
 * @param {D1Database} db
 * @param {{ jti: string, adminEmail?: string | null, expiresAt: string }} session
 * @returns {Promise<boolean>} whether the revocation was actually recorded
 */
export async function revokeAdminSession(db, { jti, adminEmail = null, expiresAt }) {
  if (!db || !jti || !expiresAt) return false

  try {
    await db
      .prepare(
        `INSERT INTO admin_session_revocations (jti, admin_email, revoked_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(jti) DO NOTHING`,
      )
      .bind(jti, adminEmail, new Date().toISOString(), expiresAt)
      .run()

    await pruneExpired(db).catch(() => undefined)
    return true
  } catch {
    // The table may not exist yet on an environment that hasn't had
    // migration 0008 applied. Logout still clears the cookie, which is
    // exactly the behaviour that shipped before this table existed, so a
    // deploy that lands ahead of its migration degrades rather than breaks.
    return false
  }
}

/**
 * @param {D1Database} db
 * @param {string | undefined} jti
 * @returns {Promise<boolean>}
 */
export async function isAdminSessionRevoked(db, jti) {
  if (!db || !jti) return false

  try {
    const row = await db
      .prepare('SELECT 1 AS revoked FROM admin_session_revocations WHERE jti = ? AND expires_at > ? LIMIT 1')
      .bind(jti, new Date().toISOString())
      .first()

    return Boolean(row)
  } catch {
    // Deliberately fails OPEN, and only ever to the posture that shipped
    // before revocation existed: if this table is unreachable (or not yet
    // migrated) every valid signed token is accepted, exactly as it was
    // before. Failing closed here would instead lock every admin out of the
    // CMS over a missing migration or a transient D1 blip, which is a worse
    // and far more likely outcome than the narrow window it would close.
    return false
  }
}
