# Outreach handoff

How an approved draft gets from the CRM to a recipient: as a **file you open in
your own mail client and send yourself**.

There is no mail provider configured, no OAuth, no refresh token and no API
call. Nothing in this system sends, and now there is nothing in it that
*could* — the guarantee is the file format, not a parameter.

## Why the mailbox integration was removed

This used to write drafts into a Zoho mailbox over its API, and sync Sent and
Inbox to detect replies. It worked. It also got the account blocked.

**Cloudflare Workers have no stable egress IP.** A scheduled call leaves from
whichever datacentre runs that tick. The alerts that arrived looked like this:

```
Your Zoho account ... was recently accessed from a new location.
TIME      Fri Sep 18 22:29:29 PST 2026
IP        172.69.9.156          ← a Cloudflare range
LOCATION  Milano, IT            ← not where the operator is
```

`lead_sync_state` confirmed the other end of it: `sent` and `inbox` both synced
successfully at 22:30 UTC, zero failures. The sync was working exactly as
designed. To Zoho, an OAuth token being used from a different country every day
reads as a compromised account, and it acted accordingly — a web block with no
warning and no appeal.

**Changing provider would not have fixed it.** Google flags new sign-in
locations at least as aggressively, and Gmail is usually the account the
operator actually depends on. The fault was never Zoho's; it was coupling
outreach to a personal mailbox at all.

Cold-email platforms avoid this by never touching one — they send from their own
infrastructure with a dedicated domain (see the sources in
[discovery.md](discovery.md) for how that industry is set up). A system that
deliberately does **not** send has a simpler option: hand the operator a file.

## What happens instead

`src/lead-engine/services/draftExport.js`, via
`/api/admin/lead-crm/drafts/:id/export`.

| Path | Returns |
|---|---|
| `GET` | the `.eml` as a download, `Content-Type: message/rfc822` |
| `POST` | the same message as JSON, for the copy-to-clipboard button |

Both run the **identical gate chain**, because the gates are the point:

1. The engine flag must be on.
2. The draft must exist and not be `discarded` or `superseded`.
3. The lead must have a contact.
4. **Suppression is re-checked at the moment of the click**, not when the screen
   rendered. A suppression entry added in between is exactly what this catches,
   and it is the one failure that must never be a warning.
5. An AI-written draft must have a content-safeguard record with **zero**
   violations. Absent and clean are different: a draft that was never checked is
   refused, not waved through.

Only then is the message built.

## The file

`src/lead-engine/mail/eml.js` builds RFC 5322. Worth knowing:

- **`X-Unsent: 1`** makes Outlook open it as a composable draft. Other clients
  ignore it.
- **`From` is omitted** unless `business.identity.senderEmail` is set, so the
  operator's client fills in whichever account they open it with rather than the
  file asserting an identity their mailbox does not have.
- **Headers are RFC 2047 encoded** when they contain anything outside printable
  ASCII. An em dash in a subject is ordinary, and emitted raw it renders as
  mojibake in some clients and is rejected by others.
- **CR and LF are stripped from every header value.** Draft text is
  operator-supplied and AI-generated; without this a subject could append `Bcc:`
  to the message. There is a test for it.
- **Body lines wrap on whitespace** under the 998-octet limit, and a long URL is
  left intact — an over-long line is a formatting problem, a broken link is a
  dead call to action.
- **A reply carries `In-Reply-To` and `References`** so it threads in the
  recipient's client instead of starting a new conversation.

## What you lose, and what to do about it

**Nothing observes the send any more.** There is no Sent-folder sync, so the
move to `CONTACTED` is an explicit act: the **I sent this** button on the draft,
which records `OUTBOUND_SEND_CONFIRMED`.

**Replies are not imported.** You read them in your own inbox like ordinary
mail and log them against the conversation. At the contactability rates this
engine produces — measured at 11 of 35 researched leads — that is a handful of
messages, and it is more reliable than a sync that gets the account blocked.

## Legacy names in the schema

`lead_outreach_drafts` still has `zoho_draft_id`, `zoho_message_id`,
`zoho_draft_created_at` and `zoho_error`, and its status CHECK still spells the
exported state `zoho_draft_created`. `lead_conversations` and `lead_messages`
still default `provider` to `'zoho'`.

They stay because migrations 0012 and 0013 are applied to live databases holding
real leads, and widening or renaming a CHECK means rebuilding a table that
`lead_messages` references by foreign key — real risk, for a name. The
repository maps the stored value to `exported`, which is the only vocabulary the
code, the UI and the activity timeline use.

`mailbox_sync` is likewise still a valid `job_type`. It is declared in
`RETIRED_JOB_TYPES` in `src/lead-engine/jobs/handlers.js`, so a queued row
dead-letters with a reason that says the capability was removed rather than the
generic "no handler" that would read like a bug — and so the job-type coverage
test still fails for a handler that is genuinely *missing*.

## Automated sending — since decided, and reversed

The advice that used to close this document said: if you ever want automated
sending, do it on a dedicated domain with SPF/DKIM/DMARC, warmed over three
weeks, **through an ESP**.

That decision has since been made, and the ESP half of it was wrong. Research
across fifteen providers found that **every one prohibits cold outreach in its
acceptable-use policy** — on the consent model, not on volume. The path chosen
instead is our own MTA on `devlabconnect.com`, with n8n doing the transmitting.

The `.eml` export described above still works and is still the zero-risk option.
It is not deprecated by this.

See [outbound-mail-infrastructure.md](outbound-mail-infrastructure.md) for the
sending architecture, what is verified, the legal position and what still
blocks a first send.
