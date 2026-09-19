-- Widen lead_usage_daily.metric to admit 'nominatim_requests'.
--
-- WHY THIS IS A MIGRATION AND NOT AN EDIT TO 0012: 0012 is already applied to
-- both the production and preview databases. Editing an applied migration is
-- how two environments quietly stop having the same schema.
--
-- WHAT IT FIXES, AND HOW IT HID: the Nominatim discovery adapter reserves its
-- daily budget through `consumeBudget`, which calls `ensureCounter`, which does
-- an INSERT OR IGNORE. The CHECK rejected 'nominatim_requests', OR IGNORE
-- swallowed the rejection, the counter row was never created, and the
-- conditional UPDATE that follows matched nothing -- so the reservation
-- returned `allowed: false` on a database with zero recorded usage. Discovery
-- then reported `daily_request_budget_exhausted` and admitted no candidates.
--
-- Nothing errored anywhere. The unit tests passed, because they exercise the
-- adapter with an injected fetch and never reach the budget. It was only
-- visible by running a real discovery against a real database, which returned:
--
--   { "slug": "osm-nominatim", "status": "limited",
--     "reason": "daily_request_budget_exhausted" }
--
-- on a freshly seeded database. That is the second CHECK constraint in this
-- schema to silently discard a new value behind INSERT OR IGNORE; the first was
-- lead_sources.type. Both are now covered by tests that assert schema and code
-- agree, rather than trusting that they do.
--
-- SQLite cannot ALTER a CHECK constraint, so the table is rebuilt. This is the
-- procedure from the SQLite documentation, and it is safe here specifically
-- because nothing references lead_usage_daily by foreign key -- verified before
-- writing this. The rows are daily counters; they are preserved anyway, because
-- discarding today's usage would hand back budget that has already been spent.

PRAGMA foreign_keys = OFF;

CREATE TABLE lead_usage_daily_new (
  id TEXT PRIMARY KEY,
  usage_date TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'discovery_candidates', 'crawl_pages', 'browser_runs', 'ai_reviews',
    'ai_neurons', 'brave_requests', 'overpass_requests', 'nominatim_requests',
    'zoho_api_calls'
  )),
  campaign_id TEXT,
  used INTEGER NOT NULL DEFAULT 0,
  limit_value INTEGER,
  limit_reached_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES lead_campaigns(id) ON DELETE CASCADE
);

INSERT INTO lead_usage_daily_new
  (id, usage_date, metric, campaign_id, used, limit_value, limit_reached_at, created_at, updated_at)
SELECT id, usage_date, metric, campaign_id, used, limit_value, limit_reached_at, created_at, updated_at
  FROM lead_usage_daily;

DROP TABLE lead_usage_daily;

ALTER TABLE lead_usage_daily_new RENAME TO lead_usage_daily;

-- Dropping the table drops its indexes, so both are recreated exactly as 0012
-- defined them. The COALESCE in the unique index is what lets the global
-- (campaign-less) counter coexist with per-campaign counters without NULL
-- defeating uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_usage_daily_unique
  ON lead_usage_daily(usage_date, metric, COALESCE(campaign_id, ''));
CREATE INDEX IF NOT EXISTS idx_lead_usage_daily_date ON lead_usage_daily(usage_date DESC, metric);

PRAGMA foreign_keys = ON;
