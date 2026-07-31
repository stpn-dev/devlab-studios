# 3. Leads delivery: waitUntil + manual retry, not a Cloudflare Queue

**Status:** Accepted (Phase 5)

## Context

The original plan called for `POST /api/contact` → validate → Turnstile →
dedupe → persist to D1 → publish to a Cloudflare Queue → async delivery
to Zoho (and future automation targets) via a Queue consumer, with retry
on transient failure. Before building that, the actual constraint was
checked by inspecting `node_modules/@astrojs/cloudflare/dist/entrypoints/server.js`
directly rather than assuming: the adapter's generated Worker entrypoint
only exports `{ fetch: handle }`. There is no `queue()` or `scheduled()`
hook — Astro's Cloudflare integration has no supported way to also be a
Queue consumer in the same Worker. A genuine Queue-based design would
require a second, independently-deployed Worker just to consume it.

Presented to the user as an explicit tradeoff (not decided silently):
single-Worker `waitUntil` + manual retry vs. a second Worker for a real
Queue. **Single Worker, waitUntil + manual retry** was chosen.

## Decision

`POST /api/contact` persists every submission to the `leads` table
*before* attempting delivery — that write is synchronous and durable, so
a downstream Zoho outage can never lose a submission, only leave it in
`status: failed`. The Zoho delivery attempt itself runs via
`Astro.locals.cfContext.waitUntil()` (Astro 6.2+'s Cloudflare-forwarded
`ExecutionContext.waitUntil`, confirmed by reading
`@astrojs/cloudflare`'s `cf-helpers.js` source directly — not the
older/removed `locals.runtime.ctx` pattern some outdated examples use),
so the visitor's response doesn't wait on it. Every attempt — the
automatic first one and any manual admin retry from `/admin/leads` — is
recorded in `delivery_attempts`.

## Consequences

- No second Worker to deploy, version, or keep in sync with this one.
- Retry is manual (an admin clicks Retry) rather than automatic
  exponential backoff — acceptable at this site's lead volume; revisit if
  volume or failure rate ever makes manual retry impractical.
- `findRecentDuplicateLead` (same email + message within 5 minutes) does
  the job a Queue's own dedup/idempotency handling might otherwise do,
  implemented directly against D1 instead.
- Confirmed end-to-end by `tests/e2e/admin.spec.js`'s lead-reliability
  test: submit while `ZOHO_WEBHOOK_URL` points at an RFC 2606 `.invalid`
  address (guaranteed failure), then verify the lead still persisted with
  a recorded failed `delivery_attempts` row.
