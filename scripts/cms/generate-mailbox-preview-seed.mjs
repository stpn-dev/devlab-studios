/**
 * Synthetic mail for the PREVIEW database, so the mail client can be reviewed
 * before a change reaches production.
 *
 * WHY NOT MIRROR PRODUCTION. mirror-production-to-preview.mjs copies content
 * and refuses to copy people: names, addresses, and the messages they sent.
 * Mail is the purest form of that, so the mailbox tables are on that script's
 * FORBIDDEN_TABLES list and this exists to fill the gap instead. Everything
 * below is invented. No address here belongs to anyone — `example.com`,
 * `example.org` and `example.net` are reserved by RFC 2606 precisely so that
 * fixtures cannot accidentally reach a real person.
 *
 * WHAT IT COVERS, and why each one is here rather than a single happy-path
 * thread: the mail client's screens only differ under conditions that a
 * one-message inbox never produces.
 *
 *   - a plain-text enquiry             the ordinary case
 *   - an HTML message with inline and  exercises the sanitizer, the cid:
 *     remote images, and an attachment resolver and the remote-image hold-back
 *   - a two-message thread with a      threading, and the outbound side of a
 *     sent reply                       conversation
 *   - a queued reply                   Outbox, and "not yet on the wire"
 *   - a failed reply with an error     Failed, and the Retry button
 *   - a hard bounce                    Bounces, correlation, the suppression
 *                                      warning
 *   - a DMARC aggregate report         DMARC reports, and the parsed view
 *
 * The DMARC report is a real one in shape but reports a FAILING source, because
 * the passing case is what production shows every day and the failing case is
 * the one nobody has ever seen rendered.
 *
 * Usage:
 *   node scripts/cms/generate-mailbox-preview-seed.mjs > scripts/cms/seed/mailbox-preview-seed.sql
 *   npx wrangler d1 execute devlab-studios-cms-preview --remote --env preview \
 *     --file scripts/cms/seed/mailbox-preview-seed.sql
 */

const DOMAIN = 'devlabconnect.com'

/** Stable ids, so re-running replaces the same rows instead of accumulating. */
const ID = {
  threadEnquiry: 'prev-thread-0000-0000-0000-000000000001',
  threadBranded: 'prev-thread-0000-0000-0000-000000000002',
  threadReplied: 'prev-thread-0000-0000-0000-000000000003',
  threadBounce: 'prev-thread-0000-0000-0000-000000000004',
  threadDmarc: 'prev-thread-0000-0000-0000-000000000005',
  msgEnquiry: 'prev-msg-0000-0000-0000-0000000000001',
  msgBranded: 'prev-msg-0000-0000-0000-0000000000002',
  msgAsked: 'prev-msg-0000-0000-0000-0000000000003',
  msgAnswered: 'prev-msg-0000-0000-0000-0000000000004',
  msgBounce: 'prev-msg-0000-0000-0000-0000000000005',
  msgDmarc: 'prev-msg-0000-0000-0000-0000000000006',
  attBranded: 'prev-att-0000-0000-0000-0000000000001',
  attDmarc: 'prev-att-0000-0000-0000-0000000000002',
  outSent: 'prev-out-0000-0000-0000-0000000000001',
  outQueued: 'prev-out-0000-0000-0000-0000000000002',
  outFailed: 'prev-out-0000-0000-0000-0000000000003',
}

const DAY = 24 * 60 * 60 * 1000
const base = Date.parse('2026-09-15T09:00:00.000Z')
const at = (days, hours = 0) => new Date(base + days * DAY + hours * 3600_000).toISOString()

/** @param {string|null|undefined} value */
const q = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`)

const BRANDED_HTML = [
  '<div style="font-family: Arial, sans-serif; color: #1a1a1a">',
  '<img data-cid="preview-logo" alt="Northwind Logistics" width="140">',
  '<p style="font-size: 16px; font-weight: bold; color: #0b5">Following up on our booking portal</p>',
  '<p>Hello — we spoke last month about replacing the spreadsheet our dispatchers use.</p>',
  '<table align="center" bgcolor="#f5f5f5" width="600"><tr><td valign="top" style="padding: 8px">',
  '<p>The attached brief has the volumes.</p></td></tr></table>',
  '<img data-remote-src="https://tracker.example.net/open.gif" width="1" height="1">',
  '</div>',
].join('')

const DMARC_XML_NOTE =
  'Aggregate report stored as an attachment. The preview copy reports a failing source so the alert path is visible.'

const rows = []

// --- threads ---------------------------------------------------------------
rows.push(
  ...[
    [ID.threadEnquiry, 'hello', 'Question about your booking systems', 'dana@example.com', 'Dana Whitfield', 1, 1, at(0)],
    [ID.threadBranded, 'hello', 'Following up on our booking portal', 'marketing@example.org', 'Northwind Logistics', 1, 1, at(1)],
    [ID.threadReplied, 'hello', 'Scoping a dispatch dashboard', 'priya@example.com', 'Priya Raman', 2, 0, at(2)],
    [ID.threadBounce, 'bounce', 'Undelivered Mail Returned to Sender', 'MAILER-DAEMON@example.net', null, 1, 1, at(3)],
    [ID.threadDmarc, 'dmarc', `Report domain: ${DOMAIN} Submitter: example.net`, 'noreply-dmarc@example.net', null, 1, 1, at(4)],
  ].map(
    ([id, mailbox, subject, correspondent, name, count, unread, when]) =>
      `INSERT INTO mailbox_threads (id, mailbox, subject, correspondent, correspondent_name, state, message_count, unread_count, last_message_at, last_inbound_at, created_at, updated_at) VALUES (${q(id)}, ${q(mailbox)}, ${q(subject)}, ${q(correspondent)}, ${q(name)}, 'inbox', ${count}, ${unread}, ${q(when)}, ${q(when)}, ${q(when)}, ${q(when)});`,
  ),
)

// --- inbound messages ------------------------------------------------------
const inbound = (id, threadId, mailbox, from, fromName, subject, text, html, when, extra = {}) =>
  `INSERT INTO mailbox_messages (id, thread_id, mailbox, direction, dedupe_key, envelope_from, envelope_to, message_id, in_reply_to, from_address, from_name, to_addresses, subject, body_text, body_html, stripped_remote_content, raw_key, raw_size, parse_status, auth_spf, auth_dkim, auth_dmarc, is_dsn, dsn_status, dsn_recipient, dsn_diagnostic, correlation_method, state, created_at, received_at) VALUES (${q(id)}, ${q(threadId)}, ${q(mailbox)}, 'inbound', ${q(`preview-${id}`)}, ${q(from)}, ${q(`${mailbox === 'hello' ? 'hello' : mailbox}@${DOMAIN}`)}, ${q(`<${id}@example.com>`)}, ${q(extra.inReplyTo ?? null)}, ${q(from)}, ${q(fromName)}, '[]', ${q(subject)}, ${q(text)}, ${q(html)}, ${extra.stripped ? 1 : 0}, ${q(`mailbox/raw/preview/${id}.eml`)}, ${text.length + 400}, 'ok', 'pass', 'pass', 'pass', ${extra.isDsn ? 1 : 0}, ${q(extra.dsnStatus ?? null)}, ${q(extra.dsnRecipient ?? null)}, ${q(extra.dsnDiagnostic ?? null)}, ${q(extra.correlation ?? null)}, 'inbox', ${q(when)}, ${q(when)});`

rows.push(
  inbound(
    ID.msgEnquiry,
    ID.threadEnquiry,
    'hello',
    'dana@example.com',
    'Dana Whitfield',
    'Question about your booking systems',
    'Hi — we run a small clinic group and the booking spreadsheet has become the bottleneck.\n\nDo you build something that handles rescheduling and reminders?\n\nDana',
    null,
    at(0),
  ),
  inbound(
    ID.msgBranded,
    ID.threadBranded,
    'hello',
    'marketing@example.org',
    'Northwind Logistics',
    'Following up on our booking portal',
    'Hello — we spoke last month about replacing the spreadsheet our dispatchers use. The attached brief has the volumes.',
    BRANDED_HTML,
    at(1),
    { stripped: true },
  ),
  inbound(
    ID.msgAsked,
    ID.threadReplied,
    'hello',
    'priya@example.com',
    'Priya Raman',
    'Scoping a dispatch dashboard',
    'Could you give a rough shape for a dispatch dashboard covering about forty drivers?',
    null,
    at(2),
  ),
  inbound(
    ID.msgBounce,
    ID.threadBounce,
    'bounce',
    'MAILER-DAEMON@example.net',
    null,
    'Undelivered Mail Returned to Sender',
    'This is the mail system at host mx.example.net.\n\nYour message could not be delivered.\n\n<orders@example.net>: host mx.example.net said: 550 5.1.1 User unknown',
    null,
    at(3),
    {
      isDsn: true,
      dsnStatus: '5.1.1',
      dsnRecipient: 'orders@example.net',
      dsnDiagnostic: 'smtp; 550 5.1.1 User unknown',
      correlation: 'verp',
    },
  ),
  inbound(
    ID.msgDmarc,
    ID.threadDmarc,
    'dmarc',
    'noreply-dmarc@example.net',
    null,
    `Report domain: ${DOMAIN} Submitter: example.net`,
    DMARC_XML_NOTE,
    null,
    at(4),
  ),
)

// --- attachments -----------------------------------------------------------
// r2_key points at objects that do not exist in the preview bucket. That is
// deliberate and visible: the UI shows the filename and size, and a download
// fails honestly rather than the seed pretending to storage it never wrote.
rows.push(
  `INSERT INTO mailbox_attachments (id, message_id, filename, original_filename, content_type, size, content_id, disposition, r2_key, created_at) VALUES (${q(ID.attBranded)}, ${q(ID.msgBranded)}, 'dispatch-volumes-brief.pdf', 'dispatch-volumes-brief.pdf', 'application/pdf', 184320, '<preview-logo>', 'attachment', ${q('mailbox/att/preview/brief.pdf')}, ${q(at(1))});`,
  `INSERT INTO mailbox_attachments (id, message_id, filename, original_filename, content_type, size, content_id, disposition, r2_key, created_at) VALUES (${q(ID.attDmarc)}, ${q(ID.msgDmarc)}, 'example.net!${DOMAIN}!1789948800!1790035199.zip', NULL, 'application/zip', 742, NULL, 'attachment', ${q('mailbox/att/preview/dmarc.zip')}, ${q(at(4))});`,
)

// --- outbound --------------------------------------------------------------
const outbound = (id, threadId, to, subject, body, status, when, extra = {}) =>
  `INSERT INTO mailbox_outbound (id, thread_id, in_reply_to_message_id, mailbox, to_address, to_name, subject, body_text, message_id, in_reply_to, references_header, envelope_from, status, collected_at, sent_at, failed_at, error, provider_message_id, created_by, created_at, updated_at) VALUES (${q(id)}, ${q(threadId)}, ${q(extra.parent ?? null)}, 'hello', ${q(to)}, ${q(extra.toName ?? null)}, ${q(subject)}, ${q(body)}, ${q(`m.o-${id}.preview@${DOMAIN}`)}, ${q(extra.inReplyTo ?? null)}, ${q(extra.references ?? null)}, ${q(`bounce+o-${id}@${DOMAIN}`)}, ${q(status)}, ${q(extra.collectedAt ?? null)}, ${q(extra.sentAt ?? null)}, ${q(extra.failedAt ?? null)}, ${q(extra.error ?? null)}, ${q(extra.providerMessageId ?? null)}, 'preview@devlabstudios.com', ${q(when)}, ${q(when)});`

rows.push(
  outbound(
    ID.outSent,
    ID.threadReplied,
    'priya@example.com',
    'Re: Scoping a dispatch dashboard',
    'Happy to help — a dashboard for forty drivers is a two-to-three week build. I have put a rough shape below.\n\nDevLab Studios',
    'sent',
    at(2, 3),
    {
      parent: ID.msgAsked,
      toName: 'Priya Raman',
      inReplyTo: `${ID.msgAsked}@example.com`,
      references: `<${ID.msgAsked}@example.com>`,
      collectedAt: at(2, 3),
      sentAt: at(2, 3),
      providerMessageId: '<preview-sent@devlabconnect.com>',
    },
  ),
  outbound(
    ID.outQueued,
    ID.threadEnquiry,
    'dana@example.com',
    'Re: Question about your booking systems',
    'Hi Dana — yes, rescheduling and reminders are the core of what we build. Are you free this week for twenty minutes?',
    'queued',
    at(5),
    { parent: ID.msgEnquiry, toName: 'Dana Whitfield' },
  ),
  outbound(
    ID.outFailed,
    ID.threadBranded,
    'marketing@example.org',
    'Re: Following up on our booking portal',
    'Thanks for the brief — reading it now and will come back with a shape by Friday.',
    'failed',
    at(5, 1),
    {
      parent: ID.msgBranded,
      toName: 'Northwind Logistics',
      collectedAt: at(5, 1),
      failedAt: at(5, 2),
      error: 'Message failed: 451 4.7.1 Service unavailable - try again later',
    },
  ),
)

const header = `-- Generated by scripts/cms/generate-mailbox-preview-seed.mjs. Do not edit by hand.
--
-- SYNTHETIC MAIL FOR PREVIEW ONLY. Every address is in an RFC 2606 reserved
-- domain (example.com/org/net) so no fixture can reach a real person, and
-- nothing here is copied from production -- the mailbox tables are on
-- mirror-production-to-preview.mjs's FORBIDDEN_TABLES list because
-- correspondence is the same category of data as the lead tables.
--
-- NEVER RUN THIS AGAINST PRODUCTION. The DELETEs below are scoped to the
-- 'prev-' id prefix, so a misdirected run removes only rows this script wrote,
-- but the INSERTs would still put invented mail in a real inbox.

DELETE FROM mailbox_outbound WHERE id LIKE 'prev-%';
DELETE FROM mailbox_attachments WHERE id LIKE 'prev-%';
DELETE FROM mailbox_messages WHERE id LIKE 'prev-%';
DELETE FROM mailbox_threads WHERE id LIKE 'prev-%';
`

process.stdout.write(`${header}\n${rows.join('\n')}\n`)
