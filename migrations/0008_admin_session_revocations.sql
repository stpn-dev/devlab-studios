-- Makes admin logout actually invalidate a session.
--
-- Admin sessions are stateless HMAC tokens, so before this table the logout
-- endpoint could only clear the cookie: the token stayed valid for its full
-- 8-hour lifetime and a captured copy kept working after sign-out. Logout now
-- records the token's `jti` here and requireAdmin rejects anything listed.
--
-- Rows are pruned on write once `expires_at` has passed (the point at which
-- the token would have been rejected on its own anyway), so this stays small
-- without a scheduled job.
CREATE TABLE IF NOT EXISTS admin_session_revocations (
  jti TEXT PRIMARY KEY,
  admin_email TEXT,
  revoked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_session_revocations_expires
  ON admin_session_revocations(expires_at);
