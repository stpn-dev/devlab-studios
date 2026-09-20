# n8n integration

Two workflows import into n8n:

- **`devlab-lead-outreach.json`** — sends approved outreach drafts.
- **`devlab-mailbox-outbound.json`** — sends replies written in the CMS mailbox.

The first is documented immediately below; the second has its own section at
the end.

# `devlab-lead-outreach.json` — outreach sender

## What this changes, stated plainly

Until now nothing could transmit a message to a prospect and a person pressed
Send. With this workflow running, **automated sending exists in your stack.**

It does not exist in the application. There is still no SMTP client, no ESP and
no mailbox API in the DevLab codebase, and nothing there can put a message on
the wire. n8n does the transmitting; the CRM decides *what may be sent* and
records *what was*. That boundary is deliberate — every compliance gate stays
on the side that has tests.

The original brief for this engine said no automated prospect sending. This
reverses that, knowingly. If that is not what you want, the Download `.eml`
button in the CRM still works and needs none of this.

## Setup

**1. Generate a token** (48 random characters, not a memorable phrase):

```powershell
node -e "console.log(crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,''))"
```

**2. Set it on the Worker**, both environments you intend to use:

```powershell
npx wrangler versions secret put LEAD_OUTBOX_TOKEN
npx wrangler versions secret put LEAD_OUTBOX_TOKEN --env preview
```

Unset, the outbox **refuses every request** with a 503. That is deliberate:
treating "no token configured" as "no auth required" would publish prospect
contact details to the internet on a deploy that forgot the secret.

**3. In n8n**, create two credentials:

| Credential | Type | Value |
|---|---|---|
| `DevLab outbox token` | Header Auth | Name `Authorization`, Value `Bearer <your token>` |
| `DevLab outreach SMTP` | SMTP | Your own MTA on your own dedicated domain — see below |

**4. Set `DEVLAB_BASE_URL`** in your n8n environment, e.g.
`https://devlab-studios-preview.stpnrey-agustinez.workers.dev`.

**5. Import** `devlab-lead-outreach.json` and run it manually once before
enabling the schedule.

## Why this uses your own SMTP and not a free ESP

Researched 19 September 2026, across Brevo, Mailjet, Resend, SendGrid,
Mailgun, Amazon SES, Postmark, SMTP2GO, Elastic Email, MailerSend, ZeptoMail,
Scaleway TEM, Mailtrap, Gmail and Outlook.com.

**Every one of them prohibits cold outreach in its acceptable-use policy.** Not
the volume — the consent model. An address a business publishes on its own
website is not treated as opt-in by any of them. Two are explicit:

- **Resend** bans "unsolicited messages of any kind, including cold outreach".
- **MailerSend** states that an address being publicly posted on a website
  does not give permission to contact it.

**Gmail is not an escape hatch either** — its program policies prohibit using
Gmail to send unsolicited commercial mail, and free Gmail gives you no custom
domain anyway.

So the free tiers are not a cheap version of the right answer; they are the
wrong answer that suspends your account later. The defensible option under a
no-paid-subscription constraint is **your own MTA on your own domain**, where
there is no acceptable-use contract between you and the receiving server —
only your domain's reputation and the law.

That trade is real: you now own IP reputation, PTR/rDNS, queueing, retries,
bounces and blocklist handling. Let Postfix/Exim do that work; n8n only
submits.

**Check your host's AUP first.** Search it for `spam`, `UCE`, `unsolicited`,
`bulk email`, `commercial email`, `port 25` and `mail server`. If it forbids
unsolicited commercial email, this option is gone too and the honest next step
is a paid provider whose contract expressly permits B2B prospecting.

### Required before you send anything

Clean static IP · outbound port 25 open · PTR/rDNS matching your mail
hostname · matching EHLO/HELO · SPF · DKIM · DMARC · TLS · a working
Return-Path so bounces reach you.

Use a domain separate from `devlabstudios.com`. A blocklisting on your primary
domain takes client mail and contact-form notifications with it.

## The daily cap is ours, not the provider's

The CRM defaults to **10 a day**. That is not any provider's limit — free
Gmail allows roughly 500/day, and several ESP free tiers advertise 100/day or
more. It is a warm-up figure, because the binding constraint is your domain's
reputation rather than what the provider permits. A brand new domain sending
100 a day immediately is the fastest way into spam folders, and reputation is
much harder to regain than to protect.

Raise it in **CRM Settings → `outreach.sending`**, and raise **both** values:

```json
{ "dailyLimit": 100, "maxPerCollection": 50 }
```

`dailyLimit` alone is not enough — `maxPerCollection` bounds each collection
call, so with a once-a-day schedule it is the number that actually decides how
many go out. Alternatively leave `maxPerCollection` low and run the schedule
more often, which paces the sending out across the day and looks more human.

Suggested ramp on a fresh domain and a new sending IP — a conservative
heuristic, not an approved formula:

| Period | Daily cap |
|---|---|
| Days 1–7 | 10 |
| Days 8–14 | 15–25 |
| Days 15–21 | 25–40 |
| Days 22–28 | 40–60 |
| Weeks 5–6 | 60–100 |

**Do not raise it just because a week passed.** Hold or reduce on abnormal
hard bounces, blocklisting, sustained 4xx deferrals, DMARC failures or any
complaint. At this volume one complaint is a large percentage.

Google's bulk-sender rules start around 5,000/day to personal Gmail accounts,
so they do not bind you at 50–100 — but SPF, DKIM, DMARC, rDNS and TLS are
expected of every sender, and the under-0.3% complaint target applies
regardless.

## How the two sides divide

| The CRM decides | n8n does |
|---|---|
| Which drafts are approved and unsuppressed | Transmits them |
| The daily cap | Paces them apart |
| Re-checking suppression at collection time | Reports what was sent |
| Refusing AI drafts that failed content safeguards | |
| Recording `CONTACTED` | |

### Two rules the endpoints are built around

**A draft is never handed out twice.** It is marked exported the moment it is
collected. If the workflow dies between collecting and sending, that message
goes unsent and sits in the CRM for a person — rather than being mailed twice,
which is unrecoverable.

**The cap counts confirmed sends, not collections.** A draft collected and
never transmitted consumed nothing real, so it does not count against the day.

## The endpoints

```
GET  /api/lead-engine/outbox?limit=10
     → { messages: [{ draftId, leadId, to, subject, bodyText, message }],
         sentToday, dailyLimit, remainingToday, sent: false }

POST /api/lead-engine/outbox/{draftId}/sent
     { providerMessageId?, sentAt? }
     → { status: 'ok' | 'already_confirmed', draftId, leadId }

POST /api/lead-engine/outbox/{draftId}/bounced
     { kind: 'hard' | 'soft', diagnostic? }
     → { status: 'ok', suppressed: boolean, kind }
```

A **hard** bounce suppresses the address permanently and moves the lead to
`NO_CONTACT`. Without this nothing ever learns an address is dead, and every
future campaign that matched it would retry — which is how sending reputation
is lost. A **soft** bounce is recorded and does not suppress: a full mailbox
is not a reason to stop contacting a business forever.

The workflow's mail node routes its error output straight to this endpoint.
Asynchronous DSNs that arrive at your MTA minutes later should POST here too.

Both take `Authorization: Bearer <token>`. The confirm call is idempotent on
draft id, so retrying after a timeout is safe and is not recorded as a second
send.

`GET` is rate limited to 10 calls a minute per IP — a misconfigured schedule
polling every second would otherwise walk the pipeline on every call.

## Replies — now handled by the mailbox

**Superseded as of 2026-09-20.** This workflow still does not read a mailbox,
and it still should not: polling a personal mailbox from an automation is what
got the previous Zoho integration's account blocked.

Replies no longer need to be logged by hand. `hello@devlabconnect.com` now
receives through Cloudflare Email Routing into an Email Worker, and an inbound
message that correlates to a lead is written into the CRM's own conversation
tables — so the Conversations screen and the Replies queue populate again. See
[`docs/lead-engine/mailbox.md`](../../docs/lead-engine/mailbox.md).

Note the shape of that: **nothing polls a mailbox.** Cloudflare pushes each
message to the Worker as it arrives. There is no mailbox API, no OAuth token and
no credential that an email provider can revoke.

`devlab-mailbox-outbound.json` is the second workflow in this directory — it
transmits replies a person writes in the CMS.

---

# `devlab-mailbox-outbound.json` — mailbox reply sender

Sends replies composed at `/admin/mailbox`, as `hello@devlabconnect.com`,
through the same private Postfix path.

## It does NOT use the Send Email node, and that is the point

Checked against n8n's source and documentation, the `emailSend` node cannot do
three things a threaded reply requires:

- **No custom headers.** n8n's documentation states it "does not support setting
  headers like `In-Reply-To` and `References`, which are required for email
  threading. As a result, each email is treated as a new conversation."
- **No `Message-ID` control.** nodemailer generates one; we cannot pin it. That
  matters because our own Message-ID is what a DSN echoes back, and it is how a
  bounce finds the conversation it belongs to.
- **No `envelope`.** `MAIL FROM` is always derived from the `From:` header, so
  a per-message VERP return path is impossible through that node.

Every one of those failures is invisible from the sending side: the send
succeeds, and nothing reports that threading was lost or that the bounce path
was severed.

So the CRM builds the **complete RFC 5322 message** and hands the **envelope
over separately**, and this workflow's Code node does nothing but
`MAIL FROM`, `RCPT TO`, `DATA`:

```js
await transporter.sendMail({
  envelope: { from: reply.envelope.from, to: reply.envelope.to },
  raw: reply.raw,
})
```

Both fields are required together — nodemailer does not parse the envelope out
of a raw message.

## Setup

**1. Generate a token** and set it on the Worker, both environments:

```powershell
node -e "console.log(crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,''))"
npx wrangler versions secret put MAILBOX_OUTBOX_TOKEN
npx wrangler versions secret put MAILBOX_OUTBOX_TOKEN --env preview
```

Unset, the outbox **refuses every request** with a 503.

**2. Allow the Code node to load nodemailer.** On the n8n container — or on the
**Task Runner**, if you use one:

```
NODE_FUNCTION_ALLOW_EXTERNAL=nodemailer
```

Without it the node fails closed: nothing is sent and the reply stays queued,
which is the right direction to fail in.

**3. Create the credential** `DevLab mailbox outbox token` (Header Auth, name
`Authorization`, value `Bearer <your token>`), import the workflow, and run it
manually once before enabling the schedule.

Optional: `DEVLAB_SMTP_HOST` / `DEVLAB_SMTP_PORT`, defaulting to
`172.19.0.1:25` — the existing private Docker mail network. **Do not point this
at a public address and do not widen Postfix's `mynetworks` to make it work
from somewhere else.**

## The endpoints

```
GET  /api/mailbox/outbox?limit=10
     → { messages: [{ id, envelope: { from, to }, raw, fallback }], sent: false }

POST /api/mailbox/outbox/{id}/sent
     { providerMessageId?, sentAt? }
     → { status: 'ok' | 'already_sent', outbound }

POST /api/mailbox/outbox/{id}/failed
     { error?, retryable? }
     → { status: 'ok', outbound }
```

A reply is handed out **once** and marked collected in the same step. If the
workflow dies between collecting and submitting, that reply is not sent and
sits in the CMS for a person — rather than being mailed twice.

`retryable` defaults to **false**. A reply that silently re-queued forever would
mail the same person repeatedly the moment a fault cleared; a failed reply is
visible in the CMS and a person decides.

Confirming is what puts the reply into the thread the operator reads. Recording
it at compose time would show a message as sent that may never have left.
