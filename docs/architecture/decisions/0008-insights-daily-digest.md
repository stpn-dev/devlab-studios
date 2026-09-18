# 8. Insights daily digest: a cron in our own Worker entrypoint

**Status:** Accepted (Phase 9)

Relates to [0003](./0003-leads-delivery-waituntil.md) (which recorded that
`scheduled()` was unavailable) and [0006](./0006-pickleball-durable-objects.md)
(which is why it now is).

## Context

The Insights section held only hand-written long-form articles, so it changed
whenever someone wrote something — which is to say, rarely. The goal was a
reason to return: a short daily pass over AI automation and AI advancement
news, capped at ten items, kept for a week, and removed automatically.

Three constraints shaped it:

1. **A hard budget.** The Workers Paid plan at $5/month, and nothing above it.
   That rules out a paid summarization API and rules out a second Worker with
   its own request allocation.
2. **No invented content.** The site's whole position is that it does not claim
   things it cannot evidence, so the digest may not manufacture facts, and the
   summaries must come from what the publisher actually wrote.
3. **No thin-content farm.** Google's "scaled content abuse" policy targets
   exactly this shape of output — many generated pages, little added value.

ADR 0003 recorded that `scheduled()` was unavailable because
`@astrojs/cloudflare`'s generated entrypoint exports only `{ fetch }`. That
constraint no longer holds: ADR 0006 replaced the generated entrypoint with
`src/worker.ts` so the Durable Object classes could be exported. A `scheduled()`
export beside `fetch` costs nothing extra.

## Decision

**One cron in this Worker, not a second Worker.** `src/worker.ts` exports
`scheduled()` alongside `fetch`. The cron is declared in `wrangler.jsonc` and
again in `env.preview` — nothing at the top level is inherited by an
environment, a lesson already paid for once with `RATE_LIMITER`.

**22:00 UTC, which is 06:00 where this is operated.** The first schedule was
06:00 UTC, chosen for the US news cycle and without noticing that this is 2pm
in Manila. An edition that lands mid-afternoon is not a daily digest anyone
reads with their coffee. Preview runs half an hour later.

**Workers AI for the summaries.** `@cf/meta/llama-3.1-8b-instruct-fp8` through
the `AI` binding — the id that actually appears in this account's
`wrangler ai models list`. Ten short summaries a day sits far inside the included daily
allocation, and the binding costs nothing to hold. The model is told to
summarize only what the supplied headline and excerpt state, and feed text is
fenced between explicit markers with an instruction that everything inside is
quoted third-party data — a headline is attacker-influenced input, and anyone
who can get a post onto a syndicated feed can attempt a prompt injection.

**Server-owned feed registry.** `src/worker/digest/feeds.js`, like
`src/config/offers.js`. The run only ever fetches URLs from that list — never
one from a request, a CMS field, or a feed's own contents. That is what keeps
the digest from becoming an SSRF surface.

**Separate tables from `articles`.** The retention sweep is a `DELETE` with a
date predicate. Sharing a table with real editorial content would make one bad
`WHERE` clause catastrophic; separate tables make it impossible rather than
merely unlikely.

**One permanent page with dated sections,** at `/insights/daily`, with
`#YYYY-MM-DD` anchors — not one indexable page per day. Each edition is a
handful of summarized links, so a page per day would be precisely the thin
generated page the scaled-content-abuse policy describes. Only titles, links and
our own one-sentence summaries are stored; no source body text is reproduced.

**Every stage degrades rather than aborts.** A dead feed costs that feed. An
exhausted AI allocation costs the summaries, and the items still publish as
titles and links. A run that finds nothing new leaves yesterday's edition up
rather than replacing it with an empty section. The one stage that is not
best-effort is the retention sweep, which runs even when nothing published — so
a week of failed runs still leaves the table bounded.

## Consequences

- No second Worker to deploy, version, or keep in sync.
- The cron is invisible in local `astro dev`; `wrangler dev` exposes it at
  `/cdn-cgi/handler/scheduled`, and the admin's "Generate now" runs the same
  function on demand.
- **Workers AI does not run in local dev** — a local call fails with `Binding AI
  needs to be run remotely` unless the binding is marked `remote: true`, which
  spends real neurons. So a local run exercises everything except the summaries,
  and lands on the same degraded path as an exhausted allocation. Verified by
  running the scheduled handler locally: three feeds parsed, nine items
  published, `model: null`. Tests never call the model for real: the unit suite
  stubs the feed fetch and passes a fake `AI`, and the e2e suite deliberately
  does not exercise "Generate now", because asserting on its output would be
  asserting on four third parties' uptime.
- That same local run found two defects the unit tests could not. A 256KB
  response cap was truncating Cloudflare's ~350KB feed, and a truncated XML
  document parses as nothing — so that feed reported success and contributed
  zero items (Hugging Face's, at ~254KB, was one commit away from the same
  fate). An oversized body is now skipped and logged rather than truncated, and
  the bound is 2MB. And the dedupe window included the day being generated, so
  a second run on the same day replaced a full edition with whatever was left
  over — "Generate now" pressed twice. The run now excludes its own date.
  Both have regression tests; both were confirmed fixed by re-running against
  the live feeds (16 candidates, all four sources, 10 items, twice in a row).
- The first production run published ten items with no summaries and reported
  "AI unavailable at run time". The AI had not been unavailable: the model
  answered in the OpenAI chat-completions shape (`choices[0].message.content`)
  and the reader only understood `{ response }`, so every summary was discarded
  after being paid for. `readText` now handles both shapes, `summarizeItem`
  distinguishes "threw" from "answered unreadably", and the admin no longer
  asserts a cause it cannot know. The wrong label cost more than the bug.
- Preview runs its own cron half an hour later and keeps its own editions. The
  content mirror does not copy digests: production's editions would arrive in
  preview already close to the age its own sweep deletes at.
- Adding a feed means checking it actually publishes on AI automation or AI
  advancement. The registry is code, so that check happens in review.
