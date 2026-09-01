-- migrations/pickleball/0011_platform_pilot.sql

ALTER TABLE users ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_platform_admin IN (0, 1));

ALTER TABLE organizations ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED'));
ALTER TABLE organizations ADD COLUMN max_admins INTEGER;
ALTER TABLE organizations ADD COLUMN max_facilitators INTEGER;
ALTER TABLE organizations ADD COLUMN max_scorekeepers INTEGER;

CREATE TABLE IF NOT EXISTS organization_invites (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  invited_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  max_admins INTEGER,
  max_facilitators INTEGER,
  max_scorekeepers INTEGER,
  created_by_user_id TEXT NOT NULL,
  organization_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_organization_invites_email ON organization_invites(invited_email);
