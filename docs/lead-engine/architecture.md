# Architecture

## The system has no send capability

State this first because every other design decision follows from it.

Nothing in this codebase can transmit an email to a prospect. This is not a
feature that is switched off, and it is not gated behind a flag. The code does
not exist.

Three separate, verifiable facts back that up:

1. **`src/lead-engine/zoho/client.js` has no send function.** It exports
   `createDraft`, `listMessages`, `getMessageContent`, `buildZohoUrl` and
   `checkConnection`. There is no other function in the file that POSTs a
   message.
2. **`mode: 'draft'` is a literal.** Zoho's message endpoint takes a `mode`
   parameter where `draft` saves to Drafts and `sendMail` transmits.
   `createDraft` writes `mode: 'draft'` inline in the payload object. It is not
   a parameter, not a default, and no caller can change it.
3. **`assertNoSendMode(payload)` refuses.** Before the payload leaves
   `createDraft`, it is passed through a guard that throws a non-retryable
   `ZohoApiError` if `mode` is anything other than `draft`, or if
   `scheduleType` / `scheduleTime` are present. It is belt-and-braces behind the
   literal, and it turns a future mistake into an exception at the boundary
   rather than an email to a stranger.

The consequences, which the rest of this documentation assumes:

- `lead_outreach_drafts` has **no `sent` status and no `send_after` column**.
  Its statuses are `draft`, `edited`, `zoho_draft_created`, `zoho_draft_failed`,
  `discarded`, `superseded`.
- The only thing that moves a lead to `CONTACTED` is the **Zoho Sent folder
  sync** observing that a message to that lead's contact actually left the
  mailbox (`services/mailboxSync.js`, `handleOutboundMessage`). The operator is
  never asked to press "Mark Sent".
- There is **no auto-send feature flag**, deliberately. `config/flags.js` says
  so in its module comment: a flag would imply a switch exists.

If a send capability is ever wanted, it has to be written on purpose, and
`assertNoSendMode` has to be deleted on purpose.

## One Worker

DevLab Studios is a single Astro application deployed as one Cloudflare Worker
(`src/worker.ts` is `main` in `wrangler.jsonc`). The Lead Intelligence Engine
runs inside that same Worker. It is not a separate service, a separate deploy,
or a separate account resource.

```
                         one Cloudflare Worker (devlab-studios)
  ┌───────────────────────────────────────────────────────────────────────┐
  │  fetch()      public site · Admin CMS · /admin/lead-crm · /api/* · /r/ │
  │  scheduled()  Insights digest  +  runScheduledTick()  (lead engine)    │
  │  queue()      handleQueueBatch()   (declared; no queue bound)          │
  │  exports      Durable Objects  +  5 Workflow classes (not bound)       │
  └───────────────────────────────────────────────────────────────────────┘
        │              │                │              │            │
     D1 (DB)       Workers AI      Zoho Mail API   Overpass    Brave (optional)
   devlab-studios-cms   @cf/meta/...   mail.zoho.com  overpass-api.de
```

What that buys: no extra deploy pipeline, no second set of secrets, no
cross-service auth, and the engine inherits the existing admin session gate in
`src/middleware.ts` for free — `/api/admin/lead-crm/*` is under `/api/admin/*`.

What it costs: the engine shares the Worker's CPU budget and, crucially, its
**deploy fate**. A misconfigured binding for the lead engine fails the deploy of
the public site. That single fact is why Queues and Workflows are commented out
in `wrangler.jsonc` — see [queues.md](queues.md) and
[cloudflare-workflows.md](cloudflare-workflows.md).

## D1 is the system of record

Every fact the engine knows lives in D1 before any subsequent step runs. This is
not incidental; it is what makes the whole thing resumable.

- `services/research.js` writes the crawl run, then the signals, then the
  contacts, then the score — each to D1 before the next begins. A Worker that
  dies mid-pipeline leaves a lead with a completed crawl and no signals, which
  the next run continues from.
- `lead_jobs` is the authoritative work ledger. Queues and Workflows, when they
  are eventually bound, are an *acceleration layer* over it, not a replacement.
- Workflow state, if Workflows were bound, would be execution bookkeeping only.
  `workflows/index.ts` says this explicitly: "a lost workflow instance costs a
  re-run, never a lost lead."

Nothing is cached anywhere else. There is no KV, no Durable Object, and no R2
object in the engine's path. The one piece of in-memory state is the Zoho access
token cache in `zoho/oauth.js`, which is per-isolate, one hour long, and
deliberately not written to D1 (a live bearer credential in every database
backup would be a poor trade for saving one HTTP request per isolate).

## Why `lead_*` lives in the CMS database

`migrations/0012_lead_intelligence_engine.sql` creates 22 tables in
`devlab-studios-cms`, the same D1 database the CMS uses, all prefixed `lead_`.
There is no separate database. Two reasons, both operational:

1. **Contact-form attribution needs a cross-table join.** When a prospect who
   followed a tracked link later submits the public contact form,
   `tracking/attribution.js` associates the row in the site's pre-existing
   `leads` table with the outbound prospect in `lead_leads`. A D1 statement
   cannot join across databases. A second database would turn one query into an
   application-level join that can silently half-succeed.
2. **A second database buys separation the prefix already provides,** at the
   cost of a second migration lineage and a second backup/restore procedure — a
   real burden for a single-operator system.

Nothing in migration 0012 touches an existing table.

### `lead_leads` and `leads` are different concepts

This is the single most confusing naming collision in the repository, and it is
deliberate rather than accidental.

| Table | Meaning |
|---|---|
| `leads` (pre-existing, migration 0006) | Inbound contact-form submissions. People who **asked** to be contacted. |
| `lead_leads` (this engine) | Outbound prospects the engine discovered. Businesses that **did not** ask. |
| `lead_activities` (pre-existing) | Activity on an inbound contact-form inquiry. |
| `lead_activity` (this engine, singular) | The outbound pipeline's append-only timeline. |

The two are never merged. `lead_tracking_events.inbound_lead_id` points at the
`leads` table by id but is **deliberately not a foreign key**, so this engine can
never block or cascade a delete in the public site's own table.

## The flow, end to end

```
  Campaign (draft → active, by a human)
        │
   [1]  ├── Discovery ............ services/discovery.js
        │     source registry gate → Overpass / Brave / manual import
        │     → normalize → dedupe on canonical domain
        │     → lead_companies + lead_leads (DISCOVERED)
        │     → enqueue lead_research
        │
   [2]  ├── Research ............. services/research.js
        │     robots.txt → up to 4 pages → signals → contacts → score
        │     → RESEARCHED → RULE_QUALIFIED | HOLD | NOT_QUALIFIED
        │     → if AI-routed, enqueue ai_review
        │
   [3]  ├── AI review ............ services/aiReview.js
        │     Workers AI opportunity_review, schema-validated
        │     → AI_QUALIFIED → CONTACT_FOUND | NO_CONTACT
        │     → enqueue outreach_draft
        │
   [4]  ├── Draft ................ services/outreach.js
        │     six-condition gate (see below) → Workers AI outreach_draft
        │     → invention guard → lead_outreach_drafts
        │     → READY_FOR_REVIEW
        │
   [5]  ├── HUMAN REVIEW ......... /admin/lead-crm/review
        │     read the opportunity, edit the draft, approve
        │
   [6]  ├── Create Zoho Draft .... services/zohoDraft.js
        │     re-checks suppression → Zoho Drafts folder
        │     → READY_TO_CONTACT   (NOT contacted)
        │
   [7]  ├── HUMAN SENDS IN ZOHO ..  outside this system entirely
        │
   [8]  ├── Sent sync ............ services/mailboxSync.js
        │     observes the message in Sent
        │     → CONTACTED → AWAITING_REPLY
        │
   [9]  ├── Inbox sync ........... services/mailboxSync.js
        │     deterministic opt-out check FIRST
        │     → suppressed + UNSUBSCRIBED/DO_NOT_CONTACT, or → REPLIED
        │
  [10]  ├── Reply copilot ........ services/replyCopilot.js
        │     analyse → suggest a reply → back to [5]/[6]/[7]
        │
  [11]  └── MEETING → PROPOSAL → WON | LOST   (all operator-recorded)
```

Steps 5 and 7 are people. There is no configuration that removes them.

### The six-condition outreach gate

`services/outreach.js` `checkOutreachReadiness()` checks all six in one place
and returns *every* failure rather than the first:

1. The lead is rule-scored.
2. The AI review qualified it at or above `minConfidenceForOutreach` (0.6).
3. A contact exists.
4. That contact has acceptable provenance (`sourceUrl`, `sourceType`,
   `publishedPublicly`).
5. The country compliance profile permits review (`passed` or human-`waived`).
6. Neither the address nor its domain is suppressed.

Suppression is additionally re-checked at Zoho-draft creation time, because time
passes between a screen rendering and a button being pressed.

## What Cloudflare owns

| Cloudflare service | Role here | Bound today? |
|---|---|---|
| Workers | The whole application | Yes |
| D1 (`DB`) | System of record for all 22 `lead_*` tables | Yes |
| Workers AI (`AI`) | Four judgement tasks, `@cf/meta/llama-3.1-8b-instruct-fp8` | Yes (shared with the Insights digest) |
| Cron triggers | `0 22 * * *` production, `30 22 * * *` preview — drives `runScheduledTick` | Yes |
| Browser Rendering (REST) | Optional fallback for client-rendered sites | Only if `CLOUDFLARE_ACCOUNT_ID` + `BROWSER_RENDERING_API_TOKEN` are set |
| Queues | Optional fan-out for job dispatch | **No** — commented out |
| Workflows | Optional durable execution | **No** — commented out |
| R2, Durable Objects, KV | Not used by this engine | n/a |

Browser Rendering uses the **REST `/content` endpoint**, not the Workers
binding, specifically to avoid adding `@cloudflare/puppeteer` — a substantial
dependency — to a Worker that serves the public site, for a path that runs on a
small minority of leads. With the account id and token absent, `browserRun.js`
is completely inert.

## Everything defaults to off

| Layer | Shipped state |
|---|---|
| Feature flags in `wrangler.jsonc` `vars` (both environments) | All nine `false` |
| `LEAD_ENGINE_ENABLED` | Master switch; every other flag is ANDed with it |
| Seeded discovery sources | Registered, `enabled=0`, `automation_allowed=0`, `policy_status='unreviewed'` |
| Seeded Campaign 001 | `status='draft'`, `schedule_enabled=0` |
| `business.identity` setting | Seeded empty, which makes the US compliance profile hold every US lead |
| Queues / Workflows bindings | Commented out |

`runScheduledTick` returns `{ status: 'disabled' }` immediately when
`LEAD_ENGINE_ENABLED` is not truthy. `isFlagOn` treats an unset var, an empty
string and the literal string `"false"` as off — the last one matters because
Cloudflare vars are always strings and `Boolean('false')` is `true`.

## First-party tracking

There is no dedicated tracking document (the engine's own comment in
`services/dashboard.js` points at a `docs/lead-engine/tracking.md` that does not
exist — see the note at the end of this file). The behaviour is:

- `lead_tracking_tokens.token` is 32 random bytes, base64url, non-sequential.
- **Tokens are minted during draft generation**, by `mintTrackedLink` in
  `services/outreach.js`, and the resulting `/r/<token>` URL is passed to the
  model as the **sole** `allowed_links` entry. Minting never throws — a tracking
  failure must not cost the draft.
- With `LEAD_TRACKING_ENABLED` off (the default) no token is minted and
  `allowedLinks` is **empty**, which means the content guard rejects *every* URL
  the model produces. A disabled tracker therefore cannot degrade into an
  untracked raw link: no link is better than a link nobody decided to include.
- `/r/:token` (`src/pages/r/[token].ts`) records a click and 302s to the
  destination. An invalid, expired, revoked or unknown token all get **the same
  answer** — a redirect to the site root — so a token cannot be probed for
  existence.
- Destinations are validated against a code-level host allow-list
  (`TRACKING.allowedHosts`, exact hostname match, https only) at *both* token
  creation and redirect time. An open redirect therefore requires a database
  write *and* a code change.
- The attribution cookie `devlab_ref` is first-party, `HttpOnly`, `SameSite=Lax`,
  and holds the opaque token and nothing else. The browser never carries a lead
  id or an email address.
- **There are no tracking pixels.** An email open is not recorded anywhere, in
  any table. A click is a deliberate act by the recipient; an open is not.
- With `LEAD_TRACKING_ENABLED` off, `/r/:token` still redirects successfully and
  simply records nothing. A prospect must never see an error because of how this
  system is configured.

`attributeInquiry` never throws and never changes the public contact form's
response. A lost attribution is worth nothing next to a lost customer.

## Known documentation gap

`src/lead-engine/services/dashboard.js:10` references
`docs/lead-engine/tracking.md`, which is not one of the documents in this
directory. The tracking behaviour it points at is documented in the section
above and in [data-model.md](data-model.md).
