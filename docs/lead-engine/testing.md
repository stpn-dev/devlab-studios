# Testing

## The numbers

**497 tests across 23 files** under `src/lead-engine/`, all passing. The whole
repository's suite is **1078 tests across 71 files**, so the lead engine is about
46% of it. Plus one Playwright spec, `tests/e2e/lead-crm.spec.js`.

Verify rather than trust this number — it moves:

```bash
npx vitest run src/lead-engine
```

> Counts you may see elsewhere: **365** was quoted early in development and
> **426** was accurate before `repositories.test.js`, `services.test.js` and the
> Lead CRM Playwright spec landed. Also note that `docs/testing.md` (the
> site-wide document, written during the Phase 6 CMS work) says *"There is no
> unit test suite — this project's test coverage is entirely Playwright
> end-to-end."* That statement predates the Insights digest, the pickleball app
> and this engine, and is out of date.

## Running them

```bash
# Everything
npm run test:unit

# The lead engine only
npx vitest run src/lead-engine

# One file
npx vitest run src/lead-engine/scoring/score.test.js

# Watch
npx vitest src/lead-engine
```

Plus the Playwright spec, which belongs to the `worker` project (it signs in,
calls `/api/admin/*` and exercises `/r/:token`, so it needs the `wrangler dev`
worker with its D1 binding rather than the preview server):

```bash
npx playwright test --project=worker tests/e2e/lead-crm.spec.js
```

Vitest, `environment: 'node'`, `include: ['src/**/*.test.js', 'src/**/*.test.ts']`
(`vitest.config.js`). Tests live **beside** the code they test. No network and no
Wrangler — the whole lead-engine suite runs in about 3 seconds, including the
database tests, which use an in-memory SQLite database rather than a real D1.

## Coverage by file

| File | Tests | Covers |
|---|---:|---|
| `repositories/repositories.test.js` | 45 | **Real SQLite.** Idempotency, constraints, the job lease/backoff cycle, atomic budgets, suppression |
| `zoho/zoho.test.js` | 45 | OAuth refresh + caching + redaction, `assertNoSendMode`, `createDraft`, list/content, thread matching, timestamp and address parsing, body extraction, quoted-history stripping |
| `ai/client.test.js` | 37 | `readText` across every response shape, `readUsage`, retry-once, schema parsing, the invention guard, unsupported-observation detection |
| `contacts/contacts.test.js` | 28 | Classification, exclusions, ranking, syntax, domain match, DoH MX (present / absent / NXDOMAIN / null MX / indeterminate) |
| `signals/extract.test.js` | 27 | Technology fingerprints, JSON-LD, mailto vs prose, forms, manual-workflow phrases, absence signals, campaign vocabulary |
| `services/services.test.js` | 26 | **Real SQLite + stubbed network/model.** The seams between modules: research end to end, AI review, the six-condition gate, the Zoho push, the dashboard |
| `domain/domains.test.js` | 23 | Canonical domain, multi-part TLDs, non-company hosts, URL canonicalization, same-site, name and email normalization |
| `compliance/evaluate.test.js` | 22 | All ten evaluators, the three-state machine, hard-boundary precedence, `isReadyForOutreachReview` |
| `scoring/score.test.js` | 21 | Weights, category totals, clamping, routing bands, label coverage, stage and priority mapping |
| `domain/pipeline.test.js` | 20 | Stage/`CHECK` parity, terminal sets, the compliance one-way door, `describeNextAction` |
| `compliance/optOut.test.js` | 20 | Every phrase kind, severity ordering, bare `STOP`, quoted-line stripping, the negation guard, the opt-out line |
| `discovery/overpass.test.js` | 20 | QL construction, escaping, bbox validation, element mapping, every failure reason |
| `crawler/crawlSite.test.js` | 19 | Link extraction and scoring, the four-page budget, robots refusal, homepage-failure semantics, client-render detection |
| `discovery/normalize.test.js` | 18 | Rejection reasons, field bounds, payload bounding, merge semantics, `sourceCount` |
| `tracking/tracking.test.js` | 18 | Token generation, destination allow-list, click recording, expiry/revocation, attribution window |
| `crawler/ssrf.test.js` | 17 | Every blocked range, IPv4-mapped IPv6, ports, credentials, redirect checking |
| `crawler/robots.test.js` | 15 | Group parsing, agent specificity, longest-match, Allow-wins-ties, wildcards, 5xx/unreachable fail-closed |
| `discovery/brave.test.js` | 15 | Unconfigured path, query building, budgets, every failure reason |
| `discovery/manualImport.test.js` | 15 | Quoted CSV fields, header aliases, BOM, line-number tracking, per-row errors, limits |
| `crawler/fetchPage.test.js` | 14 | Streaming byte ceiling, content-type refusal, manual redirect following, timeouts |
| `config/flags.test.js` | 13 | Truthiness, cascading gates, `assertFlag`, `FeatureDisabledError` |
| `jobs/handlers.test.js` | 10 | Handler dispatch, follow-on enqueueing, deferred re-enqueue, permanent-vs-retryable |
| `compliance/countryProfiles.test.js` | 9 | Profile construction, unknown-check throwing, the fallback profile |

### The parity tests worth knowing about

Several tests exist specifically to catch a mismatch between two places that must
agree:

- **Stages vs the `CHECK` constraint.** `pipeline.test.js` asserts `ALL_STAGES`
  matches `migrations/0012`. A stage the application believes in and the database
  rejects is a write that fails at 3am rather than in CI.
- **Weights vs labels.** `score.test.js` asserts every `SIGNAL_WEIGHTS` entry has
  a `SIGNAL_LABELS` entry, so a weight cannot exist without something readable to
  show for it.
- **Profile checks vs evaluators.** `countryProfiles.test.js` /
  `evaluate.test.js` assert every referenced check has an evaluator. A profile
  check with no evaluator would silently count as passing — the one outcome the
  compliance module must never produce by accident.
- **Job types vs handlers.** `handlers.test.js` asserts the `lead_jobs.job_type`
  `CHECK` list matches `JOB_HANDLERS`. A job type the database accepts but
  nothing serves would be enqueued, claimed, and dead-lettered with "no handler"
  — silently losing the work. (This test is why `contact_discovery` was removed
  from the `CHECK` constraint: it had no handler, because contact discovery runs
  inline inside `lead_research`.)

### The database tests are real SQLite, not mocks

`repositories/repositories.test.js` and `services/services.test.js` run against
an in-memory SQLite database via `src/worker/repositories/testSupport/d1Sqlite.js`
— a minimal D1-shaped wrapper over `node:sqlite`'s `DatabaseSync`, with the real
`migrations/0012` applied.

That matters because **the guarantees this engine relies on are implemented in
the schema**: the `UNIQUE` and partial indexes, the `CHECK` constraints, the
`ON DELETE CASCADE` behaviour, the `ON CONFLICT` clauses and the conditional
`UPDATE` in `consumeBudget`. A stubbed `prepare()` would exercise none of them.

It is also not theoretical: writing the service tests found a real crash in
`checkSuppression` (it called the non-null-safe `mapRow` on a missing row, so it
threw for every address that was **not** suppressed) that every unit test had
passed straight over.

### Testability by design

Several modules are structured to be testable without infrastructure, and it is
worth preserving that:

- `scoreLead` is **pure** — signals and configuration in, score and reasons out.
- `evaluateCompliance` is **pure** — the caller fetches the suppression result and
  the stored review and passes them in.
- `detectOptOut` is **pure** string matching.
- `matchMessageToConversation` takes its four lookups as **injected functions**.
- Every network-touching module accepts a `fetchImpl` override.
- `crawlSite` takes `onBudget` and `sleepImpl` callbacks, so the page budget
  reaches the crawl loop without the crawler knowing about D1, and tests do not
  wait a real second per page.
- Link extraction uses a regex rather than a DOM, partly so it runs in plain Node.
- Business logic lives in `jobs/handlers.js` rather than in Workflow classes or
  the queue consumer, so it is testable without either runtime.

## What is deliberately NOT covered

### No live external API calls — by design

**Nothing in the test suite talks to Overpass, Brave, Zoho, Cloudflare Browser
Rendering, Workers AI, or any real website.** Every one is a `fetchImpl` stub
returning a fixture.

This is a decision, not a gap. Tests that hit live services are slow, flaky,
cost money, and — in this system's case — would mean the CI pipeline crawling
strangers' websites and creating drafts in a real mailbox. A test suite that
emails people is not a test suite.

The consequence, stated plainly: **the tests prove the code handles the shapes we
believe those APIs return. They do not prove those are the shapes.** See the
"not verified against the live API" list in
[zoho-integration.md](zoho-integration.md).

### SQLite is not D1

The database tests run `node:sqlite`, not workerd's D1. They prove the SQL and
the constraints are right. They do not prove D1's own behaviour around
concurrency, `batch()` atomicity, `meta.changes` reporting or statement limits —
and `consumeBudget`'s whole guarantee rests on `meta.changes`.

Two runners genuinely racing for the same job or the same budget unit is
therefore still unverified; the test asserts the single-threaded semantics are
correct.

### Not every repository is covered

`repositories.test.js` covers companies, campaigns, leads, activity,
suppression, usage, jobs, contacts, scores, conversations and drafts. Not
covered: `sources.js`, `research.js`, `aiRuns.js`, `compliance.js`,
`settings.js`, `syncState.js`, `tracking.js` (the pure parts of the last one are
covered by `tracking/tracking.test.js`).

So the source-registry gate (`assertSourceUsable`), the settings deep-merge over
stored rows, and `recordComplianceEvaluation`'s "do not overwrite a human
decision" rule are unverified.

### Not every service is covered

`services.test.js` covers `research`, `aiReview`, `outreach` (including the
six-condition gate), `zohoDraft` and `dashboard`. **Not covered:
`mailboxSync.js`, `replyCopilot.js` and `discovery.js`.**

That is a meaningful gap. `mailboxSync` owns the only path that moves a lead to
`CONTACTED`, the opt-out-to-suppression flow, and the cursor advance — all
verified only by reading it and by the unit tests of the pieces it calls
(`detectOptOut`, `matchMessageToConversation`, `normalizeZohoMessage`).

### No API route tests

The ~25 routes under `src/pages/api/admin/lead-crm/` have no unit tests, and the
zod schemas in `schemas/index.ts` are exercised only indirectly. The Playwright
spec verifies that every one of them is **behind the admin gate**, which is the
property that matters most, but not what they do once past it.

### Admin UI coverage is thin

`tests/e2e/lead-crm.spec.js` (`worker` project) covers the properties that are
properties of the *deployed application* rather than of a module:

1. Every Lead CRM API is actually behind the admin gate — the routes do not check
   auth individually, they rely on the blanket middleware, so the only honest
   verification is an unauthenticated HTTP call.
2. `/r/:token` never leaves the allow-listed host and never errors, including
   with the engine switched off.
3. `/crawler` is reachable and states the user agent the crawler actually sends.
4. The CRM screens render inside the existing admin shell.

It runs against an **inert** system (every flag off), which is exactly the state
a deploy of this branch produces. So the review queue, the draft editor, the
regeneration buttons and the Zoho actions — the screens where a human decides to
contact a stranger — are still unexercised.

### No Workflows or Queues tests

`workflows/index.ts` and `queues/consumer.js` have no tests. Both are thin
wrappers over `runJob`, which is tested — but nothing verifies the ack/retry
decision matrix or the `step.do()` sequencing.

(Both are also unreachable today. See [queues.md](queues.md) and
[cloudflare-workflows.md](cloudflare-workflows.md).)

### No prompt-quality evaluation

The tests verify that model output is **parsed and validated** correctly. Nothing
evaluates whether the prompts produce *good* opportunity assessments or *good*
emails. There is no eval harness, no golden set, no regression corpus.

That judgement is the human review step, and it is the main thing the dry run
exists to exercise.

## What must be verified by hand

Ordered as you would actually do it. This list is the reason
[dry-run.md](dry-run.md) exists.

### Before the first dry run
1. Migration 0012 applies cleanly to preview, then production.
2. The seed script's SQL applies and is re-runnable (`INSERT OR IGNORE`).
3. `/admin/lead-crm` loads with every flag off and shows an explicit disabled
   state rather than silently doing nothing.
4. `/crawler` renders and states the user agent that `CRAWLER.userAgent` actually
   sends.

### Discovery
5. Overpass returns results for the configured bboxes, and the identifying
   User-Agent is accepted.
6. The yield is plausible — how many OSM entries in these metros actually have a
   `website` tag?
7. Rejection counts (`no_website`, `non_company_host`, `unparseable_website`)
   are proportionate.
8. Deduplication is correct: no obvious duplicates admitted, no two distinct
   businesses merged.
9. A dry run really does enqueue no crawls.

### Crawling
10. Real sites respond as expected; the 10s timeout and 1.5MB ceiling are not
    routinely hit.
11. robots.txt is parsed correctly against real files, and a `Disallow` is
    honoured.
12. Link scoring actually reaches contact pages on real sites.
13. Browser Run triggers only on genuinely client-rendered sites, and the REST
    call works with the configured token.

### Extraction and scoring
14. Signals match what the pages actually say — the single most important manual
    check.
15. Technology fingerprints do not false-positive on real markup.
16. Scores rank leads the way a person would.
17. The thresholds (40/60/75) land in the right place for this vertical.

### Workers AI
18. The model returns parseable JSON at an acceptable rate.
19. Opportunity assessments are specific rather than generic, and
    `observed_problem` really is an observation.
20. Drafts do not trip the invention guard, and read like something you would
    sign.
21. Neuron consumption on Cloudflare's dashboard is in the expected range.

### Contacts and compliance
22. Discovered addresses are real and the provenance URL genuinely shows them.
23. MX lookups over DoH work from the Worker runtime.
24. The US profile blocks correctly with `business.identity` empty, and passes
    once filled.
25. A test address added to suppression is blocked at all three call sites.

### Zoho — highest risk
26. The OAuth refresh works from the deployed Worker.
27. `createDraft` produces a draft in the real Drafts folder with the right
    from/to/subject/body.
28. The draft is a **draft** — confirm in the Zoho UI that nothing was sent.
29. `listMessages` with `folderName` actually returns Inbox and Sent.
30. `getMessageContent` returns a body for a matched message.
31. Sending the draft by hand moves the lead to `CONTACTED` on the next sync.
32. A reply is imported and matched to the right lead.
33. Replying `STOP` suppresses the address and moves the lead to `UNSUBSCRIBED`.

### Operations
34. The cron tick runs and drains jobs.
35. Budgets stop work at their limits and the dashboard shows it.
36. A dead-lettered job can be retried from the admin.
37. `wrangler tail` shows structured lines with no leaked credentials.

## If you add tests

The highest-value remaining additions, in order. Extend
`services/services.test.js` and `repositories/repositories.test.js` — the
SQLite harness (`src/worker/repositories/testSupport/d1Sqlite.js`) already does
the hard part.

1. **`mailboxSync.js` service tests.** It owns the only path to `CONTACTED`, the
   opt-out-to-suppression flow, and the cursor advance, and it is the single
   largest untested service. Stub `fetchImpl` with Zoho-shaped fixtures.
2. **`replyCopilot.js` service tests** — particularly that
   `processInboundReply` stops on `needs_human_attention`, and that an
   AI-suggested compliance-terminal stage is refused.
3. **`discovery.js` service tests** — the source-registry gate, duplicate
   budget release, and the dedupe-before-crawl ordering.
4. **The remaining repositories** — `sources.js` (the registry gate),
   `settings.js` (the deep merge) and `compliance.js` (do not overwrite a human
   decision).
5. **An authenticated Playwright pass over the review queue.** The current spec
   runs against an inert system; the screens where a human decides to contact a
   stranger are still unexercised. Follow `docs/testing.md`'s patterns
   (`toPass()` rather than `networkidle`, fill-inside-the-retry-block).
6. **A small prompt eval harness** — a dozen fixture leads with expected
   qualification outcomes, run manually when a prompt version changes.

## Pre-push baseline

Per [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md):

```bash
npm run typecheck
npm run build
npx playwright test --project=static
```

For any change under `src/lead-engine/`, add:

```bash
npm run test:unit
npx playwright test --project=worker tests/e2e/lead-crm.spec.js
```
