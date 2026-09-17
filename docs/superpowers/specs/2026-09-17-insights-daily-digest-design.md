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

## Platform constraints (Workers **Free**)

| Limit | Value | Consequence |
|---|---|---|
| CPU per cron invocation | 10 ms | No DOM/XML parser. Extraction must be bounded regex. |
| Subrequests per invocation | 50 | ~14 needed (4 feeds + ≤10 AI calls). Fine. |
| Cron triggers per account | 5 | Currently 0 used. Room to split stages if needed. |
| Wall clock per cron | 15 min | Ample; AI calls are I/O, not CPU. |
| Workers AI | 10,000 neurons/day, resets 00:00 UTC | ≤10 small-model summaries/day is far below it. |

Network I/O does not consume CPU time, so feed fetches and AI calls are effectively
free against the binding constraint. **CPU is spent only on extraction and
serialization**, which is what the design below minimizes.

Workers AI *hard-fails* when the daily allocation is exhausted; on the Free plan there
is no overage. "AI unavailable" is therefore a normal branch, not an exception.

## Data model

Migration `0011_insights_digest.sql`:

- **`digest_inbox`** — raw candidates. `id`, `source_name`, `source_url` (UNIQUE),
  `title`, `excerpt`, `published_at`, `fetched_at`. Staging between stages, and
  resilience: a feed that fails today leaves yesterday's candidates queued.
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
  items first, so truncation only discards items we would not have used.
- **Targeted extraction, not parsing.** Regex over `<item>`/`<entry>` blocks pulling
  title, link and date. This is the CPU concession to the Free plan; because the feed
  list is controlled, each feed is validated once when added rather than defended
  against generically.
- Each feed's failure is isolated. One bad source must not end the run.

Dedupe by `source_url` against `digest_inbox` and against the last 7 days of
`digest_items`, so an item that ran yesterday does not reappear.

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

The run is two named stages behind one entry point — `ingest` then `assemble`. Today
both execute in a single daily invocation. If measurement shows the 10 ms CPU budget
is exceeded, they split across two staggered crons with no redesign, because the
staging table already separates them.

`assemble` also performs retention in the same invocation:
`DELETE FROM digests WHERE digest_date < date('now','-7 days')` — items cascade — plus
an `digest_inbox` sweep.

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
- Dedupe across `digest_inbox` and the trailing 7 days.
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
2. Deploy with the cron defined but the feed registry short (1–2 feeds) and measure
   actual CPU per run against the 10 ms budget.
3. Expand to the full feed list if headroom allows; otherwise split `ingest` and
   `assemble` across two staggered crons.
4. Watch the first week, then decide whether 7 days is the right retention.

## Deliberately not in scope

- Newsletter/email delivery of the digest.
- Per-item commentary or "our take" — it is the part most likely to overreach, and the
  site's credibility position depends on not doing that casually.
- User-submitted or CMS-editable feed URLs. The registry stays server-owned.
