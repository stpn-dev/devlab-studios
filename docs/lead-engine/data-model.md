# Data model

> **Superseded in part.** The mailbox integration this describes was removed —
> a Worker's rotating egress IPs got the provider account blocked for suspicious
> logins. Drafts are exported as `.eml` files and replies are read by a person
> in their own client. See [outreach-handoff.md](outreach-handoff.md).
>
> What remains accurate: the schema, the matching *order*, and the reasoning
> behind both. The columns and their names are unchanged, deliberately.


Everything is in `migrations/0012_lead_intelligence_engine.sql`, which is itself
heavily commented. This document is the map and the reasoning; the migration is
the authority.

**22 tables**, all prefixed `lead_`, all in the `devlab-studios-cms` D1 database
(binding `DB`). Nothing in the migration alters an existing table.

## Naming collision — read this first

| Table | Belongs to | Means |
|---|---|---|
| `leads` | The public site (migration 0006) | An **inbound** contact-form submission. Someone asked to be contacted. |
| `lead_activities` | The public site | Activity on an inbound inquiry. |
| `lead_leads` | This engine | An **outbound** prospect. A business that did not ask. |
| `lead_activity` (singular) | This engine | The outbound pipeline's append-only timeline. |

`lead_activity` and `lead_activities` are different tables with different
schemas and different purposes. Neither the singular/plural difference nor the
`lead_` prefix collision is an accident — the prefix was chosen for the engine's
tables, and `lead_activities` already existed. When writing a query, check which
one you mean.

## The tables

### Configuration

#### `lead_settings`
Runtime-editable operational configuration as key/value JSON: scoring
thresholds, signal weights, crawl/AI/discovery budgets, business identity,
crawler identity. `src/lead-engine/config/defaults.js` holds the defaults; a row
here overrides one, deep-merged by `repositories/settings.js`.

Key/value rather than columns so adding a tunable is a code change with a
default, not a migration. Deleting a row restores the default.

`is_secret` marks a value the admin UI must mask. **Real secrets do not belong
here at all** — no mail credentials exist, and aPI keys are
Cloudflare Worker secrets. `is_secret` is for merely sensitive operational
values such as the Zoho account id.

#### `lead_campaigns`
The only place vertical-specific knowledge lives. Country, metros, OSM tags,
Brave queries, industry vocabulary — all in `config_json`, validated by a zod
schema at the API boundary. The engine source contains no reference to property
management; Campaign 001's row does.

Two independent switches, and both must be on for the cron to touch a campaign:

- `status` must be `active`. A campaign is created `draft` and nothing in the
  schema or the scheduler promotes it.
- `schedule_enabled` must be `1`.

`max_candidates` and `max_ai_reviews` are per-campaign ceilings enforced *in
addition* to the global daily budgets. Whichever is lower wins.

#### `lead_sources`
An **allow-list** of places the engine may read from. A source that is not a row
here cannot be used. `automation_allowed` and `crawl_allowed` are separate
columns on purpose — a source may permit API access while forbidding page
crawling, or vice versa. `policy_status` records a *human's* reading of that
source's terms; the software does not decide it.

`parser_version` is bumped when normalization code for a source changes, so a
record imported under old rules is identifiable.

### Discovery

#### `lead_source_records`
The raw, normalized candidate as one source reported it, kept separate from the
deduplicated company. When two sources disagree about a name or address, both
claims survive here and `lead_companies` holds the resolved view.

**Idempotency:** `UNIQUE (source_id, external_id)`. Re-running discovery updates
the same record rather than creating a second one. For sources with no stable id
of their own (a search result, a pasted CSV), `normalizeCandidate` synthesizes
`domain:<canonical_domain>` as the external id.

`payload_json` holds the source's own payload, trimmed by `discovery/normalize.js`
to bounded strings, 24 keys per level, two levels deep, 10 array items. Never
the entire upstream response.

#### `lead_companies`
The deduplicated business. Keyed by `canonical_domain` — the registrable domain,
lowercased, no `www`, no scheme — because that is the only identifier two
independent sources reliably agree on.

`canonical_domain` is `UNIQUE NOT NULL`. **A candidate with no resolvable
website is not admitted**, because the entire research pipeline reads a public
website. See `domain/domains.js` for how the canonical domain is derived, and
[discovery.md](discovery.md) for the rejection reasons.

### Pipeline

#### `lead_leads`
One company inside one campaign. Separate from `lead_companies` so the same
business found by two campaigns is crawled, scored and researched once while
still having independent pipeline state, contact and conversation per campaign.
`lead_id` everywhere else in the schema means *this* table.

**Idempotency — the dedupe guarantee:**
`UNIQUE INDEX idx_lead_leads_campaign_company ON lead_leads(campaign_id, company_id)`.
A company appears at most once per campaign. Duplicate workflow or queue
delivery cannot create a second lead: the insert is an upsert against this
constraint (`repositories/leads.js` `upsertLead`).

`stage` is a wide `CHECK` mirroring `domain/pipeline.js`; a unit test asserts the
two lists match. **Transitions are not constrained in SQL** — the pipeline is
deliberately non-linear (see [pipeline.md](pipeline.md)), and a transition matrix
in SQL would forbid legitimate jumps while catching nothing the application does
not already check.

`rule_score`, `ai_confidence`, `opportunity_type` and `next_action` are
**denormalized caches** so the leads table can sort and filter without a
correlated subquery per row. `lead_scores` and `lead_ai_runs` remain the
auditable record.

### Research

#### `lead_crawl_runs`
One row per crawl attempt. **Append-only**: a failed crawl and its later
successful retry both survive, so "this site blocks us" is distinguishable from
"we never tried".

`skip_reason` carries the disallowed case. A robots.txt refusal, a source-policy
refusal or an SSRF guard rejection is recorded as a skip *with the reason* rather
than silently not happening.

`pages_json` holds per-page outcomes — url, status, content-type, bytes, whether
it was used, and the reason if not. **Never page bodies.** `services/research.js`
strips `html` from every page before storing the run.

#### `lead_signals`
One row per deterministic observation. Rows rather than a JSON blob because
scoring joins against these, the admin filters on them, and each carries its own
evidence and confidence.

`evidence` is a short excerpt (240 characters, `CRAWLER.evidenceExcerptLength`)
supporting the observation — enough for a human to verify a claim without the
engine retaining the page. Full HTML is never stored anywhere.

**Idempotency:** `UNIQUE (lead_id, category, signal_key)`. A re-crawl replaces a
lead's signals wholesale (delete-then-insert in one batch), so re-extraction is
idempotent.

#### `lead_scores`
One row per scoring run. **Append-only**, so changing a weight and rescoring
leaves the previous score auditable and comparable. `is_current` marks the
active one.

`reasons_json` is the explainability record: an array of
`{code, label, points, category}`. The total is stored alongside rather than
recomputed, so the displayed score always matches the reasons that produced it
even after weights change. `ruleset_version` records which configuration
produced it.

### AI

#### `lead_ai_runs`
Every Workers AI call, successful or not. The cost ledger, the prompt-version
record and the debugging trail in one table.

`prompt_version` names a file under `src/lead-engine/ai/prompts/`, which is in
Git. A result whose prompt cannot be reconstructed is not auditable, which is why
prompts are never inlined into UI or route code.

`raw_output` is retained **only** when `status = 'invalid_output'` — the one case
where a human needs to see what the model actually said. Bounded to
`AI.rawOutputRetentionChars` (2000).

`neurons`, `input_tokens` and `output_tokens` are nullable because not every
model reports usage. See [workers-ai.md](workers-ai.md) for why this makes the
neuron budget advisory.

### Contacts and compliance

#### `lead_contacts`
A publicly published business contact address, with evidence of where it was
published.

**Provenance is the admission requirement, not metadata.** `source_url` and
`source_type` are `NOT NULL`. There is **no `inferred` value in `source_type`**,
by design — guessed or pattern-derived addresses (`firstname.lastname@`) have
nowhere to be stored.

`mx_present` records that the domain publishes MX records. `NULL` means not
checked; `0`/`1` mean checked and absent/present. **This is not mailbox
verification** — see [contacts.md](contacts.md).

`UNIQUE (lead_id, email)`.

#### `lead_compliance_reviews`
The per-lead compliance state for the campaign's country profile.

This is an **operational safeguard record, not a legal determination.** It
records which configured checks passed, which country profile applied, and what
a human reviewer decided. `UNIQUE (lead_id)` — one review per lead.

`checks_json` holds per-check `{key, required, passed, detail}` so a blocked lead
says exactly which check blocked it. `legal_basis` and `legal_basis_reference`
(PH profile) are free-text references to an assessment held outside this system.

`state` is one of `pending`, `passed`, `blocked`, `needs_human_review`, `waived`.
`waived` can only be written by `repositories/compliance.js` with a named
reviewer and a reason; `evaluateCompliance()` can never compute its way to it.

#### `lead_suppression`
The hard boundary. A match stops outreach generation entirely, and it is checked
at draft generation, at draft export *and* at review-queue admission — no
single missed call site can let a suppressed address through.

`scope` is `email` or `domain`. A domain entry suppresses every address at that
domain, including ones not yet discovered.

**Idempotency:**
`UNIQUE INDEX idx_lead_suppression_active ON lead_suppression(scope, value) WHERE removed_at IS NULL`.
A *partial* unique index: exactly one active entry per value/scope, while any
number of historical (removed) entries for the same value may coexist. That is
what lets "we suppressed this, then someone unsuppressed it, then we suppressed
it again" be a readable history rather than a constraint violation.

Rows are never hard-deleted by normal operation. `removeSuppression` requires a
reason of at least three characters and records `removed_at` / `removed_by` /
`removal_reason`.

### Conversations

#### `lead_conversations`
One thread per lead (usually). `provider_thread_id` is the provider's own thread
identifier when it exposes one, and is preferred over header matching.
`status` is `open`, `awaiting_reply`, `needs_attention`, `resolved` or `closed`.

#### `lead_messages`
**Immutable once written.** The mailbox sync only ever INSERTs; nothing in the
application updates a message body. The conversation view is a record of what was
actually said. (`attachMessageAnalysis` writes the `classification`,
`ai_summary` and `ai_intent` columns — commentary *about* the message, never the
body itself.)

**Idempotency:**
`UNIQUE INDEX idx_lead_messages_provider ON lead_messages(provider, provider_message_id) WHERE provider_message_id IS NOT NULL`.
This is what makes mailbox sync idempotent: re-syncing an overlapping window, or
a duplicate queue delivery, cannot import the same message twice. The sync
deliberately *does* re-read an overlapping window (`ZOHO.syncOverlapMinutes`,
10 minutes) precisely because this index makes the overlap free.

`body_text` is plain text only, capped at `ZOHO.maxBodyChars` (20 000) with
`body_truncated` flagged. Raw MIME and HTML parts are deliberately not retained:
the reply copilot reads text, and storing full MIME would keep more personal data
than the purpose requires. Quoted reply history is stripped
(`zoho/normalize.js` `stripQuotedHistory`).

`classification` is written by the **deterministic** opt-out check, which runs
before any AI. `ai_summary` / `ai_intent` are added afterwards, if at all.

#### `lead_outreach_drafts`
A suggested message. **Never a send queue.** There is no `sent` status and no
`send_after` column, and that absence *is* the architecture — nothing in this
system can transition a draft to sent, because nothing sends.

`zoho_draft_id` records that the message was saved to the Zoho Drafts folder.
The move to `CONTACTED` comes later and exclusively from observing the message in
Zoho's Sent folder.

`variant` records which regeneration button produced it (`regenerate`,
`shorter`, `more_technical`, `suggest_call`, `no_cta`, or a reply-specific one).

### Tracking

#### `lead_tracking_tokens`
Opaque redirect tokens for `/r/:token`. 32 bytes from `crypto.getRandomValues`,
base64url — non-sequential and unguessable, so a token reveals nothing about how
many leads exist. `destination_url` is stored resolved and **re-validated against
the code-level allow-list at redirect time**, so an open redirect needs both a
database write and a code change.

#### `lead_tracking_events`
One row per click, plus `contact_form_conversion` rows.

**No tracking pixels exist anywhere in this system.** An open is not recorded,
because it is not actionable and requires embedding a resource in someone's
inbox.

`inbound_lead_id` references the pre-existing `leads` table by id and is
**deliberately not a foreign key**: `leads` belongs to the public site, and this
engine must never be able to block or cascade a delete there.

### Timeline, budgets, sync, jobs

#### `lead_activity`
**Append-only.** Nothing updates or deletes a row, which is what makes the lead
detail timeline trustworthy: it is a record of what happened, not a derived
summary that can drift.

`event_type` has **no `CHECK` constraint**, unlike `stage`. This set grows with
every new capability and a migration per event type would make adding one
needlessly expensive. The closed vocabulary lives in `domain/activity.js`
instead, and `recordActivity` rejects an unlisted event — the contract is
enforced in code rather than in the schema.

**Idempotency:**
`UNIQUE INDEX idx_lead_activity_dedupe ON lead_activity(dedupe_key) WHERE dedupe_key IS NOT NULL`.
Another partial index. Events that must not be recorded twice for the same cause
carry a stable key and the insert is `OR IGNORE`. Keys in use include
`signals:<crawlRunId>`, `contacts:<crawlRunId>`, `inbound:<providerMessageId>`,
`outbound:<providerMessageId>`, `reply_analyzed:<messageId>`,
`duplicate:<leadId>:<domain>`, `conversion:<inboundLeadId>`, `job_dead:<jobId>`.

#### `lead_usage_daily`
One row per `(day, metric, campaign)`. **Incremented before the work happens**,
so a budget cannot be exceeded by work already in flight.

`limit_value` is copied in at first increment of the day from the effective
configuration, so the ledger records the budget that was actually in force rather
than whatever the setting happens to be when it is later read.

`UNIQUE (usage_date, metric, COALESCE(campaign_id, ''))` — the `COALESCE` lets
the global (campaign-less) counter and per-campaign counters coexist without
`NULL` defeating uniqueness.

The atomicity guarantee lives in `repositories/usage.js`: `consumeBudget` is a
single conditional `UPDATE ... WHERE used + ? <= ?`. If it changes a row the
caller owns that unit; if not, the budget is spent. A read-then-write would let
two concurrent jobs both see room for the last unit.

#### `lead_sync_state`
The incremental mailbox sync cursor, one row per
`(provider, mailbox, folder)`. Without a durable cursor the only safe sync is a
full mailbox mirror, which this system explicitly does not do.

`last_success_at` is separate from `last_sync_at` so the Zoho status screen can
distinguish "ran and found nothing" from "has not succeeded since Tuesday".
`consecutive_failures` drives the scheduler's backoff.

#### `lead_jobs`
The engine's own work ledger, and the reason it runs correctly with no
Cloudflare Queues or Workflows bindings configured. See [queues.md](queues.md).

**Idempotency:**
`UNIQUE INDEX idx_lead_jobs_dedupe ON lead_jobs(dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('pending','running')`.
A partial index scoped to *outstanding* jobs. Enqueueing the same logical job
twice is a no-op while the first is pending or running — but enqueueing it again
after the first **succeeded** is allowed, because re-crawling a lead next week is
legitimate work, not a duplicate.

`payload_json` is capped at 4000 characters by `enqueueJob`, which throws if
exceeded. Jobs carry IDs and small scalars; the handler re-reads from D1.

`leased_until` implements leasing rather than delete-on-claim, so a Worker that
dies mid-job leaves an expired lease the next runner reclaims
(`JOBS.leaseSeconds` = 300).

`dead_lettered_at` marks the terminal failure state: attempts exhausted (or a
permanent error), visible in the admin as a failed job, retryable by a human.

`workflow_instance_id` exists for the day Workflows are bound. **Nothing writes
it today** — see [cloudflare-workflows.md](cloudflare-workflows.md).

## Idempotency summary

| Guarantee | Mechanism |
|---|---|
| A company appears once per campaign | `UNIQUE (campaign_id, company_id)` on `lead_leads` |
| A business is one company across campaigns | `UNIQUE canonical_domain` on `lead_companies` |
| Re-discovery updates, never duplicates | `UNIQUE (source_id, external_id)` on `lead_source_records` |
| A message imports once | Partial `UNIQUE (provider, provider_message_id)` on `lead_messages` |
| One active suppression per value | Partial `UNIQUE (scope, value) WHERE removed_at IS NULL` |
| One outstanding job per logical unit | Partial `UNIQUE (dedupe_key) WHERE status IN ('pending','running')` |
| Timeline events not doubled | Partial `UNIQUE (dedupe_key) WHERE dedupe_key IS NOT NULL` + `INSERT OR IGNORE` |
| Signals replaced, not accumulated | `UNIQUE (lead_id, category, signal_key)` + delete-then-insert batch |
| Budget not overspent under concurrency | Single conditional `UPDATE` in `consumeBudget` |
| Pressing "Download .eml" twice | `status === 'zoho_draft_created'` short-circuit returns `already_created` |
