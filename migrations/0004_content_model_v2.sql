-- Phase 2 of the Astro/CMS rebuild: extends the content model with the
-- singletons/collections sketched in docs/content-model.md.
-- Additive only, except the resources -> articles rename below.

-- The existing `resources` table (slug/content_type/body_markdown/tags/etc,
-- added in 0003) is genuinely article-shaped, not "downloads"-shaped. Renamed
-- to make room for a real, separate "downloads/reference" Resources
-- collection. The repository functions/API routes that read this table keep
-- their existing `resources`-flavored names as a deliberate, documented
-- bridge for now (see content.js) -- renaming those too happens in Phase 3
-- alongside the actual Resources.jsx -> /insights page rewrite, so this
-- migration doesn't break the currently-live wrapped app.
ALTER TABLE resources RENAME TO articles;
DROP INDEX IF EXISTS idx_resources_slug;
DROP INDEX IF EXISTS idx_resources_type_status_sort;
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_type_status_sort ON articles(content_type, status, sort_order);

-- Real "downloads/reference material" Resources collection (distinct from
-- Articles above). Ships empty -- nothing in the current site's content is
-- actually downloads-shaped.
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  resource_type TEXT NOT NULL DEFAULT 'download' CHECK (resource_type IN ('template', 'checklist', 'external-link', 'download')),
  url TEXT NOT NULL DEFAULT '',
  icon TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 999,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('published', 'draft', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_v2_slug ON resources(slug);
CREATE INDEX IF NOT EXISTS idx_resources_v2_status_sort ON resources(status, sort_order);

-- Testimonials -- ships empty, no real content yet.
CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY,
  quote TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_title TEXT,
  author_company TEXT,
  author_photo_url TEXT,
  related_service_id TEXT REFERENCES service_groups(id) ON DELETE SET NULL,
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 999,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('published', 'draft', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_testimonials_status_sort ON testimonials(status, sort_order);

-- Case studies -- ships empty. May optionally reference one or more
-- projects (project_ids_json, a JSON array -- projects are lightweight
-- portfolio cards, case studies are the deep-dive narrative write-up) and
-- at most one testimonial.
CREATE TABLE IF NOT EXISTS case_studies (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  client_name TEXT,
  industry TEXT,
  problem TEXT,
  constraints TEXT,
  architecture TEXT,
  implementation TEXT,
  integrations_json TEXT NOT NULL DEFAULT '[]',
  outcomes TEXT,
  metrics_json TEXT NOT NULL DEFAULT '[]',
  screenshots_json TEXT NOT NULL DEFAULT '[]',
  project_ids_json TEXT NOT NULL DEFAULT '[]',
  testimonial_id TEXT REFERENCES testimonials(id) ON DELETE SET NULL,
  cover_image_url TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 999,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('published', 'draft', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_case_studies_slug ON case_studies(slug);
CREATE INDEX IF NOT EXISTS idx_case_studies_status_sort ON case_studies(status, sort_order);

-- Certifications -- real data exists today (Make/n8n/Zapier certs, listed
-- as plain text in src/data/about.js, badge images already in
-- src/assets/certificates/) but was never migrated into D1. Table created
-- here; seeding the 3 known real rows happens in Phase 3 alongside the
-- Profile page conversion, where the exact current copy gets read and
-- carried over precisely rather than guessed at here.
CREATE TABLE IF NOT EXISTS certifications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  issued_date TEXT,
  credential_url TEXT,
  badge_image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 999,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_certifications_status_sort ON certifications(status, sort_order);

-- Redirects -- seeded below with the two real redirects that exist today
-- (currently implemented as hardcoded react-router <Navigate> elements in
-- src/App.jsx). Phase 3 wires actual redirect-serving middleware to this
-- table; App.jsx's hardcoded versions stay authoritative until then.
CREATE TABLE IF NOT EXISTS redirects (
  id TEXT PRIMARY KEY,
  from_path TEXT NOT NULL UNIQUE,
  to_path TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302)),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO redirects (id, from_path, to_path, status_code, note, created_at, updated_at)
VALUES
  ('redirect-experiences', '/experiences', '/profile', 301, 'Legacy route, consolidated into Profile.', datetime('now'), datetime('now')),
  ('redirect-portfolio', '/portfolio', '/profile', 301, 'Legacy route, consolidated into Profile.', datetime('now'), datetime('now'));

-- Generic version-history layer for every content type above (and the
-- existing ones). Whole-snapshot, append-only -- the per-type tables above
-- keep representing current/published state as they always have; this is
-- the audit/rollback trail on top, not a replacement read path.
CREATE TABLE IF NOT EXISTS content_versions (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_id TEXT,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  snapshot_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_versions_lookup
  ON content_versions(content_type, content_id, version_number DESC);

-- Audit log for every create/update/publish/unpublish/archive/restore/delete.
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at DESC);
