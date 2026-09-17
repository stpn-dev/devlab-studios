# Insights daily digest — design

Date: 2026-09-17
Status: Approved for planning

## Goal

Publish a daily, automatically-generated digest of AI-automation and AI-advancement
news in the Insights area: up to 10 items per day, sourced from free RSS feeds,
summarized with Cloudflare Workers AI, retained for 7 days and then removed so the
database does not grow without bound.

## Research that shaped the shape

Every company running both long-form editorial and high-frequency updates keeps them
on separate surfaces — Vercel `/blog` vs `/changelog`, AWS Blog vs "What's New",
GitHub, Stripe and Linear likewise. None interleave the two in one feed. Cloudflare's
blog is a single feed precisely because everything it publishes is long-form.

Vercel's changelog supplies the entry format: date headings, 1–2 sentence entries,
scannable, no hero treatment. TLDR AI supplies the curation format for third-party
news: "a few sentences each, with links to the source."

## Two decisions that are load-bearing

### One permanent page, not a page per day

The digest lives at **`/insights/daily`** — a single permanent URL with a dated
section per day, showing the last 7 days. Retention means the oldest section rolls
off the page.

The rejected alternative was one published post per day at `/insights/digest/[date]`.
With 7-day retention that creates and destroys ~7 URLs a week, every one of which
gets crawled and then 404s.

This also resolves the indexing question rather than dodging it. Google's spam policy
targets *"many pages generated for the primary purpose of manipulating search
rankings"* and *"scraping feeds… to generate many pages… where little value is
provided."* One genuinely-updated page carrying original summaries and outbound
attribution is not that, so `/insights/daily` stays **indexable** — no `noindex`
compromise is needed, because the design does not create the risk.

### The digest is a separate content type from articles

New tables, not rows in `articles`. Articles are evergreen, hand-written, indexed and
permanent; digest content is ephemeral and generated. Sharing a table would mean every
existing article query needs a new filter, and — the part that actually matters — a
retention job with a date predicate would be one bad `WHERE` clause away from deleting
real editorial content. Separate tables make that impossible by construction.

## Platform constraints (Workers **Paid**, $5/month)

The account moves to Workers Paid for this feature, with a hard budget of $5/month.

| Limit | Included in $5 | This feature uses | Overage |
|---|---|---|---|
| Worker requests | 10,000,000 / month | ~30 (one cron/day) | $0.30 / million |
| CPU time | 30,000,000 ms / month | ~15,000 ms / month | $0.02 / million ms |
| CPU per cron invocation | 30 s | well under | — |
| Subrequests per invocation | 10,000 | ~14 (4 feeds + ≤10 AI calls) | — |
| Wall clock per cron | 15 min | seconds | — |
| Workers AI | 10,000 neurons / **day** | ≤10 short summaries / day | $0.011 / 1,000 |
| Durable Objects | 1M req, 400,000 GB-s / month | unchanged by this feature | — |

The digest cannot plausibly breach the budget: it is ~30 requests and a few CPU-seconds
per month against allowances measured in millions, and its AI usage sits inside the
free *daily* neuron allocation that applies on Paid as well as Free.

Two things unrelated to this feature could: traffic beyond 10M requests/month, and
**Cloudflare Images**, which is billed separately from Workers (first 5,000
transformations/month free, then $0.50/1,000). Because media lives in R2 rather than
Images storage, only transformation charges apply — no storage or delivery fees.
Setting `limits.cpu_ms` in `wrangler.jsonc` is a cheap guard against a runaway
invocation, since Cloudflare exposes no hard monthly spend cap.

Network I/O does not consume CPU time, so feed fetches and AI calls are effectively
free against the CPU allowance.

Workers AI *hard-fails* when the daily allocation is exhausted rather than degrading,
so "AI unavailable" is a normal branch, not an exception.

## Data model

Migration `0011_insights_digest.sql`:

- **`digests`** — one row per day. `id`, `digest_date` (UNIQUE), `status`,
  `item_count`, `generated_at`, `model`, `created_at`, `updated_at`.
- **`digest_items`** — `id`, `digest_id` (FK `ON DELETE CASCADE`), `source_name`,
  `source_url`, `title`, `summary`, `published_at`, `sort_order`.

`digest_date` UNIQUE makes a re-run idempotent: a second invocation on the same day
updates rather than duplicates.

## Ingestion

`src/worker/digest/feeds.js` is a **server-owned registry**, the same pattern as
`src/config/offers.js`: a fixed list of `{ name, url, homepage }`. The cron only ever
fetches from this list — never a URL from a request, a CMS field, or a feed's own
contents. Start with ~4 AI/automation feeds.

`src/worker/digest/fetchFeed.js`:

- Bounded `fetch` — 8 s timeout, response truncated at ~256 KB. RSS lists newest
  items first, so truncation only discards items we would not have used. The cap is
  defensive against a malformed or hostile response, not a CPU concession.
- Parse with `fast-xml-parser` (pure JS, no DOM). The 30 s CPU allowance on Paid makes
  a real parser affordable, and it handles CDATA, namespaces and HTML entities that
  hand-rolled extraction gets wrong.
- Each feed's failure is isolated. One bad source must not end the run.

Dedupe by `source_url` against the last 7 days of `digest_items`, so an item that ran
yesterday does not reappear.

## Summarization

Workers AI binding `AI`, small instruct model (e.g. `@cf/meta/llama-3.1-8b-instruct`).

The prompt is constrained to summarize **only** from the supplied title and excerpt:
1–2 sentences, no invented specifics, no opinion, no marketing language.

Two rules that are not negotiable:

- **Store title + link + our own short summary only.** Never source body text.
  Summarizing and linking is what aggregators do; reproducing substantial source text
  is copyright infringement.
- **Feed content is untrusted input.** A hostile headline is a prompt-injection
  vector, so feed-derived text is delimited and the system prompt states that content
  inside the delimiters is data, never instructions.

Degradation: if the AI call fails or the allocation is exhausted, the item is stored
with an empty summary and rendered as title + source link. The digest still publishes.

## Scheduling

One cron in `wrangler.jsonc` **and in `env.preview`** — nothing at the top level is
inherited by an environment, a lesson already paid for once with `RATE_LIMITER`.

`src/worker.ts` gains a `scheduled()` export beside the existing Durable Object
exports. This is newly possible: ADR 0003 rejected queue-based work because the
*generated* Astro entrypoint could not export extra handlers, but `src/worker.ts` has
been a custom entrypoint since the DO work.

The run is a single pass in one daily invocation: fetch → dedupe → summarize →
publish → sweep retention. An earlier draft staged candidates through an inbox table
so the work could be split across staggered crons under a 10 ms CPU budget; the Paid
allowance removes that need, and with it a table, a sweep and a cross-stage handoff.

Retention runs in the same invocation:
`DELETE FROM digests WHERE digest_date < date('now','-7 days')` — items cascade.

**Zero items after fetch and dedupe publishes nothing.** An empty daily post is worse
than no post.

## Public surface

- **`/insights`** — minimal change. The hero, content-type filter and article cards
  stay exactly as they are. One clearly-labelled "AI & Automation Daily" module shows
  the latest few items and links onward. Your authored articles remain the star.
- **`/insights/daily`** — dated sections for the last 7 days, each listing its items
  as title → source link → summary, with the source name always visible. Labelled
  plainly as an automated daily digest. Anchor per day (`#2026-09-17`) so a specific
  day is still shareable without its own URL.
- Listed in `sitemap.xml` as a single URL. No `Article` structured data — it is a
  collection of links, not an authored article.

## Admin

A "Daily Digests" list in the Insights area: date, item count, status, and one-click
unpublish/delete per day (the approval model chosen is auto-publish with easy
removal). A "Generate now" action calls the same entry point so the pipeline can be
exercised without waiting for the cron.

## Testing

Unit:

- Extraction against saved RSS and Atom fixtures, including a truncated response and
  a malformed feed.
- Dedupe across the trailing 7 days of published items.
- Item cap at 10; per-feed cap.
- Retention boundary — exactly 7 days old is kept, 8 is deleted.
- AI-failure path still produces a publishable digest with empty summaries.
- Prompt construction: feed-supplied text cannot escape its delimiters.
- Zero-items run publishes nothing.

E2E:

- `/insights/daily` renders dated sections with source attribution on every item.
- `/insights` shows the digest module and links to it.
- Sitemap contains `/insights/daily` exactly once and no per-day URLs.
- Admin can unpublish a day, and it disappears from the public page.

## Rollout

1. Apply `0011` to preview, then production. Additive; ships empty.
2. Upgrade the account to Workers Paid before enabling the cron.
3. Deploy with the cron defined and the feed registry short (1–2 feeds); confirm a run
   completes and check observed CPU and neuron usage against the budget table above.
4. Expand to the full feed list.
5. Watch the first week, then decide whether 7 days is the right retention.

## Deliberately not in scope

- Newsletter/email delivery of the digest.
- Per-item commentary or "our take" — it is the part most likely to overreach, and the
  site's credibility position depends on not doing that casually.
- User-submitted or CMS-editable feed URLs. The registry stays server-owned.
