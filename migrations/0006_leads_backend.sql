-- Phase 5: leads + delivery attempt tracking. Deliberately separate from
-- every content table above (never mixed with content data) — see the
-- Architecture doc's "content vs operations" split.
--
-- Reliability guarantee this exists for: a lead submitted through the
-- contact form is durably persisted here BEFORE any attempt to deliver it
-- downstream (Zoho), so a Zoho outage never loses a lead — it just leaves
-- it retryable.
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'contact-form',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_status_created ON leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email_created ON leads(email, created_at DESC);

-- One row per delivery attempt (initial background attempt + any manual
-- retries from the admin) — never overwritten, so the full history of
-- what was tried and when is always visible.
CREATE TABLE IF NOT EXISTS delivery_attempts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'zoho',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  status_code INTEGER,
  error_message TEXT,
  attempted_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_lead ON delivery_attempts(lead_id, attempted_at DESC);
