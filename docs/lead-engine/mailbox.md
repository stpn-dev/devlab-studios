# The devlabconnect.com mailbox

**Status as of 2026-09-23. Live and receiving.** Routing rules point at the
Worker, `MAILBOX_OUTBOX_TOKEN` is set, replies transmit, and DMARC aggregate
reports arrive at `dmarc@` and are parsed rather than filed unopened.

Verified against DNS on 2026-09-23: MX published to
`route1/2/3.mx.cloudflare.net`, and DMARC now carries
`rua=mailto:dmarc@devlabconnect.com`.

The earlier hazard — production running hand-deployed code that `main` did not
have, so a Workers Builds rebuild would roll back to a Worker with no `email()`
handler — is **resolved**. `origin/main` is downstream of the mailbox work, so a
rebuild is safe. Production runs 1.12.1; preview runs 1.13.0 and is ahead by the
DMARC-reading and preview-mail work.

This document covers *inbound mail and replies*. The outbound prospecting path
is [outbound-mail-infrastructure.md](outbound-mail-infrastructure.md); how a
draft reaches a recipient is [outreach-handoff.md](outreach-handoff.md).

## What this is

`hello@devlabconnect.com` is a real mailbox that lives inside the Admin CMS.
Mail arrives through Cloudflare Email Routing, is processed by an Email Worker
in the existing Worker, and is stored in D1 and R2. An operator reads and
answers it at `/admin/mailbox`. Replies go out as
`From: hello@devlabconnect.com` through the existing private Postfix instance.

There is no Zoho, no Google Workspace, no hosted mailbox provider, and no new
paid subscription.

## Why it had to exist

`devlabconnect.com` had **no MX and no apex address record**. Under RFC 5321 a
sender with no MX falls back to the domain's address record as an implicit MX;
with neither present, a remote server has no destination and fails immediately
and permanently rather than queuing.

Two consequences, the first worse than the second:

1. **A prospect who replied got a delivery failure notice.** We cold-email them,
   they engage — the most valuable outcome in the entire pipeline — and the
   domain tells them we do not exist.
2. **Every asynchronous DSN vanished.** The CRM never learned an address was
   dead, suppression never populated, and every future campaign retried dead
   addresses. That is the mechanism by which sending reputation is lost.

## Architecture

```
INBOUND
    a sender
        ↓  SMTP
    Cloudflare MX  (route1/2/3.mx.cloudflare.net)
        ↓  Email Routing rule → Worker
    email() in src/worker.ts
        ↓
    src/mailbox/inbound/ingest.js
        ↓                        ↓
    R2 (raw .eml, attachments)   D1 (mailbox_* tables)
                                 ↓
                           correlation → lead_* tables
                                 ↓
                           Admin CMS  /admin/mailbox

OUTBOUND (a human reply)
    /admin/mailbox → POST .../reply
        ↓
    mailbox_outbound  (status: queued)
        ↓  GET /api/mailbox/outbox   (bearer token)
    n8n  — submits the prebuilt message
        ↓  private Docker network 172.19.0.2 → 172.19.0.1:25
    Postfix → OpenDKIM → recipient MX
        ↓  POST .../sent
    mailbox_messages (direction: outbound)
```

Four properties this preserves:

- **Cloudflare owns the public inbound edge.** No inbound SMTP on the VPS.
- **The VPS stays outbound-only.** `mynetworks` is unchanged; no new listener.
- **Our CMS owns the mailbox UI and data.** Nothing is hosted elsewhere.
- **No SMTP client enters this codebase.** The application decides what may be
  sent and records what was; n8n and Postfix transmit.

### The email handler lives in the existing Worker

`ExportedHandler` accepts `email` alongside `fetch`, `scheduled` and `queue` —
verified against the installed `@cloudflare/workers-types`, not assumed. Since
`src/worker.ts` is already hand-maintained (the Durable Objects required it),
the mailbox shares this Worker's D1 and R2 bindings and its deployment. A
separate Worker would have meant a second deployment and a duplicate set of
bindings for no benefit.

It is inert until an Email Routing rule points an address at the Worker. That
is an account-level setting, not a binding, so **deploying this changes nothing
until the routing rules exist** — the same property the unbound Workflow
exports have.

### An Email Worker cannot send arbitrary mail

Confirmed against current Cloudflare documentation. `message.reply()` may only
answer the message currently being handled, once per event, only if that message
passed DMARC, and only from the domain that received it. A reply a person writes
hours later cannot use it.

That is *why* the reply path goes through Postfix — and it happens to be what
the architecture wanted anyway. Note the asymmetry the design depends on: an
inbound Email Worker is consistent with the CRM/transmitter boundary; an
outbound sender inside the Worker would not be.

## Storage: why new tables

`migrations/0014_mailbox.sql`. The obvious move was to reuse
`lead_conversations` and `lead_messages`, and it is wrong for two structural
reasons:

1. **`lead_conversations.lead_id` is NOT NULL** with a foreign key to
   `lead_leads`, and `lead_messages` joins through it to `lead_companies`. A
   mailbox receives mail from anyone — a supplier, a recruiter, a postmaster
   daemon, a stranger. Most inbound mail has no lead and never will.
2. **`lead_messages` deliberately stores plain text and nothing else.** 0012
   says so and gives the reason: "storing full MIME would keep more personal
   data than the purpose requires." That is a data-protection decision, not an
   oversight. A mailbox has the opposite requirement — a message we could not
   parse must still be readable.

So they are **bridged, not merged**. When an inbound message correlates to a
lead, `src/mailbox/services/bridge.js` also writes it through the lead engine's
own `recordMessage`, so the Conversations screen, the Replies queue and the
reply copilot work again unchanged — they have received nothing since the Zoho
sync was removed. The copy is text-only, which respects 0012's decision rather
than undoing it.

| Table | Holds |
|---|---|
| `mailbox_threads` | A conversation: mailbox, subject, correspondent, state, rollups, optional `lead_id` |
| `mailbox_messages` | One message: envelope, headers, text, sanitized HTML, auth results, DSN fields, R2 key |
| `mailbox_attachments` | Metadata; bytes in R2 |
| `mailbox_outbound` | A composed reply awaiting transmission |

R2 (`MAILBOX_BUCKET`) holds the raw `.eml` and the attachment bytes.

**It is deliberately NOT `MEDIA_BUCKET`.** That bucket is served publicly through
`R2_PUBLIC_BASE_URL` (a `pub-*.r2.dev` origin). Other people's correspondence
behind a public URL would be a data breach rather than a configuration choice.
Do not enable public access on the mailbox bucket.

### The CHECK-constraint trap, designed out

Three times this schema has silently discarded rows: `lead_usage_daily.metric`,
`lead_sources.type`, `lead_suppression.source`. Each time a CHECK rejected a new
value and an `INSERT OR IGNORE` swallowed the rejection.

Two rules apply here, and both matter:

- **No `INSERT OR IGNORE` anywhere in `src/mailbox/`.** Idempotency is a plain
  INSERT plus an explicit UNIQUE-violation catch, so a CHECK violation surfaces
  as an exception instead of as a missing row. `src/mailbox/schema.test.js`
  asserts this by scanning the source.
- **`mailbox` has no CHECK.** The set of addresses a domain answers grows, so
  the vocabulary lives in `src/mailbox/domain/mailboxes.js` and is enforced by
  code that throws — the same arrangement as `lead_activity.event_type`. The
  same test asserts the constraint is absent and that the closed sets
  (`direction`, `state`, `parse_status`, `status`) match what the code writes.

## DNS

### Published state, 2026-09-20

| Record | Type | Value | |
|---|---|---|---|
| `devlabconnect.com` | MX | `route1/2/3.mx.cloudflare.net` | Added by Email Routing. Priorities are assigned arbitrarily by Cloudflare; only their relative order matters |
| `devlabconnect.com` | TXT | `v=spf1 ip4:37.60.237.227 include:_spf.mx.cloudflare.net ~all` | Merged — both senders authorised. See below |
| `cf2024-1._domainkey` | TXT | Cloudflare's DKIM key | Added by Email Routing. Does **not** collide with our `s202609`; a domain may publish many selectors, and each signature names the one it used |
| `s202609._domainkey` | TXT | our OpenDKIM key | Unchanged |
| `_dmarc.devlabconnect.com` | TXT | `v=DMARC1; p=none; adkim=s; aspf=s` | Still no `rua` — add it once `dmarc@` receives |

### SPF: merged, deliberately

**The published record, as activated on 2026-09-20:**

```
v=spf1 ip4:37.60.237.227 include:_spf.mx.cloudflare.net ~all
```

Cloudflare's Email Routing onboarding merged its include into the existing
record rather than replacing it, and the operator chose to keep both
authorisations. That is a deliberate decision and this record is correct as it
stands: our own MTA (`ip4:37.60.237.227`) and Cloudflare are both authorised to
send as `devlabconnect.com`.

**What to watch, because the failure mode here is silent.** A domain may
publish only ONE SPF record. Two of them is not "both apply" — it is a
`permerror`, and SPF then fails for every receiver. So when anything touches
this record, the check is not "is my value present" but "is mine the only one":

```powershell
nslookup -type=TXT devlabconnect.com
nslookup -type=MX devlabconnect.com
```

Verify from a resolver, not from the dashboard.

**On `~all` versus `-all`.** The original record ended `-all` (hard fail); the
merged one ends `~all` (soft fail), which is what Cloudflare's suggested value
carried. Keeping the include does not require keeping the soft fail — this is
also valid, and restores the stricter policy:

```
v=spf1 ip4:37.60.237.227 include:_spf.mx.cloudflare.net -all
```

Left as `~all` by operator decision. Worth revisiting once the domain has
sending history and DMARC aggregate reports show no legitimate source is being
missed; tightening to `-all` before that risks hard-failing a path nobody
remembered.

**Why the include is not strictly required by this design.** SPF authorises
*sending* hosts, and Cloudflare's include exists for Email Routing's
*forwarding* behaviour — when it re-sends mail onward using our domain. This
design forwards nothing: delivery terminates in the Worker, in our own storage.
So the include is headroom rather than a dependency. It becomes a real
requirement the moment a forwarding rule is added, which is the likely reason to
keep it.

### DMARC

The published record is
`v=DMARC1; p=none; adkim=s; aspf=s; rua=mailto:dmarc@devlabconnect.com`.
Reporting was added once `dmarc@` was receiving. `p=none` without `rua` still
defines policy and alignment for receivers but yields no telemetry — which is
most needed during warm-up on a fresh IP, so it was never a state to sit in.

Strict alignment (`adkim=s`, `aspf=s`) is **not** weakened. Nothing here needed
it: DMARC passes on aligned SPF *or* aligned DKIM, and mail from our MTA is
aligned on both.

Aggregate reports are compressed XML and arrive daily from every receiver with
an opinion. They are routed to their own mailbox and are **excluded from the
human inbox** (`HUMAN_MAILBOXES` in `domain/mailboxes.js`) — burying a
prospect's reply under a week of Google telemetry is how a reply goes
unanswered. They appear on the Diagnostics screen.

## Addresses

| Address | Mailbox | Purpose |
|---|---|---|
| `hello@devlabconnect.com` | `hello` | The human inbox |
| `bounce@` and `bounce+<tag>@` | `bounce` | DSNs, with VERP correlation |
| `dmarc@` | `dmarc` | Aggregate reports, off the inbox |
| `postmaster@`, `abuse@` | those | RFC 2142 expects a sending domain to answer these |
| anything else | `other` | Catch-all, kept rather than dropped |

**A catch-all routed to the Worker is recommended** rather than per-address
rules. Cloudflare matches `bounce+anything@` against a `bounce@` rule when
subaddressing is on, so VERP works without one — but a bounce arriving at an
address no rule matches is the one bounce you most needed to see, and a
misaddressed reply from a real prospect is worth more than a tidy inbox.

## Bounce and DSN handling

### Three routes to the same `recordBounce(draftId)`

The mailbox does not own bounce state. It works out *which draft* a report is
about and hands that to the lead engine's existing `recordBounce`, which owns
suppression, the hard/soft distinction and the stage transition. There is no
second bounce state system.

| # | Route | Identifier | Trusted? | Available |
|---|---|---|---|---|
| 1 | **VERP** — draft id in the envelope recipient | issued by us, unguessable | **yes** | mailbox replies and outreach |
| 2 | **Message-ID** — our own id in the DSN's returned headers | issued by us, unguessable | **yes** | mailbox replies and outreach |
| 3 | **Address** — `Final-Recipient` → the most recent draft sent to it | asserted by the sender | **no** | everything |

RFC 3464 requires a DSN to carry the original message's headers, which is what
makes route 2 reliable without controlling the envelope. Route 3 is tried last,
and it still produces a `draftId`, so the single existing `recordBounce(draftId)`
path stays the only one.

An uncorrelated report suppresses **nothing**.

### Only an identifier we issued may cause suppression

**A DSN cannot be authenticated.** It arrives from an arbitrary third-party MTA
with an empty envelope sender, so there is no SPF identity to check and no DMARC
alignment to require. That is precisely the problem VERP exists to solve.

So route 3 — matching on a `Final-Recipient` line the sender wrote — is an
assertion by a stranger, and acting on it was an **unauthenticated, remote,
repeatable denial-of-outreach**. One plain-text message with `MAIL FROM:<>` and
four lines of body text:

```
Final-Recipient: rfc822; victim@example.com
Action: failed
Status: 5.1.1
```

permanently suppressed that address and moved the lead to `NO_CONTACT`, with no
review, for any address the operator was prospecting. This was reproduced
against the real schema during review, and `services/correlate.test.js` now
holds the case.

The rule now: **a hard bounce suppresses only when correlation was by VERP or by
our own Message-ID.** Both identifiers are issued by us and are only ever seen
by the actual recipient of that message, so the worst a forger can do is
suppress themselves — an outcome we would honour anyway.

An address-correlated hard bounce is recorded through the same `recordBounce` as
everything else with `kind: 'soft'`, which is the existing, tested meaning of
"record this failure and do not suppress". No new state and no second path. The
mailbox row keeps the true `5.x.x` status, so the Bounces screen and the thread
view show what actually happened, say why it was not acted on, and link to the
Suppression screen.

The cost is that **outreach bounces no longer auto-suppress** until the outreach
path emits our Message-ID and VERP address. Under-suppressing costs a retry; the
alternative let a stranger delete our prospects.

### Three things about DSNs that break naive handling

1. **They arrive with an empty envelope sender** — `MAIL FROM:<>`, required by
   RFC 5321 §4.5.5 so a bounce cannot itself bounce. Code that treats a missing
   sender as invalid input drops every real bounce while passing every test
   written with ordinary mail. `mailbox_messages.envelope_from` stores `''` as a
   meaningful value, and `ingest.test.js` covers the case explicitly.
2. **The machine-readable part is `message/delivery-status`**, a sibling of the
   human-readable text. Reading `text` gets a prose apology, not a status code.
3. **Hardness comes from the RFC 3463 status class** (`5.x.x` permanent,
   `4.x.x` transient), never from words in the SMTP reply, which are in whatever
   language the remote MTA chose. Unknown defaults to **soft**: under-suppressing
   costs one retry, over-suppressing is forever.

### Outreach bounces auto-suppress too — closed 2026-09-20

This was a known limitation and is now closed. It is recorded because the
failure it caused was invisible from the sending side.

The outbox used to hand n8n `to`/`subject`/`bodyText` and let the `emailSend`
node assemble the message, so outreach carried a nodemailer-generated Message-ID
and whatever envelope sender that node derived. Routes 1 and 2 could not fire,
route 3 is not trusted to suppress, and an operator had to work the Bounces
screen by hand — which means dead addresses stayed contactable for as long as
nobody did.

`collectOutbox` now returns `raw`, `envelope` and `messageId` per draft, built
with `buildMessageId({ kind: KIND_DRAFT, id: draftId })`,
`verpAddressForDraft(draftId)` and `buildOutboundMessage()`, and
`devlab-lead-outreach.json` submits through the same Code node as
`devlab-mailbox-outbound.json`. The two paths are now indistinguishable to the
MTA, and both correlate on an identifier we issued rather than one a stranger
asserted.

## Replies

### Why the CRM builds the entire message

The original plan was for n8n's Send Email node to compose the reply. Checked
against n8n's source and documentation, it cannot:

- It exposes exactly seven options — `appendAttribution`, `attachments`,
  `fileAttachments`, `ccEmail`, `bccEmail`, `allowUnauthorizedCerts`, `replyTo`
  — and hands nodemailer a hard-coded object built only from those.
- n8n's own documentation states the limitation: the node "does not support
  setting headers like `In-Reply-To` and `References`, which are required for
  email threading. As a result, each email is treated as a new conversation."
- It does not expose nodemailer's `envelope`, so `MAIL FROM` is always derived
  from the `From:` header. No per-message VERP.

Designing around that would have shipped replies that do not thread and bounces
that correlate to nothing — **both invisible from the sending side**. The send
succeeds; nothing reports that threading was lost.

So the boundary moved rather than the requirement. `/api/mailbox/outbox` returns,
per reply:

```jsonc
{
  "id": "…",
  "envelope": { "from": "bounce+o-<id>@devlabconnect.com", "to": ["…"] },
  "raw": "From: DevLab Studios <hello@devlabconnect.com>\r\nTo: …",
  "fallback": { "from": "…", "to": "…", "subject": "…", "text": "…" }
}
```

The envelope is separate because it is **not derivable from the message** —
that is the entire point of VERP. `fallback` exists so a transmitter that
genuinely cannot take a raw message still sends something, degraded (no
threading, no VERP) rather than broken. `raw` is the supported path.

This also makes the application independent of which transmitter is used.

### Postfix is unchanged

No change to `mynetworks`, no new listener, no public TCP/25. The n8n container
submits over the existing private Docker network (`172.19.0.2 → 172.19.0.1:25`)
exactly as the outreach workflow already does.

Postfix does not rewrite a fully-qualified envelope sender by default:
`canonical_maps`, `sender_canonical_maps`, `masquerade_domains` and
`smtp_generic_maps` are all empty by default, and `append_at_myorigin` only
touches addresses with no domain. **Leave those four empty** and a per-message
VERP address in `MAIL FROM` survives end to end.

## Security

| Concern | How |
|---|---|
| Hostile HTML | Allowlist sanitizer at ingest (`sanitizeHtml.js`, 27 tests) **and** rendered in `<iframe sandbox="">` with no `allow-scripts` and no `allow-same-origin` plus an internal CSP. The iframe is the real boundary; the sanitizer is defence in depth |
| Remote content | Every remote reference stripped at ingest — images, media, stylesheets, iframes. Nothing in a rendered message causes a request, so tracking pixels cannot report that it was opened |
| Attachment filenames | Sanitized for display and `Content-Disposition` only. **No R2 key is ever derived from a filename** — keys come from generated ids, so traversal is structurally impossible rather than filtered |
| Attachment types | Re-derived through an allowlist at download time, never read from the stored object. `text/html` becomes `application/octet-stream`; everything is `Content-Disposition: attachment` with `nosniff` |
| Message size | Cloudflare caps inbound at 25 MiB; we parse at most 8 MiB and store attachments up to 10 MiB each, recording what was skipped |
| Authorization | Mailbox admin routes are under `/api/admin/`, covered by the existing session gate in `src/middleware.ts`. There is no separately exposed mailbox app |
| The n8n endpoints | Bearer token (`MAILBOX_OUTBOX_TOKEN`), constant-time compare, **fails closed when unconfigured**, rate limited |
| Header injection | Subject and display names are stripped of CR/LF before being written into headers; tested |
| Forged delivery reports | A DSN cannot be authenticated, so only a correlation by an identifier **we issued** (VERP or our Message-ID) may cause suppression. An address-only match is recorded, never acted on. See above |
| Sanitizer CPU | Element nesting is capped at 150, so deeply nested input cannot make the closing-tag scan quadratic inside a Worker's CPU budget |
| Logging | Structured, metadata only — no addresses, subjects or bodies in logs |
| Secrets | None in source. The OpenDKIM private key is untouched and never leaves the VPS |

## Reliability

**A message that arrives is never silently discarded.** Not when it is too large
to parse, not when its MIME is malformed, not when R2 is unavailable, not when
it is from nobody we recognise. Every one of those produces a stored row saying
what happened, and the Diagnostics screen lists them.

- Idempotent on `dedupe_key` — the Message-ID, or a SHA-256 of the bytes when
  there is none (plenty of automated mail omits it).
- The raw original is written to R2 **before** the D1 row, so a row always has
  either an object or an explicit reason. A redelivery repairs a row whose
  first storage attempt failed.
- Correlation, the CRM bridge and the bounce path all run inside a contained
  try/catch **after** the message is durable. A CRM failure is a log line, not a
  lost delivery.
- Thread rollups are updated in the same `db.batch()` as the insert.
- `collectQueued` claims each reply with `WHERE status = 'queued'`, so two
  transmitters cannot both take it.

## Configuration

| Name | Kind | Required | Notes |
|---|---|---|---|
| `MAILBOX_BUCKET` | R2 binding | for raw storage | Private. Without it, mail is still stored and Diagnostics says originals are not |
| `MAILBOX_OUTBOX_TOKEN` | secret | for sending replies | ≥ 32 chars. Unset, the outbox refuses every request with 503 |
| `DEVLAB_BASE_URL` | n8n env | yes | The Worker's base URL |
| `NODE_FUNCTION_ALLOW_EXTERNAL` | n8n env | yes | Must include `nodemailer`. Set it on the Task Runner if you use one |
| `DEVLAB_SMTP_HOST` / `_PORT` | n8n env | no | Default `172.19.0.1:25` |

## Bringing it up

**All of these are done.** The list is kept as the record of what was required —
for rebuilding this setup, or standing up a second sending domain. Steps 1, 3, 4
and 7 are account/DNS actions that no deployment performs, so a fresh
environment does not acquire them by shipping code.

1. ~~**Create the R2 buckets.**~~ **Done 2026-09-20** — `devlab-mailbox` and
   `devlab-mailbox-preview` exist, and both `MAILBOX_BUCKET` bindings are
   declared in `wrangler.jsonc`. Do not enable public access on either.

   Note for anyone repeating this: `wrangler r2 bucket create` offers to edit
   the config on your behalf, and its offer is wrong here in three ways. It
   names the binding after the bucket (`devlab_mailbox`), which nothing in the
   code reads; it puts BOTH buckets at the top level, which would give
   production a binding to the preview bucket and leave preview with none,
   because nothing at the top level is inherited by an environment; and it
   offers to point local dev at the remote bucket, which would write test
   objects into the real mailbox store. Decline all three and write the entries
   by hand.
2. **Apply the migration** and **deploy** (see [deployment.md](deployment.md)).
   The Email Worker must be deployed before a routing rule can point at it.
3. ~~**Enable Email Routing**~~ **Done 2026-09-20.** MX published; Cloudflare
   merged its include into the existing SPF record rather than replacing it,
   and both senders are authorised. Whenever this record is touched again, the
   check is that ours is the ONLY SPF TXT — two records is a `permerror`, not
   "both apply".
4. ~~**Add the routing rules**~~ **Done 2026-09-20**, each action "Send to a
   Worker" → `devlab-studios`: `hello@`, `bounce@`, `dmarc@`, `postmaster@`,
   `abuse@`, plus **catch-all**.
5. ~~**Set the token**~~ **Done** on both environments:
   ```powershell
   npx wrangler versions secret put MAILBOX_OUTBOX_TOKEN
   npx wrangler versions secret put MAILBOX_OUTBOX_TOKEN --env preview
   ```
   (`wrangler versions secret put`, not `wrangler secret put` — the latter
   errors 10215 on this setup.)
6. ~~**Import**~~ **Done** — `integrations/n8n/devlab-mailbox-outbound.json`
   and `devlab-lead-outreach.json`, each with its header-auth credential, and
   `NODE_FUNCTION_ALLOW_EXTERNAL=nodemailer` set on the container. Both use the
   same Code node, so both need that variable; without it `require` is blocked
   and the node fails closed, which is the right direction.
7. ~~**Add `rua`**~~ **Done** — the record now carries
   `rua=mailto:dmarc@devlabconnect.com`, verified against DNS 2026-09-23.

## Acceptance testing

Use only mailboxes we control. **No prospect outreach may be used as a test.**

| # | Test | Pass when |
|---|---|---|
| A | Send to `hello@devlabconnect.com` | It appears at `/admin/mailbox` with the right sender, subject and body |
| B | Reply from the CMS | It arrives; `From:` is `hello@devlabconnect.com`; it threads in the recipient's client |
| C | Inspect raw headers of B | SPF pass, DKIM pass (`d=devlabconnect.com`, `s=s202609`), DMARC pass, `Return-Path` is the VERP address, HELO/PTR match, TLS used |
| D | Send to a known-invalid address at a domain we control | The DSN reaches `bounce@`, appears in the mailbox, and the correlation method is recorded |
| E | **Null-sender DSN** | The bounce above arrived at all. Covered by a test, but confirm against a real MTA — a path that works for ordinary mail and drops every real DSN is the specific failure this design was built against |
| F | Attachment, HTML mail, plus-addressing | Stored; HTML sanitized; remote content reported as stripped |
| G | Postfix still private | `ss -lntp \| grep :25` shows only `127.0.0.1` and `172.19.0.1`; `nc -vz 37.60.237.227 25` from outside refuses. **Verify by observation, not by reading the config file** |
| H | Redeploy | Mail still arrives; Email Routing rules survive (they are account-level, not part of the deployment) |

Two behaviours to confirm empirically rather than assume, because a service can
support one without the other: **plus addressing** and **null-sender delivery**.
Test them separately.

Also worth observing during D/E: **what Cloudflare does when the `email()`
handler throws.** The documentation does not specify whether that produces a
temporary or a permanent SMTP failure, and the difference matters — temporary
means the sender retries, permanent means they are told the address is dead.
`handler.js` rethrows deliberately and says so.

## Limitations

- **Production trails preview.** Production runs 1.12.1. DMARC report reading
  and the preview synthetic-mail work are on `development` at 1.13.0 and not yet
  shipped, so the parsed DMARC view exists only on preview.
- **No full-text search** of message bodies. Search covers sender, name and
  subject. Bodies would need an FTS5 table; it was not obviously worth it at
  this volume.
- **`trash` is a state, not a delete.** Nothing in this mailbox destroys a
  message; retention is a decision an archive button should not be making
  quietly.
- **The German UWG question is untouched.** See
  [outbound-mail-infrastructure.md](outbound-mail-infrastructure.md). Building a
  mailbox does not address whether this outreach model is lawful from a
  German-hosted MTA, and mailbox completion must not be read as clearing it.

## Where the code lives

| Path | Contents |
|---|---|
| `migrations/0014_mailbox.sql` | The four tables, heavily commented |
| `src/mailbox/config.js` | Limits and R2 key layout |
| `src/mailbox/domain/` | `mailboxes`, `messageId`, `threading`, `dsn` |
| `src/mailbox/inbound/` | `handler`, `ingest`, `parse`, `sanitizeHtml`, `filenames` |
| `src/mailbox/outbound/buildMessage.js` | RFC 5322 assembly for transmission |
| `src/mailbox/repositories/` | `threads`, `messages`, `outbound`, `helpers` |
| `src/mailbox/services/` | `correlate`, `bridge`, `reply` |
| `src/mailbox/schema.test.js` | Schema-vs-code agreement |
| `src/pages/api/admin/mailbox/` | Admin API, behind the session gate |
| `src/pages/api/mailbox/` | The transmitter API, behind a bearer token |
| `src/admin-app/pages/mailbox/` | Inbox, thread view, sandboxed body renderer, diagnostics |
| `integrations/n8n/devlab-mailbox-outbound.json` | The reply sender |
