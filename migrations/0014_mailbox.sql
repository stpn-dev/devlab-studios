-- The devlabconnect.com mailbox.
--
-- WHY THESE ARE NOT lead_conversations / lead_messages.
--
-- The obvious move is to reuse the two tables 0012 already defines for mail,
-- and it is wrong for two structural reasons, both of which would have to be
-- undone rather than extended:
--
--   1. `lead_conversations.lead_id` is NOT NULL with a foreign key to
--      lead_leads, and `lead_messages` joins through it to lead_companies. A
--      mailbox receives mail from anyone -- a supplier, a recruiter, a
--      postmaster daemon, a stranger who found the address. Most inbound mail
--      has no lead and never will. Making lead_id nullable would mean
--      rebuilding two tables that six other tables reference, and would leave
--      every existing query joining on a column that is now sometimes absent.
--
--   2. `lead_messages` deliberately stores plain text and nothing else. 0012
--      says so in a comment and gives the reason: "storing full MIME would keep
--      more personal data than the purpose requires." That is a data-protection
--      decision about a prospect-research system, not an oversight. A mailbox
--      has the opposite requirement -- it must retain the raw message, because
--      a message we could not parse must still be readable by a human, and
--      because a DSN is only diagnosable from its original form.
--
-- So the mailbox owns mail, and the lead engine keeps owning the CRM's view of
-- a prospect exchange. They are BRIDGED, not merged: when an inbound message
-- correlates to a lead, the ingest path also writes it through the existing
-- `recordMessage` into lead_conversations/lead_messages, so the Replies queue,
-- the reply copilot and the lead timeline keep working unchanged. Nothing is
-- duplicated that the lead engine already owns -- bounces still resolve to a
-- draftId and go through `recordBounce`, which owns suppression.
--
-- ---------------------------------------------------------------------------
-- ON CHECK CONSTRAINTS, WHICH HAVE COST THIS SCHEMA TIME THREE TIMES
-- ---------------------------------------------------------------------------
--
-- lead_usage_daily.metric, lead_sources.type and lead_suppression.source each
-- silently discarded a new value because a CHECK rejected it and an
-- INSERT OR IGNORE swallowed the rejection. The row vanished and nothing
-- errored.
--
-- Two rules are applied here, and both matter:
--
--   a. NO `INSERT OR IGNORE` ANYWHERE IN THE MAILBOX CODE. Idempotency is a
--      plain INSERT plus an explicit UNIQUE-violation catch, so a CHECK
--      violation surfaces as an exception instead of as a missing row. This
--      removes the failure mode at its root rather than working around it.
--
--   b. A CHECK only where the set is genuinely closed and structural
--      (direction, state, status, parse_status). `mailbox` is deliberately
--      NOT constrained: the set of addresses this domain answers grows
--      (abuse@, postmaster@, dmarc@, a per-campaign address later), and the
--      vocabulary lives in src/mailbox/domain/mailboxes.js the same way
--      lead_activity.event_type's does in domain/activity.js -- enforced by
--      code that throws, which is louder than a constraint that hides.
--
-- src/mailbox/schema.test.js asserts the code vocabularies and these
-- constraints agree, so a value added to one without the other fails a test
-- rather than a production ingest.

-- ---------------------------------------------------------------------------
-- Threads
-- ---------------------------------------------------------------------------

-- A conversation in the mailbox. Created by the first message that does not
-- match an existing one; matched afterwards by References/In-Reply-To, never by
-- subject alone (see src/mailbox/domain/threading.js for the ordering and why).
CREATE TABLE IF NOT EXISTS mailbox_threads (
  id TEXT PRIMARY KEY,
  -- Which address this thread belongs to: 'hello', 'bounce', 'dmarc', ...
  -- No CHECK, on purpose. See the note above.
  mailbox TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  -- The other party, for the list view. Denormalized so the inbox list does not
  -- need a correlated subquery per row.
  correspondent TEXT NOT NULL DEFAULT '',
  correspondent_name TEXT,
  state TEXT NOT NULL DEFAULT 'inbox' CHECK (state IN ('inbox', 'archived', 'trash')),
  message_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  -- Set when the thread could be attributed to a lead. Nullable and SET NULL:
  -- deleting a lead must not delete the mail we exchanged with them.
  lead_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mailbox_threads_list
  ON mailbox_threads(mailbox, state, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_threads_lead ON mailbox_threads(lead_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_threads_correspondent ON mailbox_threads(correspondent);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

-- One row per message, inbound or outbound. INSERT-only for content: the
-- mailbox is a record of what was actually received. The only UPDATEs are to
-- read/lifecycle state and to the correlation columns, which are metadata about
-- the message rather than the message.
--
-- `raw_key` points at the complete original in R2 and is written BEFORE
-- parsing. A message that cannot be parsed still produces a row with
-- parse_status='failed' and a readable original -- silent discard is the
-- specific failure this schema is built to avoid.
CREATE TABLE IF NOT EXISTS mailbox_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  mailbox TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- Idempotency. `${mailbox}:${messageId}` when the message carries a
  -- Message-ID, `${mailbox}:sha256:${hash}` when it does not -- and plenty of
  -- automated mail does not. UNIQUE, and inserted with a plain INSERT so a
  -- duplicate raises rather than disappearing.
  dedupe_key TEXT NOT NULL UNIQUE,

  -- SMTP envelope, which is NOT the same as the From/To headers and is what
  -- decides bounce handling. `envelope_from` is the empty string for a DSN,
  -- which arrives as MAIL FROM:<> -- that is a valid, meaningful value here,
  -- not missing data.
  envelope_from TEXT NOT NULL DEFAULT '',
  envelope_to TEXT NOT NULL DEFAULT '',

  -- RFC 5322 identifiers, stored WITHOUT angle brackets.
  message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,

  from_address TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  reply_to TEXT,
  to_addresses TEXT NOT NULL DEFAULT '[]',
  cc_addresses TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',

  body_text TEXT NOT NULL DEFAULT '',
  -- Sanitized at ingest by src/mailbox/inbound/sanitizeHtml.js. The original
  -- HTML is never stored in D1 and never rendered; the raw message in R2 keeps
  -- it if it is ever needed for forensics.
  body_html TEXT,
  body_truncated INTEGER NOT NULL DEFAULT 0 CHECK (body_truncated IN (0, 1)),
  -- Whether sanitization removed remote references (images, iframes, link
  -- rel=preload). Surfaced in the UI so a stripped message does not read as a
  -- broken one.
  stripped_remote_content INTEGER NOT NULL DEFAULT 0 CHECK (stripped_remote_content IN (0, 1)),

  raw_key TEXT,
  raw_size INTEGER NOT NULL DEFAULT 0,
  parse_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (parse_status IN ('ok', 'partial', 'failed', 'skipped_too_large', 'raw_unavailable')),
  parse_error TEXT,

  -- Cloudflare's Authentication-Results, recorded verbatim per mechanism. Kept
  -- because a reply that fails DMARC is worth seeing before trusting it, and
  -- because a DSN's authentication state is the first thing to check when a
  -- bounce looks forged.
  auth_spf TEXT,
  auth_dkim TEXT,
  auth_dmarc TEXT,

  -- Delivery Status Notification fields, parsed from message/delivery-status.
  is_dsn INTEGER NOT NULL DEFAULT 0 CHECK (is_dsn IN (0, 1)),
  dsn_action TEXT,
  dsn_status TEXT,
  dsn_recipient TEXT,
  dsn_diagnostic TEXT,

  -- How this message was attributed, so a wrong attribution is debuggable:
  -- 'verp' | 'message_id' | 'address' | 'thread' | null.
  correlation_method TEXT,
  lead_id TEXT,
  draft_id TEXT,

  read_at TEXT,
  state TEXT NOT NULL DEFAULT 'inbox' CHECK (state IN ('inbox', 'archived', 'trash')),

  received_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY (thread_id) REFERENCES mailbox_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES lead_leads(id) ON DELETE SET NULL,
  FOREIGN KEY (draft_id) REFERENCES lead_outreach_drafts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mailbox_messages_thread
  ON mailbox_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_message_id
  ON mailbox_messages(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_mailbox
  ON mailbox_messages(mailbox, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_dsn
  ON mailbox_messages(is_dsn, created_at DESC) WHERE is_dsn = 1;
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_draft ON mailbox_messages(draft_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_from ON mailbox_messages(from_address);
-- Unparsed mail is an operational queue, not an archive: this is what the
-- diagnostics screen reads.
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_unparsed
  ON mailbox_messages(parse_status, created_at DESC) WHERE parse_status != 'ok';

-- ---------------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------------

-- Metadata in D1, bytes in R2. `filename` is the sanitized name used for the
-- download; `original_filename` is kept verbatim because it is evidence, and
-- because a name that had to be sanitized is itself worth being able to see.
--
-- Nothing derives an R2 key from a filename -- `r2_key` is generated from the
-- message id and an index, so a crafted name cannot traverse or collide.
CREATE TABLE IF NOT EXISTS mailbox_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  -- For inline parts referenced by cid: in the HTML body. Recorded so an inline
  -- image is distinguishable from a real attachment in the UI; the sanitizer
  -- strips cid: references rather than resolving them.
  content_id TEXT,
  disposition TEXT NOT NULL DEFAULT 'attachment',
  r2_key TEXT NOT NULL,
  -- Set when the part exceeded the per-attachment ceiling and the bytes were
  -- not stored. The row still exists so the UI can say what was dropped.
  skipped_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES mailbox_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mailbox_attachments_message ON mailbox_attachments(message_id);

-- ---------------------------------------------------------------------------
-- Outbound queue
-- ---------------------------------------------------------------------------

-- A reply composed in the CMS, waiting for the external sender to transmit it.
--
-- THIS IS NOT A SEND CAPABILITY. It is the same boundary the lead engine's
-- outbox already draws: this application decides what may be sent and records
-- what was, and n8n -> Postfix -> OpenDKIM puts it on the wire. There is still
-- no SMTP client anywhere in this repository. An Email Worker cannot originate
-- arbitrary mail either -- `reply()` may only answer the sender of the message
-- currently being handled, once, and only if it passed DMARC -- so routing
-- replies through Postfix is what the platform permits as well as what the
-- architecture wants.
--
-- The message is built HERE, in full, including Message-ID, In-Reply-To and
-- References, so threading does not depend on what the sender chooses to add.
CREATE TABLE IF NOT EXISTS mailbox_outbound (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  -- The inbound message being answered, when this is a reply.
  in_reply_to_message_id TEXT,
  mailbox TEXT NOT NULL,

  to_address TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',

  -- Generated at compose time, not at send time. The draft/thread identity is
  -- encoded in the local part, which is what makes an asynchronous DSN
  -- correlatable even when the envelope sender could not be controlled.
  message_id TEXT NOT NULL,
  in_reply_to TEXT,
  references_header TEXT,
  -- The VERP envelope sender we ASK the transmitter to use. Whether it honours
  -- it is outside this application; correlation does not depend on it.
  envelope_from TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'collected', 'sent', 'failed', 'cancelled')),
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_outbound_message_id
  ON mailbox_outbound(message_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_outbound_status
  ON mailbox_outbound(status, created_at);
CREATE INDEX IF NOT EXISTS idx_mailbox_outbound_thread
  ON mailbox_outbound(thread_id, created_at);
