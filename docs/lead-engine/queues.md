# Cloudflare Queues

Code: `src/lead-engine/queues/consumer.js`. Handler declared in `src/worker.ts`.
Binding configuration: **commented out** in `wrangler.jsonc`.

## Status: not bound, and unreachable

The `queue()` handler is declared on the Worker's default export and
`handleQueueBatch` is written and correct. **No queue is bound, so the handler is
never invoked** — and even once bound, nothing in this codebase publishes a
message to a queue (see "The producer gap" below).

The engine does not need queues. Work is dispatched through the `lead_jobs` table
in D1 and drained on the existing cron trigger.

## The four queues

| Queue | Job types | Producer binding |
|---|---|---|
| `devlab-lead-research` | `lead_research` | `LEAD_RESEARCH_QUEUE` |
| `devlab-lead-ai-review` | `ai_review`, `outreach_draft` | `LEAD_AI_REVIEW_QUEUE` |
| `devlab-lead-mailbox` | `reply_analysis`, `mailbox_sync` | `LEAD_MAILBOX_QUEUE` |
| `devlab-lead-dead-letter` | — | Dead-letter target for all three |

The mapping is `QUEUE_FOR_JOB_TYPE` in `queues/consumer.js`. `campaign_discovery`
and `maintenance` have no queue and would stay on the cron path.

Those seven are the complete set of job types. A unit test asserts the
`lead_jobs.job_type` `CHECK` list matches `JOB_HANDLERS` — a job type the
database accepts but nothing serves would be enqueued, claimed, and
dead-lettered with "no handler", silently losing the work. (Contact discovery is
deliberately *not* a job type: it runs inline inside `lead_research`, because
contactability feeds the score and splitting it out would mean scoring a lead
before knowing whether it can be contacted.)

## Consumer settings, and why concurrency is small

| Queue | `max_batch_size` | `max_concurrency` | `max_retries` |
|---|---:|---:|---:|
| `devlab-lead-research` | 5 | **2** | 3 |
| `devlab-lead-ai-review` | 3 | **1** | 3 |
| `devlab-lead-mailbox` | 5 | **1** | 3 |

All three dead-letter to `devlab-lead-dead-letter`.

**Research: concurrency 2.** Each message is a crawl of somebody else's website.
The per-domain delay lives inside the crawler (`CRAWLER.perDomainDelayMs`, 1s) and
applies within one crawl, not across them — so concurrency here is concurrency
across *different* sites. Two is enough to keep throughput reasonable without
turning a hundred-lead campaign into a burst of simultaneous outbound requests
from one IP range. It matches `CONCURRENCY.crawl`.

**AI review: concurrency 1.** These are calls against a daily neuron allocation.
Parallelism buys seconds while costing the ability to stop cleanly when the
allocation runs out: with concurrency 1, `consumeBudget` refusing means the next
message defers. With concurrency 4, three more calls are already in flight past
the budget check. It matches `CONCURRENCY.ai`.

**Mailbox: concurrency 1.** The Zoho API is metered, and two concurrent syncs of
the same folder would read the same window. It matches `CONCURRENCY.zoho`.

These are the same reasoning as `CONCURRENCY` in `config/defaults.js`: these are
I/O-bound calls against a daily allocation, and parallelism buys seconds while
costing control.

## Messages carry IDs, never documents

Every payload is `{ jobId, jobType, leadId, campaignId, correlationId }`, and the
handler re-reads everything else from D1.

A queue message containing page HTML or an email body would put content in a
transient system that D1 is supposed to own, and would blow the message size
limit on the first large page. `enqueueJob` enforces the same rule on the D1 side,
throwing if `payload_json` exceeds 4000 characters.

## Consumer behaviour

`handleQueueBatch(batch, env)` calls **the same `runJob`** the D1 runner and the
Workflows use, so the three substrates cannot drift.

`ack()` and `retry()` are explicit on every path. A message that is neither acked
nor retried is redelivered after the visibility timeout, which turns a silent bug
into duplicated work — survivable here, because import and lead creation are
idempotent, but not something to rely on.

| Situation | Action | Why |
|---|---|---|
| `LEAD_ENGINE_ENABLED` is off | **`ack()` the whole batch** | Retrying would redeliver every visibility timeout until someone turns the engine back on, and the work is re-enqueueable from D1 anyway |
| `jobId` present but the row is gone | `ack()` | Nothing to do |
| The job row is `succeeded` or `cancelled` | `ack()` | The row is authoritative; a job cancelled between enqueue and delivery must not run |
| No `jobId` | Synthesize a job from the message body | Lets a direct publish work without a ledger row |
| Success | `completeJob` if there is a row, then `ack()` | |
| Retryable failure | `failJob`, then **`retry()`** | Let the queue redeliver with its own backoff; the job row already carries the attempt count and error for the admin screen |
| Permanent failure | `failJob`, then **`ack()`** | The job row is now dead-lettered, which is where a human will see it. Redelivering would repeat the same permanent failure until the queue's own limit. |

Permanence is decided by `isPermanent()` in `jobs/handlers.js`:
`FeatureDisabledError`, `zoho_reauthorization_required`, `zoho_not_configured`,
an explicit `retryable: false`, or any 4xx other than 408/429.

## Why they are NOT bound

**A `queues.consumers` entry naming a queue that has not been created fails
`wrangler deploy` for the entire Worker.**

On this account that Worker is the public site, the Admin CMS, the Lead CRM and
the pickleball application. So a binding for a lead-generation feature that is
switched off would take down the deploy of everything else.

This is written in three places so it cannot be lost: the comment block in
`wrangler.jsonc`, the module comment in `queues/consumer.js`, and the `queue()`
handler comment in `src/worker.ts`.

The `queue()` handler is declared now so that enabling Queues is a configuration
change rather than a code change **on the consumer side**. Declaring a handler
for a queue that does not exist is inert.

## The D1 job-ledger fallback

This is what makes Queues genuinely optional rather than a soft requirement.

`lead_jobs` is the authoritative work ledger:

- `enqueueJob` writes a `pending` row with an optional `dedupe_key` (partial
  unique index over `pending` and `running` only, so re-enqueueing after a
  success is allowed — re-crawling a lead next week is legitimate work).
- `claimJobs` takes a bounded batch (`JOBS.batchSize` = 10) ordered by
  `priority DESC, run_after ASC`, claiming **one row at a time** with a
  conditional `UPDATE`. SQLite's `UPDATE` has no `LIMIT` without a compile option,
  and more importantly the per-row condition (`status = 'pending' OR lease
  expired`) is what makes two concurrent runners safe — a runner that loses a race
  simply gets fewer jobs.
- **Leasing, not delete-on-claim.** A Worker that dies mid-job leaves an expired
  `leased_until` (300s) that the next runner reclaims. Deleting on claim would
  lose the job entirely.
- `failJob` applies exponential backoff — `backoffBaseSeconds * 2^(attempts-1)`,
  capped at `backoffMaxSeconds` (60s base, 1h cap) — until `max_attempts` (3),
  then dead-letters. A permanent failure dead-letters immediately without burning
  the remaining attempts.
- `drainJobs` runs on every cron tick and is bounded, because a Worker invocation
  has a CPU budget and a runner draining an unbounded backlog would be killed
  partway through with jobs still marked `running`. The worst case is a batch that
  takes longer than expected, whose leases then expire and whose jobs the next
  tick reclaims.
- The admin can drain by hand: `POST /api/admin/lead-crm/jobs` with
  `{ action: 'drain', limit }` (max 25), or `{ action: 'retry', jobId }`.

Either substrate, D1 holds the authoritative record of what is outstanding, which
is what makes a half-finished run resumable rather than lost.

### Trade-off

The cron fires **once a day** (`0 22 * * *`). With `batchSize` 10, a campaign that
discovers 100 leads takes many days to drain unless someone presses **Drain now**
on the Activity screen. That is the real cost of not having queues, and it is the
main reason to turn them on.

## Activation steps

### 1. Create all four queues

```bash
npx wrangler queues create devlab-lead-research
npx wrangler queues create devlab-lead-ai-review
npx wrangler queues create devlab-lead-mailbox
npx wrangler queues create devlab-lead-dead-letter
```

The dead-letter queue must exist before the consumers referencing it are
deployed.

### 2. Confirm

```bash
npx wrangler queues list
```

All four must appear.

### 3. Uncomment the `queues` block in `wrangler.jsonc`

It is written out in full there — three producers, three consumers with the
settings tabulated above.

### 4. Mirror into `env.preview` if preview should have queues

**Nothing at the top level is inherited by an environment.** If you want queues on
preview, create four *separate* preview queues and repeat the block inside
`env.preview`. Sharing queues between environments would let a preview run
process production work.

### 5. Deploy preview first

```bash
CLOUDFLARE_ENV=preview npm run build
npx wrangler deploy --env preview
```

### 6. Then production

Merge to `main`; Workers Builds deploys it.

### 7. Write the producer — **this step is not optional**

Here is the gap, stated plainly:

**`publishJob()` is exported from `queues/consumer.js` and is never called.**
Nothing in `repositories/jobs.js`, `jobs/scheduler.js`, `jobs/handlers.js` or
`services/discovery.js` calls it. `enqueueJob` writes to D1 and returns.

So completing steps 1–6 gives you four queues, three bound producers, a live
consumer — and **nothing ever publishes a message**. Every job continues to drain
through the cron exactly as before.

What is missing is a call to `publishJob(env, job)` after `enqueueJob` succeeds.
`publishJob` is already written for this: it returns `false` when no binding
matches the job type, and if the queue refuses the message it logs
`queue_publish_failed` and returns `false` — the job stays `pending` in D1 and the
cron drain picks it up. That fallback is exactly what makes the binding optional.

Two complications to resolve when wiring it:

- `enqueueJob` takes a `db`, not an `env`, so it has no access to the queue
  bindings. The call site needs restructuring, or the publish needs to happen in
  the callers (`services/discovery.js`, `jobs/handlers.js`, `jobs/scheduler.js`).
- A published job is still `pending` in D1, so `claimJobs` on the next cron tick
  may hand it to the runner while the queue consumer is also working on it. The
  consumer's `getJob` check only skips `succeeded` and `cancelled` rows, not
  `running` ones. Either mark published jobs distinctly, or accept the duplicate
  — every handler is idempotent, so the cost is wasted work rather than wrong
  data, but it is wasted work against someone else's server.

Until that is written, the honest description is: **the consumer is prepared,
correct-looking and unreachable.**

## Rollback

Re-comment the `queues` block and redeploy. The D1 ledger has been authoritative
throughout, so nothing is lost. Drain any in-flight queue messages first, or
accept that they will be redelivered to a Worker with no consumer and eventually
expire — the corresponding `lead_jobs` rows stay `pending` and the cron picks them
up.
