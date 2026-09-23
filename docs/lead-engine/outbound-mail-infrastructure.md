# Outbound mail infrastructure

**Status as of 2026-09-23.** What is decided, what is verified, what is still
open, and what happens next.

This document covers the *sending path*. How the CRM produces a message and what
gates it passes is [outreach-handoff.md](outreach-handoff.md); how n8n consumes
it is [`integrations/n8n/README.md`](../../integrations/n8n/README.md).

## Where we are in one paragraph

The engine's brief originally forbade automated sending entirely. That was
reversed deliberately. The chosen path is `CRM → n8n → Postfix → recipient MX`,
running on our own MTA on a dedicated domain, because **no email service
provider will permit this workload**. Infrastructure is built and hardened, DNS
authentication is verified, and inbound mail — once the blocker here — now
works: `hello@devlabconnect.com` receives, replies transmit and bounces
correlate. See [mailbox.md](mailbox.md).

**The one thing standing between this and a first real send is that
`business.identity` is unset**, which is an application setting, not
infrastructure. The US compliance profile blocks draft review until it is
filled, so nothing generates and the send path idles no matter how well it is
wired.

Verdict on the architecture: **CONDITIONAL GO** — conditional on the legal
question below and on deliverability discipline, not on anything technical.

## Why not an ESP

Researched September 2026 across Brevo, Mailjet, Resend, SendGrid, Mailgun,
Amazon SES, Postmark, SMTP2GO, Elastic Email, MailerSend, ZeptoMail, Scaleway
TEM, Mailtrap, Gmail and Outlook.com.

**Every one prohibits cold outreach in its acceptable-use policy.** The
objection is not volume — it is the consent model. An address a business
publishes on its own website is not treated as opt-in by any of them. Two are
explicit: Resend bans "unsolicited messages of any kind, including cold
outreach"; MailerSend states that a publicly posted address does not give
permission to contact it. Gmail's program policies prohibit it too.

Free tiers are therefore not a cheap version of the right answer. They are the
wrong answer that suspends the account later.

**Using an ESP's SMTP port rather than its API would not have helped** — the AUP
binds on the contract, not the protocol.

## The four layers, kept separate

The single most important distinction in this decision. Self-hosting removes
**layer 1 only**.

| Layer | What it is | Status |
|---|---|---|
| **1. ESP acceptable-use policy** | Contractual. Binds because you accepted it. | **Removed.** No ESP in the path means no such contract exists. |
| **2. Hosting AUP** | Contabo's terms. | No categorical blocker. Managed operationally. |
| **3. Applicable law** | CAN-SPAM, GDPR, German UWG, PH Data Privacy Act. | **Open.** See below. |
| **4. Deliverability / reputation** | What receiving servers decide. | Ours to earn. Fresh IP, no history. |

**Self-hosting does not make unsolicited mail legal or permitted.** It changes
who can terminate you for it, not whether you may do it.

## Legal position — unresolved, worth paid advice

- **US recipients (primary market):** CAN-SPAM is an opt-out regime. Lawful if
  the message is identified as commercial, carries a valid physical postal
  address, provides a working opt-out that is honoured promptly, and uses
  honest headers. The CRM's compliance module already gates on the address and
  opt-out.
- **German exposure:** Contabo is a German company and its ToS incorporates
  German law. Germany's UWG §7 is an **opt-in** regime requiring prior express
  consent for commercial email, **including B2B** — substantially stricter than
  CAN-SPAM. Whether UWG reaches mail sent *from* Germany to US recipients is
  genuinely contested; the effects doctrine usually locates the harm at the
  recipient.
- **Philippines (secondary market):** the Data Privacy Act applies to
  processing contact data.

**This is the one open item that could still invalidate the approach**, because
it bears on whether a German-hosted MTA is the right jurisdiction at all. It is
easy to lose sight of once infrastructure work starts feeling like progress.

## Contabo: operational posture, not a gate

Contabo confirmed directly:

- No policy statement classifying low-volume B2B outreach as either always
  allowed or always prohibited, and **no blanket pre-approval** for our model.
- Server usage governed by German law and their ToS. Spam prohibited.
- Outbound mail limited to **~25 messages/minute** — irrelevant at 10–100/day.
- On an abuse complaint they **notify first**, then allow **24 hours** to reply
  explaining (1) what was changed to stop the reported activity and (2) what
  prevents recurrence. No reply within 24 hours can mean suspension.

Read that framing carefully: the window asks what was **changed to stop** the
activity. It is a cessation-and-prevention process, not an appeal window. We
carry the interpretation risk permanently — whether our model counts as spam is
decided by their Trust and Compliance team at complaint time.

**Required operational posture:**

- A kill switch pullable in minutes — disable the n8n schedule, stop Postfix, or
  both — decided in advance rather than improvised.
- The abuse-notification address monitored by a human who will see it inside 24
  hours, **weekends included**.
- A pre-drafted remediation response, so it is edited under pressure rather than
  composed.

### Separating the MTA from the n8n VPS — STRONGLY RECOMMENDED, not required

An earlier assessment said a single complaint could take n8n down with the
mailer. That was wrong: Contabo notifies first and gives a remediation window,
so the failure is neither instant nor unilateral.

It stays above *optional* because the 24-hour window depends on a human
responding (a Friday-evening notice read on Monday means suspension), because
n8n will run workflows unrelated to outreach whose availability should not be
coupled to sending reputation, because remediation may itself require stopping
the MTA, and because splitting is cheap now and a migration later once n8n holds
production credentials and execution history.

Do it before production sending. It does not block build or test — the mail
identity travels with the domain and PTR, not the host.

## Verified infrastructure

VPS: Contabo, IPv4 `37.60.237.227`. Outreach domain: **`devlabconnect.com`**,
deliberately separate from `devlabstudios.com` so a blocklisting cannot touch
client mail or contact-form notifications. `devlabstudios.com` mail remains at
Zoho on unrelated IPs.

### Hardening

- n8n submits only over a dedicated Docker mail network,
  `172.19.0.2 → 172.19.0.1:25`.
- Postfix trusts **only** that n8n IP plus localhost.
- **Public TCP/25 is not exposed.** The sending host has no listening mail
  surface reachable from the internet.
- OpenDKIM active.
- SMTP relay preflight passed through `RCPT` without sending `DATA`.

### DNS, independently verified 2026-09-20

| Record | Value | |
|---|---|---|
| `mail.devlabconnect.com` → A | `37.60.237.227` | OK |
| `37.60.237.227` → PTR | `mail.devlabconnect.com` | OK — FCrDNS matches bidirectionally |
| SPF | `v=spf1 ip4:37.60.237.227 include:_spf.mx.cloudflare.net ~all` | Merged 2026-09-20 when Email Routing was activated — our MTA and Cloudflare both authorised. Now a SOFT fail; see mailbox.md |
| DKIM `s202609` | `v=DKIM1; h=sha256; k=rsa; p=…` | OK — valid 2048-bit RSA, parses cleanly |
| DMARC | `v=DMARC1; p=none; adkim=s; aspf=s` | No `rua` — no aggregate telemetry |
| MX | `route1/2/3.mx.cloudflare.net` | Published 2026-09-20 — no longer blocking |
| Apex A/AAAA | **none** | See below |

DKIM notes: `h=sha256` pins the hash and blocks a SHA-1 downgrade. **No `t=y`**,
so the key is live rather than in test mode — leaving `t=y` set after testing is
a common way to ship a DKIM setup that silently proves nothing. The record spans
two TXT strings, as it must above 255 characters, and reassembles into a valid
key; a botched split would have failed to parse.

Not verifiable from outside: that OpenDKIM is signing with this selector and the
matching private key. That shows up on the first real message.

## What was blocking: no inbound mail — RESOLVED

> **Resolved 2026-09-20; live and verified against DNS 2026-09-23.** Cloudflare
> Email Routing publishes the MX into an `email()` handler in the existing
> Worker, storing to D1 and a private R2 bucket, read and answered inside the
> Admin CMS. Mail arrives, replies transmit, and DMARC aggregate reports are
> parsed. See [mailbox.md](mailbox.md) for the architecture, the SPF decision
> and the bring-up record.
>
> The section below is kept as the record of **why** it was blocking. That
> reasoning has not changed, and it is the standing argument for never letting
> the receiving side lapse — a domain that cannot receive is worse than one that
> does not send.

### Why it was blocking

There was no MX **and no apex address record**. Under RFC 5321 a sender with no
MX falls back to the domain's A record as an implicit MX; with neither present,
remote servers get no mail destination and fail **immediately and permanently**
rather than queuing.

Two consequences, and the first is worse than the second:

1. **A prospect who replies receives a delivery failure notice.** We cold-email
   them, they engage — the most valuable outcome in the entire pipeline — and
   the domain tells them we do not exist. Materially worse than not sending.
2. **Asynchronous DSNs vanish.** The CRM never learns an address is dead,
   suppression never populates, and every future campaign retries dead
   addresses. That is the mechanism by which sending reputation is lost.

At the time: **do not send a real test message before this is closed.** It is
closed.

### The inbound architecture, as built

**Cloudflare Email Routing for replies and DSNs; Postfix stays completely
outbound-only.** `devlabconnect.com` is already on Cloudflare
(`nina.ns.cloudflare.com`). This publishes the MX, forwards to a mailbox already
being read, and preserves the property that the sending host has no inbound
surface. Self-hosting inbound would undo the hardening just completed and couple
inbound availability to the sending host, working against the eventual
MTA/n8n split.

**Two behaviours to confirm empirically — a service can support one without the
other:**

1. Does a rule for `bounce@` match `bounce+<draftId>@`? Cloudflare supports plus
   addressing, so a catch-all may not be needed — verify rather than assume.
2. Does that still hold for a message arriving with `MAIL FROM:<>`?

If (1) holds but (2) does not, the result is a bounce path that works perfectly
in testing with normal mail and **silently drops every real DSN**.

### Return-Path and alignment

DMARC passes on either aligned SPF *or* aligned DKIM, so with OpenDKIM signing
`d=devlabconnect.com` a bounce subdomain would not break DMARC despite
`aspf=s`. Apex VERP — `bounce+<draftId>@devlabconnect.com` — is still preferred:
DKIM-only alignment leaves no fallback, and forwarders and mailing lists
routinely modify bodies and break signatures. Keeping both aligned costs
nothing here.

Add `rua` to the DMARC record once a receiving address exists. `p=none` without
reporting still defines policy and alignment for receivers, but yields no
telemetry — which is most needed during warm-up on a fresh IP.

## Open questions

| Question | Owner | Status |
|---|---|---|
| German UWG applicability to mail sent from Germany to US recipients | legal advice | **STILL OPEN.** Building the mailbox did not touch it |
| Cloudflare plus-addressing and null-sender DSN behaviour | empirical test | Plus-addressing confirmed from current Cloudflare docs; null-sender handled and unit-tested, **still to be confirmed against a real MTA** |
| `recordBounce` is keyed on `draftId`, not recipient address | application | **RESOLVED.** Three routes now resolve a `draftId`, so that single path stays the only one — see [mailbox.md](mailbox.md) |
| Can n8n's `emailSend` node set the envelope sender independently of `From`? | application | **RESOLVED: no.** See below |

### The n8n envelope-sender question, answered

Checked against n8n's source and its own documentation. The `emailSend` node
**cannot** set the envelope sender, and the limitation is broader than that: it
exposes exactly seven options, hands nodemailer a hard-coded object built only
from those, and n8n's documentation states outright that it "does not support
setting headers like `In-Reply-To` and `References`, which are required for
email threading. As a result, each email is treated as a new conversation."
`MAIL FROM` is always derived from the `From:` header.

So VERP through that node is impossible, and so is threaded replying.

The design was **not** bent around it. The application now builds the complete
RFC 5322 message and hands the envelope over separately, and the transmitter's
only job is `MAIL FROM`, `RCPT TO`, `DATA` — which a Code node using
nodemailer's `raw` + `envelope` does. That also makes the application
independent of which transmitter is used.

**The outreach path has since been converted too.** `collectOutbox` emits
`raw`, `envelope` and `messageId` per draft, and `devlab-lead-outreach.json`
submits through the same Code node as the mailbox workflow — so outreach bounces
now correlate on an identifier we issued rather than on the recipient address a
stranger asserted. Both workflows therefore require
`NODE_FUNCTION_ALLOW_EXTERNAL=nodemailer` on the n8n container.

## Next steps, in order

1. ~~Configure Cloudflare Email Routing; publish MX.~~ **Done 2026-09-20.** MX
   published, Cloudflare DKIM selector `cf2024-1` added alongside our
   `s202609`, and SPF merged to
   `v=spf1 ip4:37.60.237.227 include:_spf.mx.cloudflare.net ~all` — both
   senders authorised. See [mailbox.md](mailbox.md#spf-merged-deliberately);
   note the record now ends `~all` rather than `-all`.
2. Test plus-addressing and null-sender DSN delivery deliberately. Plus
   addressing is confirmed and null-sender handling is unit-tested; **confirming
   a real DSN from a real MTA is still outstanding** and is the one acceptance
   test that cannot be satisfied from inside the codebase.
3. ~~Add `rua` to DMARC now that a receiving address exists.~~ **Done** — the
   record carries `rua=mailto:dmarc@devlabconnect.com`, verified 2026-09-23,
   and reports are parsed rather than filed unopened.
4. ~~Resolve the envelope-sender question and settle bounce ingestion.~~ Done —
   see the table above and [mailbox.md](mailbox.md).
5. Send a first real test to a controlled mailbox; verify SPF, DKIM and DMARC
   all pass at the receiver, and check mail-tester.com.
6. Register with Google Postmaster Tools before volume rises.
7. Begin the warm-up ramp in
   [`integrations/n8n/README.md`](../../integrations/n8n/README.md) — 10/day for
   week one. Do not raise the cap merely because a week passed; hold or reduce
   on abnormal bounces, blocklisting, sustained 4xx deferrals, DMARC failures or
   any complaint. At this volume one complaint is a large percentage.
8. Separate the MTA from the n8n VPS before production sending.

## Application-side state

Independent of the infrastructure track:

- **Shipped and aligned.** The feature branch merged. `main`, `development` and
  both their remotes are level at 1.13.0, so preview and production run the same
  code. The outbox endpoints, draft export and mailbox are all deployed.
- **Business identity is still unset**, and it blocks draft generation entirely.
  Until it is filled in at **CRM Settings** the outbox has nothing to hand out,
  no matter how well the MTA is wired. It now needs
  `hello@devlabconnect.com` as the sender address, plus a real legal name and
  postal address — the US compliance profile refuses to proceed without them
  rather than inventing a postal address. **This is the single thing standing
  between the engine and a first real send.**
- Research jobs remain pending on preview; the cron drains a limited number per
  day.
- Measured contactability is **11–14 of 35 researched leads (~31–40%)**. Two
  thirds of qualified leads publish a contact form and a phone number, not an
  email address. Volume expectations should be set against that, not against the
  lead count.
