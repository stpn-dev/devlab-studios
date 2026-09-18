# Zoho Mail integration

The most operationally important document here. Nothing in the Zoho half of the
engine works until the one-time setup below is done, and it cannot be done from
inside the application — the refresh token is obtained out of band, by a human,
once.

Code: `src/lead-engine/zoho/` (`oauth.js`, `client.js`, `normalize.js`,
`threadMatch.js`), `src/lead-engine/services/zohoDraft.js`,
`src/lead-engine/services/mailboxSync.js`.

## The one thing to remember

**This integration cannot send mail.** `zoho/client.js` has no send function,
`createDraft` hard-codes `mode: 'draft'` as a literal, and `assertNoSendMode`
throws on any payload that tries to smuggle one in. See
[architecture.md](architecture.md).

---

# Part 1 — One-time setup

Do this once, by hand, for each environment you want Zoho connected in
(production and, if you want it there, preview). Budget 20 minutes.

Throughout, replace the placeholders:

| Placeholder | Example |
|---|---|
| `<CLIENT_ID>` | `1000.ABCDEF1234567890ABCDEF1234567890` |
| `<CLIENT_SECRET>` | `abcdef0123456789abcdef0123456789abcdef01` |
| `<CODE>` | The one-time `code` from step 3 |
| `<ACCESS_TOKEN>` | `1000.xxxx...` (one hour) |
| `<REFRESH_TOKEN>` | `1000.yyyy...` (long-lived) |
| `<ACCOUNT_ID>` | A long numeric string |

> **Region.** These instructions use the `.com` data centre. If the mailbox lives
> in another Zoho region, replace `accounts.zoho.com` with `accounts.zoho.eu` /
> `.in` / `.com.au` / `.jp` and `mail.zoho.com` with the matching `mail.zoho.*`
> throughout, **and** set `ZOHO_ACCOUNTS_BASE_URL` and `ZOHO_API_BASE_URL` (Part
> 1.6). Mixing regions produces `invalid_client` errors that look like a wrong
> secret.

## 1.0 The fast path — use the helper script

`scripts/lead-engine/zoho-setup.mjs` does Parts 1.2 to 1.5 for you: it builds
the authorization URL, exchanges the code, looks up the account id, and tells
you exactly which secrets to set. It reads credentials from the ENVIRONMENT
rather than from arguments, so your client secret never enters shell history or
the process list, and it writes nothing to disk.

```powershell
# PowerShell
$env:ZOHO_OAUTH_CLIENT_ID     = "1000.XXXX"
$env:ZOHO_OAUTH_CLIENT_SECRET = "yyyy"

node scripts/lead-engine/zoho-setup.mjs auth-url
# open the URL, approve, copy `code` from the 404 page's address bar
node scripts/lead-engine/zoho-setup.mjs exchange <CODE>
```

Then, to confirm the whole thing works against the real API:

```powershell
$env:ZOHO_OAUTH_REFRESH_TOKEN = "1000.yyyy..."
$env:ZOHO_ACCOUNT_ID          = "<from the exchange step>"
node scripts/lead-engine/zoho-setup.mjs verify
```

`verify` calls the exact endpoints the engine calls — the connectivity probe,
the Inbox view and the Sent view — so a folder-addressing problem surfaces here
rather than on the first real sync. It deliberately does NOT create a draft:
that writes to your mailbox, so it is left for you to do from the Lead CRM.

Add `--region=eu|in|au|jp|ca|sa` for a non-`.com` data centre.

The manual steps below remain the reference for what the script is doing, and
for the parts it cannot do (registering the client, setting the secrets).

## 1.1 Register a Zoho API client

1. Sign in to <https://api-console.zoho.com/> with the **same Zoho account that
   owns the mailbox** you want the engine to work with.
2. Click **Add Client**.
3. Choose **Server-based Applications**.
4. Fill in:
   - **Client Name**: `DevLab Lead Intelligence Engine`
   - **Homepage URL**: `https://www.devlabstudios.com`
   - **Authorized Redirect URIs**: `https://www.devlabstudios.com/oauth/zoho/callback`
5. Click **Create**.
6. Copy the **Client ID** and **Client Secret** that are shown. The secret is
   shown again in the console later, but copy it now anyway.

### About that redirect URI

**No such route exists in this application, and that is intentional.**

The redirect URI is used exactly once, by a browser you control, to deliver a
one-time authorization code into your address bar. You will copy the code out of
the URL by hand. There is no callback handler to write, no `state` parameter to
validate, and no browser-facing OAuth surface at all — which is a smaller attack
surface than an in-app authorization flow would be, for a single-operator mailbox
that is connected once.

The page will 404 when Zoho redirects you there. **That is fine.** The code is in
the URL regardless.

You may use any URI here as long as it is *exactly* the same string in the
console, in the authorization URL, and in the token exchange. A mismatch of even
a trailing slash returns `invalid_redirect_uri`.

> If you prefer, Zoho's **Self Client** option issues a code without a redirect
> URI at all. It works and is arguably simpler. This document uses the
> server-based flow because it is the documented path and because the refresh
> token it issues behaves identically.

## 1.2 The scopes

Three, and only three:

| Scope | Why the engine needs it |
|---|---|
| `ZohoMail.messages.ALL` | Create drafts, list messages in Inbox/Sent, read a matched message's content |
| `ZohoMail.accounts.READ` | Look up the account id, and the connectivity probe on the settings screen |
| `ZohoMail.folders.READ` | Read Inbox and Sent by name |

Comma-separated, no spaces:

```
ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.READ
```

`ZohoMail.messages.ALL` includes send permission at Zoho's end. **The engine does
not use it** — there is no code that could. Zoho does not offer a
create-draft-but-not-send scope, so this is as narrow as the provider allows.
The guarantee is in `zoho/client.js`, not in the scope.

## 1.3 Get an authorization code

Open this URL **in a browser** (one line; line breaks below are for reading only):

```
https://accounts.zoho.com/oauth/v2/auth
  ?scope=ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.READ
  &client_id=<CLIENT_ID>
  &response_type=code
  &access_type=offline
  &prompt=consent
  &redirect_uri=https://www.devlabstudios.com/oauth/zoho/callback
```

Copy-pasteable:

```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.READ&client_id=<CLIENT_ID>&response_type=code&access_type=offline&prompt=consent&redirect_uri=https://www.devlabstudios.com/oauth/zoho/callback
```

`access_type=offline` is **mandatory** — without it Zoho issues an access token
and no refresh token, and you will have to start over. `prompt=consent` forces
the consent screen even if you have authorized before, which is what makes a
refresh token reliably come back on a repeat run.

Approve the consent screen. Your browser lands on a 404 page whose URL is:

```
https://www.devlabstudios.com/oauth/zoho/callback?code=1000.abc123...&location=us&accounts-server=https%3A%2F%2Faccounts.zoho.com
```

Copy the value of `code`. **It expires in about 60 seconds** — have the next
command ready before you approve.

## 1.4 Exchange the code for a refresh token

```bash
curl -s -X POST 'https://accounts.zoho.com/oauth/v2/token' \
  -d 'grant_type=authorization_code' \
  -d 'client_id=<CLIENT_ID>' \
  -d 'client_secret=<CLIENT_SECRET>' \
  -d 'redirect_uri=https://www.devlabstudios.com/oauth/zoho/callback' \
  -d 'code=<CODE>'
```

A successful response:

```json
{
  "access_token": "1000.xxxx...",
  "refresh_token": "1000.yyyy...",
  "scope": "ZohoMail.messages.ALL ZohoMail.accounts.READ ZohoMail.folders.READ",
  "api_domain": "https://www.zohoapis.com",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Save `refresh_token` somewhere safe immediately. **It is shown once.** You will
also use `access_token` in the next step, within the hour.

If there is no `refresh_token` in the response, `access_type=offline` was missing
or the code had already been used. Go back to 1.3.

Common errors:

| Response | Cause |
|---|---|
| `invalid_code` | The code expired (60s) or was already exchanged |
| `invalid_client` | Wrong client id/secret, or wrong region |
| `invalid_redirect_uri` | The URI does not byte-match the console entry |

> Note: Zoho sometimes returns **HTTP 200 with an `error` field**. That is why
> `zoho/oauth.js` checks `!response.ok || !payload?.access_token` rather than the
> status alone.

## 1.5 Find the account id

Using the access token from 1.4:

```bash
curl -s 'https://mail.zoho.com/api/accounts' \
  -H 'Authorization: Zoho-oauthtoken <ACCESS_TOKEN>'
```

The response is `{ "status": {...}, "data": [ { ... } ] }`. From the entry for
the mailbox you want, take:

- `accountId` → `ZOHO_ACCOUNT_ID`
- the primary email address → `ZOHO_USER_EMAIL`

Note the header scheme: **`Zoho-oauthtoken`**, not `Bearer`. Zoho is unusual
here, and `Bearer` returns a confusing 401.

## 1.6 Set the secrets

Production:

```bash
npx wrangler secret put ZOHO_OAUTH_CLIENT_ID
npx wrangler secret put ZOHO_OAUTH_CLIENT_SECRET
npx wrangler secret put ZOHO_OAUTH_REFRESH_TOKEN
npx wrangler secret put ZOHO_ACCOUNT_ID
npx wrangler secret put ZOHO_USER_EMAIL
```

Preview (a **separate** set — see [`../deployment.md`](../deployment.md)):

```bash
npx wrangler secret put ZOHO_OAUTH_CLIENT_ID --env preview
npx wrangler secret put ZOHO_OAUTH_CLIENT_SECRET --env preview
npx wrangler secret put ZOHO_OAUTH_REFRESH_TOKEN --env preview
npx wrangler secret put ZOHO_ACCOUNT_ID --env preview
npx wrangler secret put ZOHO_USER_EMAIL --env preview
```

Each command prompts for the value. Nothing is echoed and nothing touches the
repository.

Only for a non-`.com` region:

```bash
npx wrangler secret put ZOHO_API_BASE_URL        # e.g. https://mail.zoho.eu/api
npx wrangler secret put ZOHO_ACCOUNTS_BASE_URL   # e.g. https://accounts.zoho.eu
```

Both default correctly for `.com` and should be left unset otherwise. They are
plain configuration rather than credentials, so `vars` in `wrangler.jsonc` would
be equally valid — but keeping every `ZOHO_*` value in one place is easier to
reason about.

### What is a secret and what is a var

| Variable | Kind | Where |
|---|---|---|
| `ZOHO_MAIL_ENABLED` | **var** | `wrangler.jsonc` `vars` (both environments), default `"false"` |
| `ZOHO_MAIL_SYNC_ENABLED` | **var** | Same |
| `ZOHO_OAUTH_CLIENT_SECRET` | **secret** | `wrangler secret put`. Non-negotiable. |
| `ZOHO_OAUTH_REFRESH_TOKEN` | **secret** | `wrangler secret put`. Non-negotiable — it is a long-lived credential to a live mailbox. |
| `ZOHO_OAUTH_CLIENT_ID` | secret (recommended) | Not sensitive alone, but keeping the OAuth triple together avoids a half-committed credential |
| `ZOHO_ACCOUNT_ID` | secret (recommended) | "Merely sensitive operational value" per the migration comment |
| `ZOHO_USER_EMAIL` | secret (recommended) | Same |
| `ZOHO_API_BASE_URL` / `ZOHO_ACCOUNTS_BASE_URL` | either | Optional; leave unset for `.com` |

**Nothing Zoho-related belongs in `lead_settings`.** That table is for
operational tunables. `repositories/settings.js` says so, and the migration says
so.

## 1.7 Turn it on and verify

```bash
# Set the two vars to "true" in wrangler.jsonc (top level and env.preview),
# commit, and deploy — see docs/lead-engine/deployment.md.
```

Then go to **`/admin/lead-crm/settings`**. It reads
`GET /api/admin/lead-crm/zoho/status`, which calls `checkConnection(env)` — a
cheap `GET /accounts/<ACCOUNT_ID>`.

| Shown | Meaning |
|---|---|
| `Connected.` | Working |
| `Not configured. Missing: accountId, refreshToken.` | `readZohoConfig` lists **exactly** which variables are absent |
| `Zoho refused the token request: invalid_grant` | The refresh token is revoked or wrong. Redo 1.3–1.4. |
| Any other error | Surfaced redacted — see below |

`readZohoConfig(env)` returns what *is* configured plus a `missing` array rather
than throwing, precisely so this screen can name the missing variables instead of
showing one unhelpful failure.

### Credential redaction

`redactZohoError()` strips `client_secret=`, `refresh_token=`, `access_token=`
and `code=` query values, the same keys in JSON bodies, `Bearer <token>` headers,
and anything matching Zoho's `1000.<20+ chars>` token shape, then truncates to
500 characters.

This exists because **Zoho's token endpoint echoes request parameters into some
error responses**, and those responses end up in `lead_sync_state.last_error` and
on an admin screen. It is the one place that has to get it right.

## 1.8 Token lifecycle

- The **refresh token is long-lived** and is obtained once. `oauth.js` implements
  only the refresh half — there is no callback route and no `state` parameter,
  because there is no in-app authorization flow.
- **Access tokens are cached in memory**, per isolate, keyed by client id, with a
  60-second expiry skew so a token cannot die mid-request. Not in D1: an access
  token is a one-hour bearer credential, and writing it to the database would put
  a live credential in every backup to save one HTTP request per isolate.
- A **401 triggers exactly one** forced refresh and retry
  (`zohoRequest`). An access token that expired between the cache check and the
  request is the single most common transient failure here, and is fixed by
  exactly that.
- `invalid_grant` is classified as **`zoho_reauthorization_required`** (HTTP 401)
  rather than a generic failure, because it needs a human to redo the
  authorization-code flow. `jobs/handlers.js` treats it as **permanent** and
  dead-letters the job instead of retrying.

### When the refresh token stops working

Zoho revokes refresh tokens when the password changes, when the client is deleted
in the API console, when a user revokes access under **Zoho Accounts → Security →
Connected Apps**, or when Zoho's 20-tokens-per-client limit evicts an old one.

The fix is always the same: repeat 1.3–1.4 and
`npx wrangler secret put ZOHO_OAUTH_REFRESH_TOKEN`. Nothing in D1 needs changing,
and the sync cursor picks up where it left off.

---

# Part 2 — What the integration does

## Create Zoho Draft

`services/zohoDraft.js` `pushDraftToZoho()`, triggered by
`POST /api/admin/lead-crm/drafts/:id/zoho-draft` from the lead detail screen.

### What it does

1. Asserts `ZOHO_MAIL_ENABLED` (and therefore `LEAD_ENGINE_ENABLED`).
2. Loads the draft and its lead.
3. **Short-circuits if the draft is already `zoho_draft_created`** and returns
   `already_created` with the existing id. Pressing the button twice must not
   create a second draft in the mailbox for the operator to choose between.
4. Refuses a `discarded` or `superseded` draft (409, "Regenerate it first").
5. **Re-checks suppression at the moment of action.** Every precondition was
   already checked when the screen rendered, but time passes between a screen
   rendering and a button being pressed, and the thing that could have changed is
   a suppression entry. A suppressed recipient writes a `COMPLIANCE_BLOCKED`
   activity row and returns 409.
6. Checks `readZohoConfig().isConfigured` (503 with the missing variable names).
7. Ensures a `lead_conversations` row exists.
8. POSTs to `/accounts/<ACCOUNT_ID>/messages` with
   `mode: 'draft'`, `mailFormat: 'plaintext'`, the configured `fromAddress`, the
   contact's address, the subject and body, and — for a reply draft — the
   `inReplyTo` header taken from the inbound message's `internet_message_id`.
9. Records `zoho_draft_id` / `zoho_message_id` on the draft, writes a
   `ZOHO_DRAFT_CREATED` ("Saved to Zoho Drafts") activity row, and moves an
   initial draft's lead to **`READY_TO_CONTACT`**.
10. Consumes one unit of the `zoho_api_calls` daily budget per HTTP call
    (including a 401 retry — the budget is about load on Zoho, not logical
    operations).

Plain text, not HTML: the drafts this system produces are short, personal-looking
business emails; HTML would add nothing and would make "what will actually be
sent" harder for the person reviewing it.

### What it does NOT do

- **It does not send.** See Part 1's opening note.
- **It does not move the lead to `CONTACTED`.** A draft sitting in a mailbox is
  not a contacted prospect. Only the Sent-folder sync does that.
- **It does not lose the draft on failure.** A Zoho outage records
  `zoho_draft_failed` with the message, writes a `ZOHO_DRAFT_FAILED` activity
  row, leaves the generated text intact, and costs a retry.
- **It does not schedule anything.** `assertNoSendMode` rejects `scheduleType` and
  `scheduleTime` outright.

## Open Zoho

`buildZohoUrl({ folder })` returns a **folder-level** link:

```
https://mail.zoho.com/zm/#mail/folder/Drafts
```

Not a per-message deep link, deliberately. **Zoho does not document a stable
per-message deep-link format**, and an undocumented one that silently stopped
working would send the operator to a blank screen at exactly the moment they are
trying to send something. So the link opens the Drafts folder and the UI tells
the operator which draft to open.

`recordZohoOpened()` (`POST /api/admin/lead-crm/drafts/:id` with the open action)
writes a `ZOHO_DRAFT_OPENED` activity row. Worth a timeline entry: it is the
boundary between what this system did and what the human did next, and without it
the gap between `ZOHO_DRAFT_CREATED` and `OUTBOUND_MESSAGE_SENT` is unexplained.

## Inbox and Sent sync

`services/mailboxSync.js`. Requires **both** `ZOHO_MAIL_ENABLED` and
`ZOHO_MAIL_SYNC_ENABLED` (the flag resolver ANDs them — polling a mailbox you are
not configured to talk to is not a meaningful state).

### The mailbox is not mirrored

This is the property to understand. The sync reads a bounded recent window of
message **headers**, and keeps only the messages that match a known CRM contact or
conversation.

Messages that are not about a lead are matched, found to be unrelated, and left
entirely alone — **their bodies are never even fetched**, because the list
endpoint returns headers and the content endpoint is called only after a match.
The mailbox belongs to a person, and this system reads only what concerns a lead.

### Ordering: Sent first, then Inbox

`syncMailbox()` runs `sent` before `inbox`, deliberately. A manual send and its
reply can both land between two runs, and processing them in that order produces
the correct `CONTACTED → AWAITING_REPLY → REPLIED` sequence rather than a reply
arriving at a lead the CRM still believes was never contacted.

### The window and the cursor

- First run: the last **7 days**.
- Subsequent runs: from `lead_sync_state.cursor` minus
  `ZOHO.syncOverlapMinutes` (**10 minutes**).
- Page size: `ZOHO.syncPageSize` (**50** messages per folder per run), capped at
  200 by the client.
- The cursor is the newest message timestamp seen, and **only advances on
  success**.

The overlap is deliberate. Mail providers order by a server timestamp that can
move slightly, and a message arriving during the previous run's read window would
otherwise be skipped permanently. The overlap is free because import is
idempotent on `provider_message_id`.

### Per message

1. `normalizeZohoMessage` maps Zoho's shape to the engine's. Field-name
   archaeology lives in `zoho/normalize.js` because Zoho returns different key
   spellings between the list and content endpoints and between API versions, and
   every reading has to be attempted or a working integration looks broken.
2. Skip if no `providerMessageId`.
3. **Cheapest check first:** `messageExists(providerMessageId)` — one indexed
   lookup beats a match, a body fetch and an AI call for a message we already
   have.
4. `matchMessageToConversation` (see [conversations.md](conversations.md)). No
   match → nothing fetched, nothing stored, nothing analysed.
5. Fetch the body via the content endpoint. A body we could not read still gets
   its header row stored: knowing a reply arrived is more valuable than the text
   of it, and the operator can open Zoho.
6. `extractPlainBody` strips HTML, decodes entities, and removes quoted reply
   history (cutting at `On … wrote:`, `-----Original Message-----`, `From:`,
   `Sent from my …`, `_____`, or a `>` line — conservatively: if the cut would
   leave nothing, the original is kept). Capped at 20 000 characters with
   `body_truncated` flagged.
7. **Deterministic opt-out detection, before anything else touches the message.**
8. Store, then branch on direction.

### Outbound (Sent)

**This is the only path that moves a lead to `CONTACTED`.** The operator is never
asked to press "Mark Sent" — the system can see what actually left the mailbox,
and asking a human to duplicate that is how CRM records drift from reality.

| Lead was at | Becomes | Activity |
|---|---|---|
| `READY_TO_CONTACT`, `READY_FOR_REVIEW`, `CONTACT_FOUND` | `CONTACTED` → `AWAITING_REPLY`, conversation `awaiting_reply` | `OUTBOUND_MESSAGE_SENT` ("Message sent manually from Zoho") |
| `REPLIED` | `CONVERSATION`, conversation `awaiting_reply` | `MANUAL_REPLY_SENT` |

Deduped on `outbound:<providerMessageId>`.

### Inbound (Inbox)

`INBOUND_REPLY` activity (deduped on `inbound:<providerMessageId>`), then:

- **Opt-out detected** → suppression entry (`source: 'inbound_reply'`, notes
  carrying the matched phrase) → `UNSUBSCRIBED` or `DO_NOT_CONTACT` →
  conversation `closed` → **no AI analysis queued**.
- **Otherwise** → `REPLIED`, conversation `needs_attention`, and the reply is
  picked up for analysis on the next tick.

### Scheduling and backoff

`jobs/scheduler.js` enqueues one `mailbox_sync` job per tick with a constant
dedupe key (`mailbox_sync`), so there is at most one outstanding sync — a second
would read the same window and import nothing.

After `SYNC_BACKOFF_THRESHOLD` (**5**) consecutive failures it backs off to
roughly once an hour instead of every tick. Repeated failures are usually a
refresh token that needs re-authorizing, which no amount of retrying fixes.

The cron fires **once a day** (`0 22 * * *` production, `30 22 * * *` preview), so
"every tick" means daily. There is a manual **Sync now** button on
`/admin/lead-crm/settings` (`POST /api/admin/lead-crm/zoho/status` with
`action: 'sync_now'`) for when you do not want to wait.

### Failure recording

`recordSyncFailure` writes `last_error`, `last_error_at` and increments
`consecutive_failures`, and a `MAILBOX_SYNC_FAILED` activity row is written.
`lead_sync_state` keeps `last_success_at` separate from `last_sync_at` so the
status screen distinguishes "ran and found nothing" from "has not succeeded since
Tuesday". The dashboard raises it as a problem at 2 consecutive failures.

---

## What has been verified against a live mailbox

Confirmed 18 September 2026, against a real Zoho account on the `.com` data
centre, using `node scripts/lead-engine/zoho-setup.mjs verify`:

| Call | Status |
|---|---|
| `POST /oauth/v2/token` (refresh grant) | works |
| `GET /accounts` | works |
| `GET /accounts/<id>` — the connectivity probe | works |
| `GET /accounts/<id>/folders` | works |
| `GET /accounts/<id>/messages/view?folderId=…` | works |

### The one thing that was wrong, and is now fixed

`listMessages` originally sent `folderName=Inbox` / `folderName=Sent`. The live
API rejects that outright:

```json
{"data":{"errorCode":"EXTRA_PARAM_FOUND",
         "moreInfo":"folderName Extra paramters given"},
 "status":{"code":400,"description":"Invalid Input"}}
```

`/messages/view` wants **`folderId`**, which differs per mailbox. Rather than
making that a per-environment configuration value, `resolveFolderId()` in
`zoho/client.js` looks it up from `GET /accounts/<id>/folders` and caches it for
the life of the isolate — the same approach as the access-token cache.

**Matching is by `folderType` first, not by name.** Zoho localises folder
display names, so a mailbox whose interface language is not English has no
folder called "Inbox" — but its type is still `Inbox`. Name and path are
fallbacks for older API responses that omit the type.

## Honest notes: what has still not been verified

The items below remain untested against a live mailbox. The rest of
`zoho/zoho.test.js` (50 tests) runs against injected `fetchImpl` stubs.

1. **Creating a draft.** `verify` deliberately does not exercise `createDraft`,
   because that writes into a real Drafts folder. It is left for the operator to
   do from the Lead CRM once a lead reaches `READY_TO_CONTACT`. The response
   field names (`data.draftId`, `data.messageId`) are therefore unconfirmed — if
   Zoho names them differently the draft is still created, but the recorded id
   may be null.
2. **The content endpoint path.**
   `GET /accounts/<id>/messages/<messageId>/content`. Zoho's documentation
   includes a folder-scoped form. If body fetches 404 while listing works, this
   is why.
3. **Header exposure.** Thread matching prefers `threadId`/`conversationId` and
   then RFC 5322 `internetMessageId` / `inReplyTo` / `references`. Whether Zoho's
   list endpoint returns all of these is unconfirmed. If it returns none, thread
   matching degrades to contact-address matching, which still works but is weaker
   (see [conversations.md](conversations.md)).
4. **Timestamp units.** `parseZohoTimestamp` handles epoch seconds, epoch
   milliseconds (threshold `1e11`) and formatted dates. If the sync cursor jumps
   to 1970 or to the future, look here first.
5. **The web-client deep link.** `https://mail.zoho.com/zm/#mail/folder/Drafts`
   is a plausible, undocumented URL shape. If it stops working, the operator can
   simply open Zoho normally — nothing in the pipeline depends on it.

Every one of these fails *loudly* (a recorded sync failure with a redacted
message, or a 502 on the draft action) rather than silently, and none of them can
cause a message to be sent.
