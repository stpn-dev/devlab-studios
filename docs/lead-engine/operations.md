# Operations

Day-to-day running of the Lead Intelligence Engine. For the site as a whole see
[`../operations.md`](../operations.md).

All screens are under `/admin/lead-crm`, behind the existing admin session gate.

| Screen | Route |
|---|---|
| Dashboard | `/admin/lead-crm` |
| Campaigns | `/admin/lead-crm/campaigns` |
| Leads | `/admin/lead-crm/leads` |
| Review Queue | `/admin/lead-crm/review` |
| Replies | `/admin/lead-crm/replies` |
| Conversations | `/admin/lead-crm/conversations` |
| Activity (and jobs) | `/admin/lead-crm/activity` |
| Sources | `/admin/lead-crm/sources` |
| Suppression | `/admin/lead-crm/suppression` |
| CRM Settings | `/admin/lead-crm/settings` |

## The daily working loop

Roughly 20–40 minutes, in this order.

### 1. Dashboard — what needs a person

Open `/admin/lead-crm`. The **Actionable** cards are a work queue; each one is
something a person does, not a number.

| Card | Means | Do |
|---|---|---|
| Qualified awaiting review | Leads at `READY_FOR_REVIEW` | Go to step 2 |
| Ready to contact | Leads at `READY_TO_CONTACT` | Go to step 3 |
| New replies | Unanswered inbound messages | Go to step 4 |
| Reply drafts ready | Suggested responses waiting | Step 4 |
| Leads needing manual action | Leads at `NO_CONTACT` | Add a contact by hand, or archive |
| Failed research jobs | Failed crawls (7d) + dead-lettered jobs | See "Dead-lettered jobs" |
| Mailbox problems | Sync states with ≥2 consecutive failures | See "Mailbox sync fails" |
| Suppression events | Opt-outs and complaints in the last 24h | Read them. A cluster is a signal about the message, not about the recipients. |

### 2. Review Queue → approve or reject

`/admin/lead-crm/review`. For each lead:

- Read the **opportunity**. The AI review separates `observed_problem` (what the
  public site shows) from `inference_notes` (what the model is guessing). Only the
  first belongs in an email to a stranger.
- Read the **score reasons**. They are sorted by absolute contribution, so the top
  two or three explain the lead.
- Read the **draft**. Check the opening observation against the evidence
  excerpts. If the draft has `violations[]` attached, read those first — the
  invention guard caught something the model was told not to write.
- Check the **contact provenance**: which URL, which kind of page.
- Then: approve, regenerate with a variant (`shorter`, `more_technical`,
  `suggest_call`, `no_cta`, `regenerate`), edit by hand, hold, or reject.

Approving is what moves a lead toward Zoho. It does not send anything.

### 3. Create the Zoho draft → open Zoho → send by hand

On the lead detail screen, **Create Zoho Draft** saves the message into your Zoho
Drafts folder and moves the lead to `READY_TO_CONTACT`. Pressing it twice is safe
(it returns the existing draft).

**Open Zoho** opens the Drafts folder. Zoho does not document a stable
per-message deep link, so the UI tells you which draft to look for.

Then **you** read it in Zoho and press Send. That is the only way a prospect is
ever emailed.

The lead becomes `CONTACTED` on the next mailbox sync, when the engine sees the
message in Sent. You are not asked to mark it sent — the system can see what
actually left.

### 4. Replies

`/admin/lead-crm/replies`. For each unanswered reply:

- Read the **analysis** — intent, what they actually asked, anything new.
- If `needs_human_attention` is set, **there is no suggested reply**, by design:
  the model said the situation is unclear, and drafting confidently on top of that
  is the wrong response to uncertainty. Write this one yourself.
- Otherwise read the suggested reply, edit it, and create the Zoho reply draft.
- Send it from Zoho. The lead moves to `CONVERSATION` on the next sync.

Replies that are opt-outs never reach this screen. They were suppressed
deterministically at import, the lead is compliance-terminal, and no model was
consulted.

### 5. Record outcomes

Meetings, proposals, won, lost. The engine cannot observe any of these, so if
they are not recorded the funnel is wrong. `/admin/lead-crm/leads` → lead detail →
actions.

### 6. Weekly, not daily

- **Suppression** screen: sanity-check the week's entries.
- **Sources** screen: confirm nothing changed policy status unexpectedly.
- **Campaigns**: run discovery if the schedule is not armed (it should not be,
  early on — see [dry-run.md](dry-run.md)).
- **Usage**: check whether any budget is being hit consistently.

## Reading the dashboard

### Pipeline funnel vs actionable cards

Deliberately separate. The funnel is a **health metric**; the cards are a **work
queue**. Conflating them produces a screen that looks busy and tells you nothing.

The funnel uses **cumulative** counts: "researched" means researched *or further
along*. Counting only leads sitting *at* a stage produces a funnel that goes up
and down as work drains through it.

### Numbers worth watching

| Ratio | Healthy-ish | If it is wrong |
|---|---|---|
| discovered → researched | Most | Crawls are failing or being skipped. Check failed research jobs and robots refusals. |
| researched → rule qualified | 20–50% | Too low: the campaign vocabulary does not match the sites. Too high: the disqualifying keywords are too narrow. See [scoring.md](scoring.md). |
| rule qualified → AI qualified | 30–70% | Too low: the score is qualifying businesses the model does not see an opportunity in. Consider raising the threshold rather than loosening the model. |
| AI qualified → contact found | High | Low means the crawler is not reaching contact pages, or addresses are being filtered. See [contacts.md](contacts.md). |
| contacted → replied | Whatever it is | This is the only number that measures the *message*, and it is the one worth optimizing. |

`doNotContact` combines `DO_NOT_CONTACT` and `UNSUBSCRIBED`. If it climbs
relative to contacted, stop and reread the drafts.

### What the dashboard does not show

**Email opens.** There is no open tracking in this system. There is no pixel, no
`lead_tracking_events` row for an open, and no code that could produce one. If a
number for opens is ever wanted, it does not exist and cannot be back-filled.

Clicks on first-party tracked links *are* recorded, when
`LEAD_TRACKING_ENABLED` is on.

## Usage guardrails

`lead_usage_daily`, `repositories/usage.js`. Every budget is **consumed before the
work**, in a single conditional `UPDATE`, so it cannot be overspent by work
already in flight.

### Daily defaults (`USAGE_LIMITS`)

| Metric | Limit | Consumed by |
|---|---:|---|
| `discovery_candidates` | 200 | Each candidate admitted; **released** if it was a duplicate |
| `crawl_pages` | 800 | Each page **attempt**; unused reservations released |
| `browser_runs` | 20 | Each Browser Run; released on failure |
| `ai_reviews` | 60 | Each Workers AI call |
| `ai_neurons` | 5000 | Advisory only — see below |
| `brave_requests` | 100 | Each Brave HTTP call |
| `overpass_requests` | 40 | Each Overpass HTTP call |
| `zoho_api_calls` | 500 | Each Zoho HTTP call, **including a 401 retry** — the budget is about load on Zoho, not logical operations |

Plus `MONTHLY_DISCOVERY_LIMIT` = 3000, summed across the month's global daily
rows.

Campaign-level ceilings (`max_candidates`, `max_ai_reviews`) apply **on top**.
Whichever is lower wins. AI reviews are counted twice — once globally, once per
campaign — so one campaign cannot consume the day's whole allowance.

### `ai_neurons` is advisory

Not every model reports usage. `readUsage` reads `usage.neurons` and leaves it
`null` when absent. So this counter bounds **what we can measure, not what we can
spend**. The authoritative control is `ai_reviews` — a count of calls, which does
not depend on the model volunteering anything. Cloudflare's dashboard is the
authority on real neuron consumption.

### Changing a limit

`/admin/lead-crm/settings` → `usage.daily`. Overrides are deep-merged over
`config/defaults.js`; deleting a row restores the default.

`limit_value` is copied onto the counter row at the **first increment of the
day**, so raising a limit mid-day does not retroactively change what earlier runs
were allowed. Today's counter keeps today's limit; the new one applies tomorrow.

### When a limit is hit

A `USAGE_LIMIT_REACHED` activity row is written, `limit_reached_at` is stamped
once (the `IS NULL` guard makes it "when did we run out", not "when did we last
try"), and the work defers rather than failing.

## When jobs dead-letter

A job is dead-lettered when attempts are exhausted (`max_attempts` = 3) or when
the failure is classified **permanent** — a disabled feature, a missing lead,
`zoho_reauthorization_required`, `zoho_not_configured`, an explicit
`retryable: false`, or any 4xx other than 408/429. A permanent failure
dead-letters immediately rather than burning two more attempts.

It becomes visible work: a `JOB_DEAD_LETTERED` activity row (deduped on
`job_dead:<jobId>`) and a count on the dashboard's **Failed research jobs** card.
Dead-lettered jobs are **never pruned** by maintenance — they are the record of
what failed and the thing an operator retries.

### What to do

1. Open `/admin/lead-crm/activity`, filter jobs by `status=dead`.
2. Read `last_error`. It is the message, not a code.
3. Diagnose:

| Error mentions | Cause | Fix |
|---|---|---|
| `This capability is disabled. Enable it in Lead CRM Settings; LEAD_… must also permit it.` | The UI switch or its deployment ceiling is off | Check CRM Settings first. If deployment-locked, set the Worker var and redeploy. **Do not retry first** — it will fail identically. |
| `robots_disallowed` | The site refused us | Correct. Nothing to fix. Reject or archive the lead. |
| `Zoho is not fully configured. Missing: …` | Secrets absent | [zoho-integration.md](zoho-integration.md) Part 1.6 |
| `zoho_reauthorization_required` / `invalid_grant` | Refresh token revoked | Redo the auth-code flow |
| `Workers AI call failed` | Allocation exhausted, or a transient outage | Wait for tomorrow, or check Cloudflare status |
| `Lead not found` / `Campaign not found` | Something was deleted | Nothing to retry |
| A network/timeout message | Transient | Retry |

4. Retry: `POST /api/admin/lead-crm/jobs` with `{ action: 'retry', jobId }` (the
   button on the Activity screen). It resets the job to `pending` with attempts
   cleared.
5. Or drain the whole backlog by hand:
   `{ action: 'drain', limit: 25 }`.

### Failed crawls are separate

The **Failed research jobs** card sums dead-lettered jobs *and*
`lead_crawl_runs` rows with `status = 'failed'` in the last 7 days. A failed crawl
is not necessarily a failed job: `services/research.js` records the crawl failure,
moves the lead to `HOLD`, and returns successfully. That is deliberate — a site
that will not load is a lead outcome, not a system error.

### Stranded jobs

A Worker that dies mid-job leaves `status = 'running'` with an expired
`leased_until`. The `maintenance` job (enqueued once a day, deduped on
`maintenance:<date>`) calls `reclaimStaleJobs` and `pruneCompletedJobs`. The
scheduler runs maintenance **first** on every tick, so work lost to a dead Worker
becomes visible and runnable again before anything else runs.

## When mailbox sync fails

### Symptoms

- Dashboard **Mailbox problems** card is non-zero (threshold: 2 consecutive
  failures).
- `/admin/lead-crm/settings` shows the Zoho status.
- A `MAILBOX_SYNC_FAILED` activity row with the redacted error.
- Leads stuck at `READY_TO_CONTACT` after you sent from Zoho — the engine has not
  seen the Sent message.

### Diagnose

`lead_sync_state` keeps `last_sync_at` (we tried), `last_success_at` (we
succeeded) and `last_error` / `last_error_at` separately, so you can tell "ran and
found nothing" from "has not succeeded since Tuesday".

| `last_error` | Cause | Fix |
|---|---|---|
| `Zoho is not fully configured. Missing: …` | A secret is absent | Set it |
| `invalid_grant` / `zoho_reauthorization_required` | Token revoked — password change, app removed in the API console, or Zoho's 20-token limit evicted it | Redo [zoho-integration.md](zoho-integration.md) 1.3–1.4 and `wrangler secret put ZOHO_OAUTH_REFRESH_TOKEN` |
| `Zoho API error: …` 4xx | Wrong account id, wrong scope, or a wrong endpoint shape | Check the account id; see the "not verified against the live API" list in [zoho-integration.md](zoho-integration.md) |
| `Zoho request timed out.` | Transient | It retries |
| Sync succeeds but imports nothing | The folder-name query or thread matching | Same list |

### Backoff

After 5 consecutive failures the scheduler drops to roughly hourly instead of
every tick. Repeated failures are usually a token that needs re-authorizing,
which no amount of retrying fixes.

### Force a sync

`/admin/lead-crm/settings` → **Sync now**
(`POST /api/admin/lead-crm/zoho/status` with `{ action: 'sync_now' }`). Useful
after fixing a token, and generally, because the cron only fires once a day.

### The cursor is safe

It only advances on success, and the window deliberately overlaps by 10 minutes.
Import is idempotent on `provider_message_id`, so a failed sync loses nothing —
the next successful one re-reads the same window.

To force a full re-read of the last 7 days, clear the cursor:

```bash
npx wrangler d1 execute devlab-studios-cms --remote \
  --command "UPDATE lead_sync_state SET cursor = NULL WHERE folder = 'inbox'"
```

Safe by construction, but it costs Zoho API calls.

## When the AI budget runs out

### What happens

`consumeBudget(db, 'ai_reviews')` refuses. Then:

1. A `USAGE_LIMIT_REACHED` activity row on the lead:
   *"Daily AI review limit of 60 reached. This lead will be reviewed tomorrow."*
2. `reviewLeadOpportunity` returns `{ status: 'deferred' }`.
3. `jobs/handlers.js` re-enqueues the job with `delaySeconds: 6 * 60 * 60` and a
   date-stamped dedupe key, so it retries tomorrow rather than into the same wall.
4. **The lead does not move.** It stays at `RULE_QUALIFIED` and is picked up on a
   later tick.

Nothing is lost and nothing is wrongly rejected.

A campaign ceiling being hit is quieter — `{ status: 'deferred', reason:
'campaign_ai_budget_exhausted' }` with a log line but no activity row.

### If Workers AI itself is exhausted

`env.AI.run` throws once the account's daily allocation is spent. That is an
ordinary branch, not an exception: the run is recorded `failed`, the lead moves to
**`HOLD`** with `AI_FAILED`, and it waits for a human. `HOLD` rather than
`NOT_QUALIFIED` because the deterministic rules already said the lead was worth
looking at, and the model's unavailability is not evidence against it.

### Managing it

- **Prioritization is automatic.** Priority-band leads get `lead_jobs.priority`
  10, so a 90-scoring lead is reviewed before a 61-scoring one when the budget is
  tight.
- **Raise the bar, not the budget.** If you are consistently hitting 60 reviews a
  day, raising `SCORE_THRESHOLDS.aiReview` from 60 to 70 reduces spend *and*
  improves the average quality of what the model sees.
- **Lower `max_candidates`** on the campaign to reduce upstream volume.
- Check `lead_ai_runs` for `status = 'invalid_output'`: those consumed budget and
  produced nothing. A cluster means the prompt or the model needs attention, not
  the budget.

## Logs

Structured JSON via `console.log`, read with `npx wrangler tail`. Every event is
prefixed `lead_engine.`.

Every background operation creates a logger bound to a `correlation_id`, so one
campaign run's lines can be filtered without grepping for a company name:

```bash
npx wrangler tail --format json | grep lead_engine
npx wrangler tail --format json | grep '"correlation_id":"<uuid>"'
```

Common events: `scheduled_tick`, `discovery_source_completed`,
`discovery_completed`, `crawl_started`, `crawl_finished`, `browser_run`,
`research_completed`, `ai_review_completed`, `ai_review_deferred`,
`ai_review_failed`, `outreach_draft_created`, `outreach_draft_blocked`,
`zoho_draft_created`, `zoho_draft_failed`, `mailbox_sync_completed`,
`mailbox_sync_failed`, `opt_out_detected`, `reply_analyzed`, `job_completed`,
`job_failed`, `job_batch_completed`, `queue_publish_failed`.

**Redaction happens in the logger**, not at each call site — because the call site
that forgets is exactly the one that leaks. Any key containing `token`, `secret`,
`password`, `authorization`, `auth`, `cookie`, `apikey`, `credential`,
`signature` or `session` is replaced with `[redacted]`. Payloads are bounded to
depth 4, 40 keys, 20 array items, 500 characters per string.

## Emergency stop

```
LEAD_ENGINE_ENABLED = "false"
```

in `wrangler.jsonc` `vars` (and `env.preview.vars`), then deploy.

Everything stops: the scheduled tick returns `{ status: 'disabled' }`
immediately, every service's `assertFlag` throws a 503 naming the var, and the
queue consumer (if it were ever bound) acks its batch without running anything.
Nothing is lost — `lead_jobs` keeps the outstanding work and it drains when the
flag comes back.

**Flags are read from `env`, not from D1**, on purpose: a flag is how an operator
stops the engine, and it must not depend on the database the engine is failing
against.

To stop one capability, turn off its own flag instead
(`LEAD_CRAWLER_ENABLED`, `LEAD_AI_ENABLED`, `LEAD_DISCOVERY_ENABLED`,
`ZOHO_MAIL_SYNC_ENABLED`, …). See [environment.md](environment.md).

**There is no flag that stops sending, because there is no sending to stop.**

## Manual SQL

Same conventions as the rest of the project (see
[`../operations.md`](../operations.md) and `docs/pickleball/runbook.md`):

```bash
# Local
npx wrangler d1 execute devlab-studios-cms --local --command "SELECT ..."
# Preview
npx wrangler d1 execute devlab-studios-cms-preview --remote --env preview --command "SELECT ..."
# Production — requires a fresh token, and preview first
npx wrangler d1 execute devlab-studios-cms --remote --command "SELECT ..."
```

Useful queries:

```sql
-- Where is everything?
SELECT stage, COUNT(*) FROM lead_leads GROUP BY stage ORDER BY 2 DESC;

-- Today's budgets
SELECT metric, used, limit_value, limit_reached_at FROM lead_usage_daily
 WHERE usage_date = date('now') AND campaign_id IS NULL;

-- Dead jobs
SELECT job_type, attempts, last_error FROM lead_jobs WHERE status = 'dead'
 ORDER BY updated_at DESC LIMIT 20;

-- AI spend and failures today
SELECT task, status, COUNT(*), SUM(neurons) FROM lead_ai_runs
 WHERE created_at >= date('now') GROUP BY task, status;

-- Mailbox health
SELECT folder, last_success_at, consecutive_failures, last_error FROM lead_sync_state;

-- Why was this lead blocked?
SELECT state, checks_json FROM lead_compliance_reviews WHERE lead_id = '<id>';
```
