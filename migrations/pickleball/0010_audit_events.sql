-- Phase 7: append-only accountability trail for admin-visible operator
-- actions. Deliberately NOT wired into every mutating command in the
-- system (see this plan's Global Constraints for the disclosed scope
-- ruling) -- covers operator/role changes and game corrections/reopens,
-- the two areas the spec's own permission matrix (section3.4) and
-- edge-case table (section57 #20-21) single out as accountability-
-- sensitive. Other domains already have their own append-only trail
-- (score_events for in-game scoring).

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  session_id TEXT,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  previous_state_json TEXT,
  new_state_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_events_org_created
  ON audit_events(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON audit_events(entity_type, entity_id);
