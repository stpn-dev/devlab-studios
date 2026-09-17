-- Daily Insights digest: one dated section per day on a single permanent page
-- (/insights/daily), holding up to 10 curated news items, retained for 7 days.
--
-- SEPARATE TABLES FROM `articles`, DELIBERATELY. Articles are evergreen,
-- hand-written, indexed and permanent; digest content is ephemeral and
-- generated. Sharing a table would mean every existing article query needs a
-- new filter, and -- the part that actually matters -- the retention sweep
-- below is a DELETE with a date predicate. One bad WHERE clause against a
-- shared table would take real editorial content with it. Separate tables make
-- that impossible rather than merely unlikely.
CREATE TABLE IF NOT EXISTS digests (
  id TEXT PRIMARY KEY,
  -- UNIQUE makes a re-run idempotent: a second invocation on the same day
  -- updates that day rather than creating a duplicate section.
  digest_date TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  item_count INTEGER NOT NULL DEFAULT 0,
  -- Which model wrote the summaries, or NULL when the run degraded to
  -- titles-and-links because Workers AI was unavailable.
  model TEXT,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_digests_date ON digests(digest_date DESC);

-- One row per curated item. Only ever title + link + OUR OWN short summary:
-- source body text is never stored. Summarizing and linking is what an
-- aggregator does; reproducing substantial source text is infringement.
CREATE TABLE IF NOT EXISTS digest_items (
  id TEXT PRIMARY KEY,
  digest_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  -- Empty when the AI allocation was exhausted. The item still publishes as a
  -- title and a link, because a digest without summaries is still useful and a
  -- missing digest is not.
  summary TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (digest_id) REFERENCES digests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digest_items_digest ON digest_items(digest_id, sort_order);
-- Dedupe reads this: an item already published in the trailing window must not
-- reappear in a later day's digest.
CREATE INDEX IF NOT EXISTS idx_digest_items_source_url ON digest_items(source_url);
