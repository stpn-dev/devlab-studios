-- Attachments on the way OUT.
--
-- WHY A SEPARATE TABLE FROM mailbox_attachments: that one belongs to a
-- mailbox_messages row and is written by the ingest pipeline from a part that
-- already arrived. This one belongs to a mailbox_outbound row, is written by an
-- operator before the message exists, and has to survive the gap between
-- "picked a file" and "pressed Send". They share a shape and nothing else;
-- merging them would mean a message_id column that is null for half the rows
-- and an outbound_id column that is null for the other half.
--
-- WHY outbound_id IS NULLABLE: the operator uploads while composing, and the
-- mailbox_outbound row does not exist until they send or save a draft. A row
-- with outbound_id NULL is an upload nobody has claimed yet. Claiming is a
-- single UPDATE guarded by `outbound_id IS NULL`, so the same upload cannot be
-- attached to two messages by a double-submit.
--
-- WHY `source` HAS NO CHECK: it records where the bytes came from — an operator
-- upload, a part forwarded from an inbound message, a file already in the CMS
-- media bucket — and that list grows the moment anyone adds another place to
-- attach from. 0014's header draws this distinction: `status` has a CHECK
-- because a message's state machine is closed; `mailbox` does not because the
-- set of addresses a domain answers is not. `source` is the second kind, and it
-- is enforced in src/mailbox/domain/attachmentSources.js by code that throws.
--
-- NO `INSERT OR IGNORE` ANYWHERE. Three tables in this schema have silently
-- discarded rows because a CHECK violation met an INSERT OR IGNORE
-- (lead_usage_daily.metric, lead_sources.type, lead_suppression.source). The
-- mailbox uses none, and this table adds none.
--
-- R2, NOT D1. `r2_key` points at the bytes; D1 holds only the metadata. A 10 MB
-- attachment base64-encoded into a D1 row would exceed what D1 will store and
-- would be read back on every list query that touches the table.

CREATE TABLE IF NOT EXISTS mailbox_outbound_attachments (
  id TEXT PRIMARY KEY,

  -- NULL until the compose that uploaded it is actually sent or saved.
  outbound_id TEXT,

  -- Sanitized at upload; this is what goes in Content-Disposition.
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,

  r2_key TEXT NOT NULL,

  -- 'upload' | 'inbound' | 'asset'. Enforced in code, deliberately not here.
  source TEXT NOT NULL DEFAULT 'upload',

  -- The operator's chosen order, assigned when the message claims them.
  -- NOT derived from created_at: two files picked in the same file dialog are
  -- uploaded within the same millisecond, and ordering by timestamp then falls
  -- back to the primary key, which is a random UUID. The recipient would see
  -- the parts in an order nobody chose.
  position INTEGER NOT NULL DEFAULT 0,

  created_by TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY (outbound_id) REFERENCES mailbox_outbound(id) ON DELETE CASCADE
);

-- Every send reads this: "the attachments for this message, in the order the
-- operator put them in".
CREATE INDEX IF NOT EXISTS idx_mailbox_outbound_attachments_outbound
  ON mailbox_outbound_attachments (outbound_id, position);

-- Finding uploads nobody claimed, so they can be swept later rather than
-- accumulating in R2 forever.
CREATE INDEX IF NOT EXISTS idx_mailbox_outbound_attachments_unclaimed
  ON mailbox_outbound_attachments (created_at)
  WHERE outbound_id IS NULL;
