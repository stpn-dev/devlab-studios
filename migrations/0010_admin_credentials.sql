-- Moves the admin credential into storage the Worker can write, so a password
-- can be changed from /admin instead of by regenerating a hash in a terminal
-- and updating a Cloudflare secret.
--
-- WHY D1 AT ALL: a Worker cannot rewrite its own secrets at runtime. Cloudflare
-- secrets are set at deploy time or through the API; there is no binding that
-- lets request code mutate them. Self-service password change therefore
-- requires a store the Worker can write, and D1 is the one it already has.
-- The stored value is a PBKDF2 hash, not a password.
--
-- SHIPS EMPTY, DELIBERATELY. An empty table is what selects the existing
-- env-based credential (ADMIN_USERS, or ADMIN_EMAIL + ADMIN_PASSWORD_HASH).
-- getConfiguredAdmins() falls back to those, so:
--
--   * behaviour is unchanged until the change-password form is used once,
--   * an empty table, a failed write, or a brand-new environment cannot lock
--     anyone out, because the env credential still works,
--   * a fresh preview/production Worker needs no seeding.
--
-- The env secret is therefore a permanent bootstrap, not a migration step.
CREATE TABLE IF NOT EXISTS admin_credentials (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  -- Read on every authenticated admin request and compared against the session
  -- token's `iat`: a token issued before this instant is rejected. That is how
  -- "change password signs out everywhere" works without tracking each token.
  password_changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
