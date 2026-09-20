-- Widen mailbox_outbound.status to admit 'draft'.
--
-- WHY A MIGRATION AND NOT AN EDIT TO 0014: 0014 is already applied to both the
-- production and preview databases. Editing an applied migration is how two
-- environments quietly stop having the same schema.
--
-- WHAT IT IS FOR: the mailbox now presents Inbox / Drafts / Outbox / Sent like
-- any mail client, and a Drafts folder needs a reply that has been WRITTEN but
-- not handed to the transmitter. Until now composing a reply queued it
-- immediately, so there was no way to start one and come back to it — which is
-- the normal way people write anything they care about getting right.
--
-- WHY THE CHECK IS WIDENED RATHER THAN DROPPED: this set really is closed and
-- structural — it is the state machine of a message on its way out, and an
-- unrecognised value there would be a bug, not a new capability. That is the
-- distinction 0014's header draws: `mailbox` has no CHECK because the set of
-- addresses a domain answers grows, but `status` does because it does not.
--
-- THIS IS THE FOURTH TIME THIS SCHEMA HAS WIDENED A CHECK, and the previous
-- three (lead_usage_daily.metric, lead_sources.type, lead_suppression.source)
-- each silently discarded rows first, because an INSERT OR IGNORE swallowed the
-- violation. That cannot happen here: src/mailbox/ uses no INSERT OR IGNORE at
-- all, and src/mailbox/schema.test.js asserts both that fact and that this
-- exact value list matches what the code writes — so the code and the
-- constraint are changed together or the test fails.
--
-- 'draft' rows are invisible to the sender by construction: `collectQueued`
-- selects `WHERE status = 'queued'`, so a draft is never handed out. Promoting
-- one to 'queued' is the explicit act of sending it.
--
-- SQLite cannot ALTER a CHECK constraint, so the table is rebuilt. This is the
-- procedure from the SQLite documentation. Two tables reference mailbox_outbound
-- by foreign key in the OTHER direction only (it references them), and nothing
-- references it, so no dependent rows are affected -- verified before writing
-- this. Existing rows are preserved: an outbound message that is already queued,
-- sent or failed keeps its state.

PRAGMA foreign_keys = OFF;

CREATE TABLE mailbox_outbound_new (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  in_reply_to_message_id TEXT,
  mailbox TEXT NOT NULL,

  to_address TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',

  message_id TEXT NOT NULL,
  in_reply_to TEXT,
  references_header TEXT,
  envelope_from TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('draft', 'queued', 'collected', 'sent', 'failed', 'cancelled')),
  collected_at TEXT,
  sent_at TEXT,
  failed_at TEXT,
  error TEXT,
  provider_message_id TEXT,

  lead_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (thread_id) REFERENCES mailbox_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (in_reply_to_message_id) REFERENCES mailbox_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE SET NULL
);

INSERT INTO mailbox_outbound_new
  (id, thread_id, in_reply_to_message_id, mailbox, to_address, to_name, subject, body_text,
   message_id, in_reply_to, references_header, envelope_from,
   status, collected_at, sent_at, failed_at, error, provider_message_id,
   lead_id, created_by, created_at, updated_at)
SELECT
   id, thread_id, in_reply_to_message_id, mailbox, to_address, to_name, subject, body_text,
   message_id, in_reply_to, references_header, envelope_from,
   status, collected_at, sent_at, failed_at, error, provider_message_id,
   lead_id, created_by, created_at, updated_at
  FROM mailbox_outbound;

DROP TABLE mailbox_outbound;

ALTER TABLE mailbox_outbound_new RENAME TO mailbox_outbound;

-- Dropping the table drops its indexes, so all three are recreated exactly as
-- 0014 defined them. The UNIQUE index on message_id is what keeps a reply's
-- generated Message-ID unique, which is what a DSN echoes back to correlate a
-- bounce -- losing it would quietly break the bounce path.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_outbound_message_id
  ON mailbox_outbound(message_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_outbound_status
  ON mailbox_outbound(status, created_at);
CREATE INDEX IF NOT EXISTS idx_mailbox_outbound_thread
  ON mailbox_outbound(thread_id, created_at);

PRAGMA foreign_keys = ON;
