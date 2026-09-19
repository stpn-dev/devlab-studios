# n8n integration

`devlab-lead-outreach.json` — imports into n8n and sends approved drafts.

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
| `DevLab outreach mailbox` | Gmail OAuth2 (or SMTP) | **A dedicated sending account** — see below |

**4. Set `DEVLAB_BASE_URL`** in your n8n environment, e.g.
`https://devlab-studios-preview.stpnrey-agustinez.workers.dev`.

**5. Import** `devlab-lead-outreach.json` and run it manually once before
enabling the schedule.

## Use a dedicated sending domain

Do not point the mail node at the account your business runs on. Cold outreach
from a primary domain risks that domain's reputation, and a suspension takes
client mail and contact-form notifications down with it. Every cold-email
platform does this the same way: a separate domain, SPF/DKIM/DMARC configured,
warmed for about three weeks at 5–10 messages a day before going higher.

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

Suggested ramp on a fresh domain: 5–10/day for the first week, 10–20 in the
second, 20–35 in the third, and only then higher.

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
```

Both take `Authorization: Bearer <token>`. The confirm call is idempotent on
draft id, so retrying after a timeout is safe and is not recorded as a second
send.

`GET` is rate limited to 10 calls a minute per IP — a misconfigured schedule
polling every second would otherwise walk the pipeline on every call.

## Replies

This workflow does not read your mailbox, deliberately. Polling a personal
mailbox from an automation is what got the previous Zoho integration's account
blocked — though from n8n's stable IP that specific failure would not recur.
Replies arrive in the sending account's inbox; log them against the
conversation in the CRM.

If you want that automated later, the same pattern applies: n8n reads, and
POSTs to the CRM. Do not put mailbox polling back into the Worker.
