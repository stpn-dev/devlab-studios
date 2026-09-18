# Cloudflare Workflows

Code: `src/lead-engine/workflows/index.ts`. Exported from `src/worker.ts`.
Binding configuration: **commented out** in `wrangler.jsonc`.

## Status: not bound, and not reachable

Five Workflow classes exist and are exported. **No Workflow binding is declared,
nothing creates a Workflow instance, and no code path reaches any of these
classes today.**

The engine does not need them. Work is dispatched through the `lead_jobs` table
in D1 and drained on the existing cron trigger. Workflows are an optional
durable-execution layer that the same handlers would run under.

## The five classes

Each is a sequence of `step.do()` calls around the **same handler functions** the
D1 job runner and the queue consumer use.

| Class | Steps |
|---|---|
| `CampaignDiscoveryWorkflow` | `discover-candidates` → `drain-research-batch` (bounded to 10) |
| `LeadResearchWorkflow` | `research-lead` → (if AI-routed) `ai-review` → (if qualified) `outreach-draft` |
| `MailboxSyncWorkflow` | `sync-mailbox` → `find-unanalyzed-replies` → one `analyze-reply-<id>` step per message |
| `ReplyAnalysisWorkflow` | `process-reply` |
| `MaintenanceWorkflow` | `maintenance` → `drain-backlog` (bounded to 25) |

Shared retry policy `EXTERNAL_RETRY`: 3 retries, 30-second exponential backoff,
5-minute step timeout. Beyond that the problem is not transient and a human
should see it on the failed-jobs screen rather than the Worker spending another
hour proving it.

## Why they are thin

No business logic lives in these classes. Every one of them calls
`runJob(env, {...})` from `src/lead-engine/jobs/handlers.js`, or a service
function directly.

Three reasons:

1. **Testability.** The logic stays testable in plain Node without a Workflows
   runtime. There is no Workflows test harness in this repository; if the logic
   lived in the classes it would be untested.
2. **Reachability.** The same logic stays runnable from the admin's "run now"
   button, from the cron drain, and from the queue consumer.
3. **Optionality.** The engine keeps working with no Workflows binding at all,
   which is the state this branch ships in.

Putting the logic in a Workflow class would make it testable only through
Workflows and unusable from anywhere else.

### Design decisions inside the thin layer

- **`CampaignDiscoveryWorkflow` does not research inline.** A campaign finding a
  hundred businesses would become a hundred sequential crawls inside one workflow
  instance, which exceeds sensible step durations and makes the whole run fail
  together. It enqueues, then drains a bounded batch so a *small* campaign still
  completes end to end without waiting for the next cron tick.
- **`LeadResearchWorkflow` uses one step per stage**, so a Workers AI failure does
  not re-crawl the site — the crawl step already completed and its result is in
  D1.
- **`MailboxSyncWorkflow` queries for replies rather than carrying them from the
  sync result**, so a sync that half-completed still gets its replies analysed.
  One `step.do()` per message, so a model failure on one reply does not discard
  the analysis of the others.
- **`toStepOutcome` narrows the return value** to five serializable fields
  (`ok`, `error`, `retryable`, `status`, `routesToAi`). `step.do()` requires a
  statically serializable return type, and only those two result fields are
  branched on by a later step. Workflow state is execution bookkeeping, not a
  second copy of the lead — everything else the handler produced is already in D1
  before the step returns.

**D1 remains authoritative.** A lost workflow instance costs a re-run, never a
lost lead.

## Why they are NOT bound

**A `workflows` binding naming a Workflow that has not been created fails
`wrangler deploy` for the entire Worker.**

On this account that Worker is the public site, the Admin CMS, the Lead CRM and
the pickleball application. So a binding for a lead-generation feature that is
switched off would take down the deploy of everything else.

This is the same reasoning as [queues.md](queues.md), and it is written in three
places so it cannot be lost: the comment block in `wrangler.jsonc`, the module
comment in `workflows/index.ts`, and the export comment in `src/worker.ts`.

**Exporting an unbound Workflow class is inert.** That is why the classes are
exported now: so enabling Workflows is a configuration change rather than a code
change on the *class* side.

> A Workflow class, like a Durable Object, has to be exported from the Worker's
> **entrypoint module** to be bindable. This repository already owns its
> entrypoint (`src/worker.ts`) because `@astrojs/cloudflare`'s generated one
> cannot export additional classes — see
> `docs/architecture/decisions/0006-pickleball-durable-objects.md`.

## Activation steps

### 1. Create the Workflows

Unlike Queues, Workflows do not need a separate `create` command — deploying a
Worker with a `workflows` binding registers the Workflow. But the deploy must
succeed, which means the binding and the exported class must both be present in
the same deploy.

### 2. Uncomment the block in `wrangler.jsonc`

```jsonc
"workflows": [
  { "name": "devlab-lead-campaign-discovery", "binding": "LEAD_CAMPAIGN_DISCOVERY_WORKFLOW", "class_name": "CampaignDiscoveryWorkflow" },
  { "name": "devlab-lead-research",           "binding": "LEAD_RESEARCH_WORKFLOW",           "class_name": "LeadResearchWorkflow" },
  { "name": "devlab-lead-mailbox-sync",       "binding": "LEAD_MAILBOX_SYNC_WORKFLOW",       "class_name": "MailboxSyncWorkflow" },
  { "name": "devlab-lead-reply-analysis",     "binding": "LEAD_REPLY_ANALYSIS_WORKFLOW",     "class_name": "ReplyAnalysisWorkflow" },
  { "name": "devlab-lead-maintenance",        "binding": "LEAD_MAINTENANCE_WORKFLOW",        "class_name": "MaintenanceWorkflow" }
],
```

The classes are already exported from `src/worker.ts`, so nothing changes there.

### 3. Mirror it into `env.preview`

**Nothing at the top level is inherited by an environment.** Every var and
binding preview needs must be repeated in `env.preview`. This has bitten this
repository before — `RESEND_FROM_EMAIL` and the `RATE_LIMITER` Durable Object
were both missed, and the second one meant every rate limiter on preview was
silently enforcing nothing.

Decide deliberately whether preview should have Workflows at all.

### 4. Deploy preview first

```bash
CLOUDFLARE_ENV=preview npm run build
npx wrangler deploy --env preview
```

Preview is the isolated environment. If the binding is wrong, it fails there, not
on the production site. Note the `CLOUDFLARE_ENV=preview` on the **build** —
`@astrojs/cloudflare` bakes bindings at build time. See
[`../deployment.md`](../deployment.md).

### 5. Verify

```bash
npx wrangler workflows list
npx wrangler workflows instances list devlab-lead-research
```

### 6. Then production

Merge to `main`; Workers Builds deploys it.

### 7. Write the dispatch code — **this step is not optional**

Here is the gap, stated plainly:

**Binding the Workflows is not sufficient. Nothing in this codebase creates a
Workflow instance.** There is no `env.LEAD_RESEARCH_WORKFLOW.create({...})` call
anywhere — not in `repositories/jobs.js`, not in `jobs/scheduler.js`, not in
`services/discovery.js`, not in any route.

Completing steps 1–6 gives you five bound-but-idle Workflows. Every job will
continue to run through the D1 ledger and the cron drain exactly as before.

What is missing:

- A dispatcher — most naturally alongside `enqueueJob` in
  `repositories/jobs.js`, or in `jobs/scheduler.js` — that checks for the binding
  and calls `.create({ params })` when present, falling back to the D1 ledger
  when absent. `queues/consumer.js` `publishJob()` is the shape to copy: it
  returns `false` when the binding is missing, and that return value is the
  caller's signal to leave the work to the runner.
- Writing the returned instance id to `lead_jobs.workflow_instance_id`. **That
  column exists and nothing ever writes it.**
- Deciding what a Workflow-dispatched job's `lead_jobs` row should look like, so
  the two substrates do not both claim it. `claimJobs` will happily hand a
  `pending` row to the cron runner while a Workflow instance is working on it.

Until that is written, the honest description is: **the Workflow classes are
prepared, correct-looking and unreachable.**

## Rollback

Re-comment the `workflows` block and redeploy. The D1 ledger has been the
authoritative record throughout, so nothing is lost and in-flight work drains on
the next cron tick.

Deleting a Workflow that still has a binding pointing at it will break the
deploy — re-comment the binding **first**, deploy, then delete.

## When it would actually be worth doing

Workflows buy durable execution: a `step.do()` that completed is not re-run when
a later step fails, and the instance survives a Worker eviction. That matters
most for steps making paid external calls that must not be repeated on retry —
`CampaignDiscoveryWorkflow` and `LeadResearchWorkflow`.

At Campaign 001's scale (100 candidates, 40 AI reviews, a daily cron) the D1
ledger with its lease-and-reclaim behaviour already covers the same failure mode
adequately. The case for Workflows gets stronger when a single run's work exceeds
what a few cron ticks can drain, or when Brave requests become expensive enough
that repeating one on a retry matters financially.
