-- Business inquiry platform: turns the single-shape contact `leads` table
-- into a typed inquiry record with attribution, consent, activity, and
-- retryable delivery tracking.
--
-- ADDITIVE ONLY. Every existing row stays valid and every existing reader
-- (admin Leads screen, /api/admin/leads, leadDelivery.js) keeps working
-- untouched:
--
--   * `leads.status` KEEPS its original meaning -- delivery state
--     (pending/delivered/failed). Its CHECK constraint cannot be widened in
--     SQLite without a full table rebuild, and rebuilding a table that holds
--     real submitted leads to add workflow values is not worth the risk. The
--     new human workflow state lives in `pipeline_status` instead, which is
--     a separate concern anyway: "did the notification email go out" and
--     "has a human replied yet" are genuinely different questions.
--   * Every new column is nullable or defaulted, so historical rows backfill
--     to sensible values without an UPDATE pass. `inquiry_type` defaults to
--     'general', which is exactly what pre-existing contact-form rows were.
--   * `subject` stays NOT NULL; the inquiry service always derives one.

ALTER TABLE leads ADD COLUMN inquiry_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE leads ADD COLUMN pipeline_status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD COLUMN company TEXT;
ALTER TABLE leads ADD COLUMN website TEXT;
ALTER TABLE leads ADD COLUMN phone TEXT;
ALTER TABLE leads ADD COLUMN current_workflow TEXT;
ALTER TABLE leads ADD COLUMN desired_outcome TEXT;
ALTER TABLE leads ADD COLUMN current_tools TEXT;
ALTER TABLE leads ADD COLUMN team_size TEXT;
ALTER TABLE leads ADD COLUMN timeline TEXT;
ALTER TABLE leads ADD COLUMN budget_range TEXT;
ALTER TABLE leads ADD COLUMN volume TEXT;
ALTER TABLE leads ADD COLUMN preferred_contact TEXT;
ALTER TABLE leads ADD COLUMN solution_interest TEXT;

-- Employment / contract inquiries (Profile page). Kept on the same table
-- rather than a parallel one so the admin has a single operational inbox and
-- one retry/delivery path; `inquiry_type` is what separates them.
ALTER TABLE leads ADD COLUMN role_title TEXT;
ALTER TABLE leads ADD COLUMN employment_type TEXT;
ALTER TABLE leads ADD COLUMN work_arrangement TEXT;
ALTER TABLE leads ADD COLUMN location_requirement TEXT;
ALTER TABLE leads ADD COLUMN job_posting_url TEXT;
ALTER TABLE leads ADD COLUMN hiring_timeline TEXT;

-- Deterministic routing output. `qualification_reasons_json` is the
-- explainability record -- the admin sees WHY a lead was tiered, never an
-- opaque score. Never shown to the visitor.
ALTER TABLE leads ADD COLUMN qualification TEXT NOT NULL DEFAULT 'unscored';
ALTER TABLE leads ADD COLUMN qualification_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN qualification_reasons_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE leads ADD COLUMN assigned_owner TEXT;
ALTER TABLE leads ADD COLUMN internal_notes TEXT;
ALTER TABLE leads ADD COLUMN archived_at TEXT;

-- Server-computed fingerprint (never client-supplied) used to collapse
-- double submits. Unique so a concurrent duplicate loses the insert race
-- instead of creating a second record; NULL for every historical row, and
-- SQLite treats NULLs as distinct in a UNIQUE index, so the backfill is a
-- no-op.
ALTER TABLE leads ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_idempotency ON leads(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_leads_type_created ON leads(inquiry_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_created ON leads(pipeline_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_qualification_created ON leads(qualification, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_owner_created ON leads(assigned_owner, created_at DESC);

-- Delivery attempts gain failure classification and retry scheduling so the
-- admin can tell "Resend was briefly down, retry this" apart from "the
-- address is invalid, retrying will never work".
ALTER TABLE delivery_attempts ADD COLUMN error_category TEXT;
ALTER TABLE delivery_attempts ADD COLUMN next_retry_at TEXT;
ALTER TABLE delivery_attempts ADD COLUMN completed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_retry ON delivery_attempts(status, next_retry_at);

-- One attribution row per inquiry. Deliberately separate from `leads` so the
-- marketing-analytics shape can grow without touching the record a human
-- actually works from, and so it can be dropped for a retention request
-- without deleting the inquiry itself.
--
-- `anonymous_id` is a privacy-compliant, first-party, non-PII identifier
-- generated in the browser -- never an IP, email, or device fingerprint.
CREATE TABLE IF NOT EXISTS lead_attribution (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  entry_page TEXT,
  source_page TEXT,
  landing_page TEXT,
  referrer TEXT,
  first_touch_source TEXT,
  first_touch_medium TEXT,
  first_touch_campaign TEXT,
  first_touch_at TEXT,
  latest_touch_source TEXT,
  latest_touch_medium TEXT,
  latest_touch_campaign TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  form_id TEXT,
  offer_id TEXT,
  solution_id TEXT,
  case_study_id TEXT,
  insight_id TEXT,
  anonymous_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_lead ON lead_attribution(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_source ON lead_attribution(utm_source, created_at DESC);

-- Consent is stored as an append-only record of what the visitor was shown
-- and agreed to, versioned, so a later policy change never rewrites history.
CREATE TABLE IF NOT EXISTS lead_consents (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 0,
  consent_text_version TEXT NOT NULL DEFAULT '',
  privacy_policy_version TEXT NOT NULL DEFAULT '',
  source TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_consents_lead ON lead_consents(lead_id, created_at DESC);

-- Append-only operational timeline: received, persisted, qualified, routed,
-- notified, status changed, assigned, retried, archived. `metadata_json` is
-- deliberately limited to safe, non-PII summary fields by the repository.
CREATE TABLE IF NOT EXISTS lead_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  actor TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);
