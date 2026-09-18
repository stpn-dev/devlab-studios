-- DevLab Lead Intelligence Engine.
--
-- Every table is prefixed `lead_` and lives in the SAME database as the CMS
-- rather than a new one. Two reasons, both operational rather than aesthetic:
--
--   1. Contact-form attribution (see `lead_tracking_tokens` /
--      `lead_tracking_events` below) has to associate an inbound submission in
--      the existing `leads` table with an outbound prospect in `lead_leads`.
--      A D1 statement cannot join across databases, so a separate database
--      would turn that single query into an application-level join that can
--      silently half-succeed.
--   2. The engine is operated by the same admin, behind the same auth, from
--      the same Worker. A second database buys separation that the `lead_`
--      prefix already provides, at the cost of a second migration lineage and
--      a second backup/restore procedure.
--
-- NOTHING here touches an existing table. The pre-existing `leads` table
-- (inbound contact-form submissions) is a DIFFERENT concept from `lead_leads`
-- (outbound prospects discovered by this engine) and the two are deliberately
-- never merged: inbound submissions are people who asked to be contacted,
-- outbound prospects are businesses that did not.

-- ---------------------------------------------------------------------------
-- Settings and feature flags
-- ---------------------------------------------------------------------------

-- Runtime-editable operational configuration: scoring thresholds, signal
-- weights, crawl/AI/discovery budgets, compliance business address, crawler
-- identity. Code in src/lead-engine/config/defaults.js holds the DEFAULTS; a
-- row here overrides one. Kept as key/value rather than columns so adding a
-- tunable is a code change with a default, not a migration.
--
-- `is_secret` marks a value the admin UI must never render in plaintext. Real
-- secrets (OAuth client secret, refresh token, API keys) do NOT belong here at
-- all — they are Cloudflare Worker secrets. This flag is for merely sensitive
-- operational values such as the Zoho account id.
CREATE TABLE IF NOT EXISTS lead_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0 CHECK (is_secret IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------

-- A campaign is the ONLY place vertical-specific knowledge lives: which
-- country, which metros, which OSM tags, which search queries, which industry
-- language. The engine itself is vertical-agnostic, so "property management"
-- appears in a campaign row and never in a source file.
--
-- `status` gates live work. A campaign is created `draft` and must be moved to
-- `active` by a human — nothing in this schema or in the scheduler promotes a
-- campaign on its own. `schedule_enabled` is a second, independent switch: an
-- active campaign still does not run on the cron until it is set.
CREATE TABLE IF NOT EXISTS lead_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  -- Vertical configuration: metros, OSM tag mappings, Brave queries, industry
  -- labels, ICP keywords, disqualifying keywords. Genuinely open-ended and
  -- per-campaign, which is what JSON is for. Validated by a zod schema at the
  -- API boundary (src/lead-engine/schemas/campaign.ts) before it is written.
  config_json TEXT NOT NULL DEFAULT '{}',
  -- Hard per-campaign ceilings, enforced in addition to the global daily
  -- budgets in `lead_usage_daily`. Whichever limit is lower wins.
  max_candidates INTEGER NOT NULL DEFAULT 100 CHECK (max_candidates >= 0),
  max_ai_reviews INTEGER NOT NULL DEFAULT 40 CHECK (max_ai_reviews >= 0),
  -- Independent of `status`. Both must be on for cron to touch this campaign.
  schedule_enabled INTEGER NOT NULL DEFAULT 0 CHECK (schedule_enabled IN (0, 1)),
  schedule_cron TEXT,
  last_run_at TEXT,
  last_run_status TEXT,
  last_run_error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_campaigns_status ON lead_campaigns(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_campaigns_schedule ON lead_campaigns(schedule_enabled, status);

-- ---------------------------------------------------------------------------
-- Source registry
-- ---------------------------------------------------------------------------

-- An allow-list of places the engine is permitted to read from. A source that
-- is not a row here cannot be used, which is the mechanism that stops an
-- arbitrary directory URL from quietly becoming an automated scrape target.
--
-- `automation_allowed` and `crawl_allowed` are separate on purpose: a source
-- may permit programmatic API access while forbidding page crawling, or the
-- reverse. `policy_status` records a HUMAN's reading of that source's terms —
-- the software does not decide it.
CREATE TABLE IF NOT EXISTS lead_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL
    CHECK (type IN ('osm_overpass', 'search_api', 'manual_import', 'public_directory', 'website')),
  base_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  automation_allowed INTEGER NOT NULL DEFAULT 0 CHECK (automation_allowed IN (0, 1)),
  crawl_allowed INTEGER NOT NULL DEFAULT 0 CHECK (crawl_allowed IN (0, 1)),
  policy_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (policy_status IN ('unreviewed', 'approved', 'restricted', 'prohibited')),
  policy_notes TEXT NOT NULL DEFAULT '',
  last_policy_reviewed_at TEXT,
  last_policy_reviewed_by TEXT,
  -- Bumped when the normalization code for this source changes, so a record
  -- imported under old parsing rules is identifiable and re-normalizable.
  parser_version INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_run_status TEXT,
  last_run_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_enabled ON lead_sources(enabled, type);

-- The raw, normalized candidate as one source reported it, kept separate from
-- the deduplicated company. Provenance: when two sources disagree about a
-- company's name or address, both claims survive here and `lead_companies`
-- holds the resolved view.
--
-- `external_id` is the source's own identifier (an OSM node id, a search-result
-- URL). UNIQUE with source_id so re-running discovery is idempotent: the same
-- OSM node re-discovered updates its record rather than creating a second one.
CREATE TABLE IF NOT EXISTS lead_source_records (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  campaign_id TEXT,
  external_id TEXT NOT NULL,
  company_id TEXT,
  raw_name TEXT NOT NULL DEFAULT '',
  raw_website TEXT,
  raw_phone TEXT,
  raw_email TEXT,
  raw_address TEXT,
  raw_city TEXT,
  raw_region TEXT,
  raw_country_code TEXT,
  raw_category TEXT,
  -- The source's own payload, trimmed to the fields we normalize from. Never
  -- the entire upstream response — see docs/lead-engine/discovery.md.
  payload_json TEXT NOT NULL DEFAULT '{}',
  parser_version INTEGER NOT NULL DEFAULT 1,
  discovered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES lead_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES lead_companies(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_source_records_external
  ON lead_source_records(source_id, external_id);
CREATE INDEX IF NOT EXISTS idx_lead_source_records_company ON lead_source_records(company_id);
CREATE INDEX IF NOT EXISTS idx_lead_source_records_campaign
  ON lead_source_records(campaign_id, discovered_at DESC);

-- ---------------------------------------------------------------------------
-- Companies and leads
-- ---------------------------------------------------------------------------

-- The deduplicated business. Keyed by canonical domain (registrable domain,
-- lowercased, no www, no scheme) because that is the only identifier two
-- independent sources reliably agree on — names and addresses do not survive
-- round-tripping through a directory.
--
-- `canonical_domain` is UNIQUE and NOT NULL. A candidate with no resolvable
-- website is not admitted: the entire research pipeline reads a public
-- website, so a company without one has nothing for the engine to work from.
CREATE TABLE IF NOT EXISTS lead_companies (
  id TEXT PRIMARY KEY,
  canonical_domain TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  industry TEXT,
  country_code TEXT,
  region TEXT,
  metro TEXT,
  city TEXT,
  postal_code TEXT,
  street_address TEXT,
  phone TEXT,
  latitude REAL,
  longitude REAL,
  first_discovered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_companies_country ON lead_companies(country_code, metro);
CREATE INDEX IF NOT EXISTS idx_lead_companies_industry ON lead_companies(industry);

-- The pipeline record: one company inside one campaign.
--
-- Separate from `lead_companies` so the same business discovered by two
-- campaigns is crawled, scored and researched ONCE while still having its own
-- independent pipeline state, contact and conversation per campaign. `lead_id`
-- everywhere else in this schema refers to THIS table.
--
-- `stage` is a wide CHECK rather than a lookup table because the set is closed,
-- code-defined (src/lead-engine/domain/pipeline.js) and must fail loudly on a
-- typo. Transitions are NOT constrained here: the pipeline is deliberately
-- non-linear (a lead can jump from RESEARCHED straight to DO_NOT_CONTACT), and
-- encoding a transition matrix in SQL would make legitimate jumps impossible
-- while catching nothing the application layer does not already check.
CREATE TABLE IF NOT EXISTS lead_leads (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (stage IN (
    'DISCOVERED', 'RESEARCHING', 'RESEARCHED', 'RULE_QUALIFIED', 'AI_REVIEW',
    'AI_QUALIFIED', 'CONTACT_FOUND', 'READY_FOR_REVIEW', 'READY_TO_CONTACT',
    'CONTACTED', 'AWAITING_REPLY', 'REPLIED', 'CONVERSATION', 'MEETING',
    'PROPOSAL', 'WON', 'LOST',
    'NOT_QUALIFIED', 'HOLD', 'NO_CONTACT', 'DO_NOT_CONTACT', 'UNSUBSCRIBED',
    'BOUNCED', 'NOT_INTERESTED', 'ARCHIVED'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  -- Denormalized from the latest `lead_scores` row so the leads table can sort
  -- and filter on score without a correlated subquery per row. The score rows
  -- remain the auditable record; this is a cache and is rewritten on rescore.
  rule_score INTEGER,
  ai_confidence REAL,
  -- Denormalized likewise from the latest AI run, for the leads-table column.
  opportunity_type TEXT,
  -- Human-readable recommended next step, computed by the pipeline service.
  next_action TEXT,
  hold_reason TEXT,
  lost_reason TEXT,
  last_activity_at TEXT,
  stage_changed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES lead_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES lead_companies(id) ON DELETE CASCADE
);

-- The dedupe guarantee: a company appears at most once per campaign. Duplicate
-- workflow or queue delivery therefore cannot create a second lead — the
-- insert is an upsert against this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_leads_campaign_company
  ON lead_leads(campaign_id, company_id);
CREATE INDEX IF NOT EXISTS idx_lead_leads_stage ON lead_leads(stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_leads_campaign_stage ON lead_leads(campaign_id, stage);
CREATE INDEX IF NOT EXISTS idx_lead_leads_score ON lead_leads(rule_score DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_leads_activity ON lead_leads(last_activity_at DESC);

-- ---------------------------------------------------------------------------
-- Research: crawl runs and signals
-- ---------------------------------------------------------------------------

-- One row per crawl attempt against one company. Append-only: a failed crawl
-- and its later successful retry both survive, so "this site blocks us" is
-- distinguishable from "we never tried".
--
-- `skip_reason` carries the disallowed case. When robots.txt, a source policy
-- or an SSRF guard refuses a URL, the run is recorded as skipped WITH the
-- reason rather than silently not happening.
CREATE TABLE IF NOT EXISTS lead_crawl_runs (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  method TEXT NOT NULL DEFAULT 'fetch' CHECK (method IN ('fetch', 'browser')),
  pages_attempted INTEGER NOT NULL DEFAULT 0,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  bytes_fetched INTEGER NOT NULL DEFAULT 0,
  robots_allowed INTEGER CHECK (robots_allowed IN (0, 1)),
  skip_reason TEXT,
  error_message TEXT,
  -- Per-page outcomes: url, status, content-type, bytes, whether it was used.
  -- Never page bodies.
  pages_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES lead_companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_crawl_runs_lead ON lead_crawl_runs(lead_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_crawl_runs_status ON lead_crawl_runs(status, started_at DESC);

-- One row per deterministic observation. Rows rather than a JSON blob on the
-- lead, because scoring joins against these, the admin filters on them, and
-- each carries its own evidence and confidence.
--
-- `evidence` is a SHORT excerpt (bounded in code) supporting the observation —
-- enough for a human to verify the signal without the engine retaining the
-- page. Full HTML is never stored.
CREATE TABLE IF NOT EXISTS lead_signals (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  crawl_run_id TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'website', 'contact', 'scheduling', 'chat', 'crm_marketing',
    'operations', 'manual_language', 'complexity', 'technology'
  )),
  signal_key TEXT NOT NULL,
  value_text TEXT,
  detected INTEGER NOT NULL DEFAULT 1 CHECK (detected IN (0, 1)),
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source_url TEXT,
  evidence TEXT,
  extractor_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (crawl_run_id) REFERENCES lead_crawl_runs(id) ON DELETE SET NULL
);

-- A re-crawl replaces a lead's signals wholesale (delete-then-insert in one
-- batch), so this uniqueness holds and re-extraction is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_signals_unique
  ON lead_signals(lead_id, category, signal_key);
CREATE INDEX IF NOT EXISTS idx_lead_signals_lead ON lead_signals(lead_id, category);
CREATE INDEX IF NOT EXISTS idx_lead_signals_key ON lead_signals(signal_key, detected);

-- ---------------------------------------------------------------------------
-- Deterministic scoring
-- ---------------------------------------------------------------------------

-- One row per scoring run. Append-only, so changing a weight and rescoring
-- leaves the previous score auditable and comparable.
--
-- `reasons_json` is the explainability record: an array of
-- {code, label, points, category}. The lead detail screen renders it verbatim.
-- The total is stored alongside rather than recomputed, so the displayed score
-- always matches the reasons that produced it even after weights change.
CREATE TABLE IF NOT EXISTS lead_scores (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  total INTEGER NOT NULL,
  icp_fit INTEGER NOT NULL DEFAULT 0,
  workflow_opportunity INTEGER NOT NULL DEFAULT 0,
  contactability INTEGER NOT NULL DEFAULT 0,
  data_quality INTEGER NOT NULL DEFAULT 0,
  routing TEXT NOT NULL CHECK (routing IN ('not_qualified', 'hold', 'ai_review', 'priority_ai_review')),
  reasons_json TEXT NOT NULL DEFAULT '[]',
  -- Which weight/threshold configuration produced this score.
  ruleset_version INTEGER NOT NULL DEFAULT 1,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_scores_lead ON lead_scores(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_scores_current ON lead_scores(is_current, total DESC);

-- ---------------------------------------------------------------------------
-- Workers AI audit
-- ---------------------------------------------------------------------------

-- Every Workers AI call, successful or not. This is the cost ledger, the
-- prompt-version record and the debugging trail in one table.
--
-- `prompt_version` names a file under src/lead-engine/ai/prompts/, which is in
-- Git. A result whose prompt cannot be reconstructed is not auditable, so the
-- prompts are never inlined into UI or route code.
CREATE TABLE IF NOT EXISTS lead_ai_runs (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  conversation_id TEXT,
  message_id TEXT,
  task TEXT NOT NULL CHECK (task IN (
    'opportunity_review', 'outreach_draft', 'reply_analysis', 'reply_draft'
  )),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'invalid_output', 'failed', 'skipped')),
  -- Structured, schema-validated model output. NULL when status is not 'ok'.
  result_json TEXT,
  confidence REAL,
  -- Raw output is retained ONLY when validation rejected it, because that is
  -- the one case where a human needs to see what the model actually said.
  -- Bounded in code.
  raw_output TEXT,
  error_message TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  neurons REAL,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_ai_runs_lead ON lead_ai_runs(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_runs_task ON lead_ai_runs(task, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_runs_created ON lead_ai_runs(created_at DESC);

-- ---------------------------------------------------------------------------
-- Contacts and provenance
-- ---------------------------------------------------------------------------

-- A publicly published business contact address, with the evidence for where
-- it was published.
--
-- Provenance is not metadata here, it is the admission requirement:
-- `source_url` and `source_type` are NOT NULL because an address without a
-- recorded public source cannot be shown as ready for outreach. Guessed or
-- pattern-derived addresses (firstname.lastname@) are never written — there is
-- no `inferred` value in `source_type` by design.
--
-- `mx_present` records that the domain publishes MX records. That is NOT
-- mailbox verification and the column name, the UI label and
-- docs/lead-engine/contacts.md all say so.
CREATE TABLE IF NOT EXISTS lead_contacts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  role_title TEXT,
  email_type TEXT NOT NULL DEFAULT 'role'
    CHECK (email_type IN ('role', 'named', 'generic')),
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('company_contact_page', 'company_about_page', 'company_team_page',
                           'company_homepage', 'company_other_page', 'structured_data',
                           'source_record', 'manual_entry')),
  published_publicly INTEGER NOT NULL DEFAULT 1 CHECK (published_publicly IN (0, 1)),
  is_business_contact INTEGER NOT NULL DEFAULT 1 CHECK (is_business_contact IN (0, 1)),
  syntax_valid INTEGER NOT NULL DEFAULT 0 CHECK (syntax_valid IN (0, 1)),
  domain_matches_company INTEGER NOT NULL DEFAULT 0 CHECK (domain_matches_company IN (0, 1)),
  -- NULL = not checked yet. 0/1 = checked, absent/present.
  mx_present INTEGER CHECK (mx_present IN (0, 1)),
  mx_checked_at TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  discovered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES lead_companies(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_contacts_unique ON lead_contacts(lead_id, email);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_email ON lead_contacts(email);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_company ON lead_contacts(company_id);

-- ---------------------------------------------------------------------------
-- Compliance and suppression
-- ---------------------------------------------------------------------------

-- The per-lead compliance state for the campaign's country profile.
--
-- This is an OPERATIONAL SAFEGUARD RECORD, not a legal determination. It
-- records which configured checks passed, which country profile applied and
-- what a human reviewer decided. The software does not and cannot certify
-- compliance — see docs/lead-engine/compliance.md.
CREATE TABLE IF NOT EXISTS lead_compliance_reviews (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  country_code TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'passed', 'blocked', 'needs_human_review', 'waived')),
  -- Per-check results: {key, required, passed, detail}. Rendered on the lead
  -- detail screen so a blocked lead says exactly which check blocked it.
  checks_json TEXT NOT NULL DEFAULT '[]',
  -- PH profile: which lawful basis was asserted and by whom. Free-text
  -- reference to an assessment held outside this system.
  legal_basis TEXT,
  legal_basis_reference TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_compliance_lead ON lead_compliance_reviews(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_compliance_state ON lead_compliance_reviews(state, updated_at DESC);

-- The hard boundary. A match here stops outreach generation entirely — it is
-- checked at draft generation, at Zoho draft creation and at review-queue
-- admission, so no single missed call site can let a suppressed address
-- through.
--
-- `scope` distinguishes an individual address from an entire domain. A domain
-- entry suppresses every address at that domain, including ones not yet
-- discovered.
--
-- Rows are never hard-deleted by normal operation: `removed_at` /
-- `removed_by` / `removal_reason` preserve the audit trail of an unsuppression,
-- which is a privileged action.
CREATE TABLE IF NOT EXISTS lead_suppression (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('email', 'domain')),
  -- Lowercased address or registrable domain.
  value TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'unsubscribe', 'do_not_contact', 'hard_bounce', 'complaint',
    'manual_block', 'existing_client', 'competitor', 'other'
  )),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'inbound_reply', 'bounce', 'import', 'system')),
  lead_id TEXT,
  message_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL,
  removed_at TEXT,
  removed_by TEXT,
  removal_reason TEXT,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE SET NULL
);

-- Partial unique index: one ACTIVE entry per value/scope, while any number of
-- historical (removed) entries for the same value may coexist.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_suppression_active
  ON lead_suppression(scope, value) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_suppression_value ON lead_suppression(value);
CREATE INDEX IF NOT EXISTS idx_lead_suppression_created ON lead_suppression(created_at DESC);

-- ---------------------------------------------------------------------------
-- Conversations and messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_conversations (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  contact_id TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'awaiting_reply', 'needs_attention', 'resolved', 'closed')),
  subject TEXT NOT NULL DEFAULT '',
  -- The provider's own thread identifier when it exposes one. Preferred over
  -- header matching; see docs/lead-engine/conversations.md.
  provider TEXT NOT NULL DEFAULT 'zoho',
  provider_thread_id TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES lead_contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_conversations_lead ON lead_conversations(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_conversations_status
  ON lead_conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_conversations_thread
  ON lead_conversations(provider, provider_thread_id);

-- Immutable once written. The mailbox sync only ever INSERTs; nothing in the
-- application updates a message body, because the conversation view is a
-- record of what was actually said.
--
-- `provider_message_id` is UNIQUE per provider, which is what makes mailbox
-- sync idempotent: re-syncing an overlapping window, or a duplicate queue
-- delivery, cannot import the same message twice.
CREATE TABLE IF NOT EXISTS lead_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  provider TEXT NOT NULL DEFAULT 'zoho',
  provider_message_id TEXT,
  provider_folder TEXT,
  -- RFC 5322 Message-ID / In-Reply-To / References, when the provider exposes
  -- them. Used for thread matching in preference to subject heuristics.
  internet_message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_addresses TEXT NOT NULL DEFAULT '[]',
  cc_addresses TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  -- Plain text only. Raw MIME and HTML parts are deliberately not retained:
  -- the reply copilot reads text, and storing full MIME would keep more
  -- personal data than the purpose requires.
  body_text TEXT NOT NULL DEFAULT '',
  body_truncated INTEGER NOT NULL DEFAULT 0 CHECK (body_truncated IN (0, 1)),
  -- Deterministic classification (opt-out/objection detection) runs BEFORE any
  -- AI and is recorded here; `ai_summary` is added afterwards, if at all.
  classification TEXT,
  ai_summary TEXT,
  ai_intent TEXT,
  received_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES lead_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_messages_provider
  ON lead_messages(provider, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_messages_conversation
  ON lead_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_messages_lead ON lead_messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_messages_internet_id ON lead_messages(internet_message_id);

-- ---------------------------------------------------------------------------
-- Outreach drafts
-- ---------------------------------------------------------------------------

-- A suggested message. NEVER a send queue.
--
-- There is no `sent` status and no `send_after` column in this table, and that
-- absence is the architecture: nothing in this system can transition a draft to
-- sent, because nothing in this system sends. `zoho_draft_id` records that the
-- message was SAVED TO THE ZOHO DRAFTS FOLDER; the transition to CONTACTED
-- comes later and exclusively from observing the message in Zoho's Sent folder.
CREATE TABLE IF NOT EXISTS lead_outreach_drafts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  contact_id TEXT,
  conversation_id TEXT,
  -- 'initial' = first outreach, 'reply' = suggested response to an inbound
  -- message.
  kind TEXT NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial', 'reply')),
  -- For a reply draft: the inbound message it answers.
  in_reply_to_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'edited', 'zoho_draft_created', 'zoho_draft_failed', 'discarded', 'superseded'
  )),
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  -- Which generation produced this: the AI run, or a human edit.
  ai_run_id TEXT,
  generated_by TEXT NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai', 'human')),
  -- 'regenerate' | 'shorter' | 'more_technical' | 'suggest_call' | 'no_cta' | null
  variant TEXT,
  edited_by TEXT,
  edited_at TEXT,
  zoho_draft_id TEXT,
  zoho_message_id TEXT,
  zoho_draft_created_at TEXT,
  zoho_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES lead_contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (conversation_id) REFERENCES lead_conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (ai_run_id) REFERENCES lead_ai_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_drafts_lead ON lead_outreach_drafts(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_drafts_status ON lead_outreach_drafts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_drafts_conversation
  ON lead_outreach_drafts(conversation_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- First-party tracking
-- ---------------------------------------------------------------------------

-- Opaque redirect tokens for /r/:token.
--
-- `token` is 32 bytes of crypto.getRandomValues, base64url — non-sequential and
-- unguessable, so a token reveals nothing about how many leads exist or who
-- they are. `destination_url` is stored resolved and is re-validated against
-- the allow-list at redirect time, so an open redirect needs BOTH a database
-- write and an allow-list change.
CREATE TABLE IF NOT EXISTS lead_tracking_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  lead_id TEXT NOT NULL,
  campaign_id TEXT,
  draft_id TEXT,
  destination_url TEXT NOT NULL,
  label TEXT,
  click_count INTEGER NOT NULL DEFAULT 0,
  first_clicked_at TEXT,
  last_clicked_at TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES lead_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (draft_id) REFERENCES lead_outreach_drafts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_tracking_tokens_lead ON lead_tracking_tokens(lead_id);

-- One row per click. No tracking pixels exist anywhere in this system: an open
-- is not recorded, because it is not actionable and requires embedding a
-- resource in someone's inbox.
CREATE TABLE IF NOT EXISTS lead_tracking_events (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'click'
    CHECK (event_type IN ('click', 'contact_form_conversion')),
  -- The inbound contact-form submission this converted into, when it did.
  -- References the pre-existing `leads` table by id. Deliberately NOT a
  -- foreign key: `leads` is the public site's own table and this engine must
  -- never be able to block or cascade a delete there.
  inbound_lead_id TEXT,
  destination_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (token_id) REFERENCES lead_tracking_tokens(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_tracking_events_token
  ON lead_tracking_events(token_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_tracking_events_lead
  ON lead_tracking_events(lead_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Activity timeline
-- ---------------------------------------------------------------------------

-- Append-only. Nothing updates or deletes a row here, which is what makes the
-- lead detail timeline trustworthy: it is the record of what the system and
-- the operator actually did, not a derived summary that can drift from it.
--
-- `event_type` is unconstrained by CHECK on purpose — unlike `stage`, this set
-- grows with every new capability, and a migration per new event type would
-- make adding one needlessly expensive. The valid set lives in
-- src/lead-engine/domain/activity.js.
--
-- `dedupe_key` supports idempotency: an event that must not be recorded twice
-- for the same cause (a duplicate queue delivery re-recording CRAWL_COMPLETED)
-- carries a stable key and the insert is OR IGNORE.
CREATE TABLE IF NOT EXISTS lead_activity (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  campaign_id TEXT,
  conversation_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  actor_email TEXT,
  summary TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  from_stage TEXT,
  to_stage TEXT,
  dedupe_key TEXT,
  correlation_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES lead_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (conversation_id) REFERENCES lead_conversations(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_activity_dedupe
  ON lead_activity(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_activity_lead ON lead_activity(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activity_created ON lead_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activity_type ON lead_activity(event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- Usage guardrails
-- ---------------------------------------------------------------------------

-- One row per (day, metric). Incremented before the work happens, so a budget
-- cannot be exceeded by work already in flight.
--
-- `limit_value` is copied in at first increment of the day from the effective
-- configuration, so the ledger records the budget that was actually in force
-- rather than whatever the setting happens to be when it is later read.
CREATE TABLE IF NOT EXISTS lead_usage_daily (
  id TEXT PRIMARY KEY,
  usage_date TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'discovery_candidates', 'crawl_pages', 'browser_runs', 'ai_reviews',
    'ai_neurons', 'brave_requests', 'overpass_requests', 'zoho_api_calls'
  )),
  campaign_id TEXT,
  used INTEGER NOT NULL DEFAULT 0,
  limit_value INTEGER,
  limit_reached_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES lead_campaigns(id) ON DELETE CASCADE
);

-- COALESCE so the global (campaign-less) counter and per-campaign counters
-- coexist without NULL defeating the uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_usage_daily_unique
  ON lead_usage_daily(usage_date, metric, COALESCE(campaign_id, ''));
CREATE INDEX IF NOT EXISTS idx_lead_usage_daily_date ON lead_usage_daily(usage_date DESC, metric);

-- ---------------------------------------------------------------------------
-- Mailbox synchronization state
-- ---------------------------------------------------------------------------

-- The incremental sync cursor. Without a durable cursor the only safe sync is a
-- full mailbox mirror, which this system explicitly does not do.
--
-- `last_success_at` and `last_error` are separate from `last_sync_at` so the
-- Zoho status screen can distinguish "ran and found nothing" from "has not
-- succeeded since Tuesday".
CREATE TABLE IF NOT EXISTS lead_sync_state (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'zoho',
  mailbox TEXT NOT NULL,
  folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent')),
  cursor TEXT,
  last_sync_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  last_error_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  messages_seen INTEGER NOT NULL DEFAULT 0,
  messages_imported INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_sync_state_unique
  ON lead_sync_state(provider, mailbox, folder);

-- ---------------------------------------------------------------------------
-- Durable job queue
-- ---------------------------------------------------------------------------

-- The engine's own work ledger, and the reason it runs correctly with NO
-- Cloudflare Queues or Workflows bindings configured.
--
-- Cloudflare Queues and Workflows are the preferred execution substrate and
-- the code supports them (src/lead-engine/queues/, src/lead-engine/workflows/),
-- but a Queue binding that names a queue which does not exist fails the whole
-- Worker deploy — including the public site. So dispatch goes through this
-- table: when the bindings are present the dispatcher hands work to them, and
-- when they are absent the same work is drained by the cron handler. Either
-- way D1 holds the authoritative record of what is outstanding, which is what
-- makes a half-finished run resumable.
--
-- `dedupe_key` is the idempotency mechanism: enqueueing the same logical job
-- twice is a no-op while the first is still pending or running.
CREATE TABLE IF NOT EXISTS lead_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'campaign_discovery', 'lead_research', 'ai_review', 'contact_discovery',
    'outreach_draft', 'mailbox_sync', 'reply_analysis', 'maintenance'
  )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead', 'cancelled')),
  campaign_id TEXT,
  lead_id TEXT,
  -- IDs and small scalars ONLY. Never HTML, never message bodies — the job
  -- carries a reference and the handler re-reads from D1.
  payload_json TEXT NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  -- Backoff. A job is invisible to the runner until this time.
  run_after TEXT NOT NULL,
  -- Set when a runner claims the job; a claim older than the lease timeout is
  -- reclaimable, so a Worker that died mid-job does not strand it forever.
  leased_until TEXT,
  last_error TEXT,
  -- 'dead' is the dead-letter state: attempts exhausted, visible in the admin
  -- as a failed research job, retryable by a human.
  dead_lettered_at TEXT,
  dedupe_key TEXT,
  correlation_id TEXT,
  -- When Workflows are bound, the instance that owns this job.
  workflow_instance_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES lead_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_jobs_dedupe
  ON lead_jobs(dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_lead_jobs_claim
  ON lead_jobs(status, run_after, priority DESC);
CREATE INDEX IF NOT EXISTS idx_lead_jobs_type ON lead_jobs(job_type, status);
CREATE INDEX IF NOT EXISTS idx_lead_jobs_lead ON lead_jobs(lead_id, created_at DESC);
