# 0007 — Business inquiry pipeline

Date: 2026-09-17
Status: Accepted

## Context

The site previously had one four-field contact form writing one flat `leads`
row. Repositioning DevLab Studios as a business needed structured inquiries
(business, employment, collaboration, partnership, general), source
attribution, recorded consent, explainable routing, and an operator view that
makes a failed delivery visible instead of silent.

Several things had to be decided rather than assumed.

## Decisions

### 1. One pipeline, one endpoint, one schema

`/api/inquiries` is the single public entry point, and `inquiryType`
differentiates the rest. `/api/contact` and `/api/lead-magnet` normalize into
the same shape and call the same `submitInquiry()` service.

The alternative — a route per inquiry type — would have duplicated the
rate-limit, anti-spam, idempotency, persistence, consent, attribution and
delivery logic four times. The guarantee this whole feature exists for is
"an inquiry is never lost", and a guarantee implemented four times is a
guarantee that holds in three places.

`src/lib/schemas/inquiry.ts` is imported by the React form AND the endpoint,
so a field cannot drift between what the browser validates and what the server
accepts.

### 2. Persist before delivering, and decide the response on the write

The order in `submitInquiry()` is fixed:

```
rate limit → anti-spam → normalize → idempotency → PERSIST
→ consent + attribution → qualify → background delivery
```

The visitor sees success when the **database write** succeeded, never when the
email did. Delivery happens afterwards in `waitUntil()`. A Resend outage, a
webhook timeout, or an unset API key therefore leaves an inquiry visibly
undelivered and retryable — it can never lose one.

This also fixes what the analytics event means: `inquiry_persisted` fires only
on a server-confirmed write, so the conversion number counts inquiries that
actually exist.

### 3. Delivery status and pipeline status are separate columns

`leads.status` keeps its original meaning — did the notification go out
(`pending`/`delivered`/`failed`). Human workflow state lives in a new
`pipeline_status` column (`new`/`in_review`/…/`archived`).

They are genuinely different questions: a lead can be delivered and untouched,
or undelivered and already handled by phone. Conflating them would have meant
rebuilding a table holding real submitted leads just to widen a CHECK
constraint, which is not a risk worth taking for a rename.

### 4. Qualification is deterministic, explainable, and not AI

`src/lib/leads/qualification.ts` is a pure function. Every point it awards
carries a human-readable reason, stored with the inquiry and shown in the
admin, so a "priority" lead can always be explained.

AI may later summarize free text for a person to read. It must not decide
routing: routing is the thing that has to be testable, reviewable, and the
same every time. Anything ambiguous or under-specified routes to human review
rather than being auto-resolved.

Employment, collaboration, partnership and general inquiries are never
business-scored at all — scoring a job offer on "budget range" would be
meaningless.

### 5. Idempotency is server-computed

The key is `SHA-256(inquiryType, email, message, 10-minute bucket)`, computed
on the server and stored under a UNIQUE index.

A client-supplied key would let a caller either collide with someone else's
inquiry or bypass dedupe by rotating it. The time bucket means a genuine
follow-up an hour later is a new inquiry, while a double-click, an impatient
retry, or a replayed request is not. A concurrent duplicate loses the insert
race and is reported as a duplicate rather than as an error.

### 6. A provider boundary, with no new paid dependency

Every destination implements `{ name, isConfigured, send() }` and never
throws. Resend (notification + visitor confirmation) is the existing provider;
a generic outbound webhook (`LEAD_WEBHOOK_URL`) is the seam for a CRM, sheet,
n8n/Make workflow, or task system.

The webhook is completely inert unless configured, so this repository takes on
no third-party CRM dependency. Adding one later means adding one file, not
touching the pipeline.

Failures are classified `transient` / `permanent` / `configuration`, which is
what makes the admin's Retry button meaningful instead of a coin flip.

### 7. Attribution and consent are separate tables

They have different lifetimes. Attribution can be dropped for a privacy
request without deleting the inquiry. Consent is append-only evidence of what
a visitor was shown, recorded by VERSION, so changing the wording later never
rewrites what past visitors agreed to. Activity is an unbounded operational
timeline.

Nothing personal goes into activity metadata — only that a note was written,
never its text.

### 8. `/services` keeps its route, gains a "Solutions" label

The public IA needed "Solutions". Renaming the path would need a redirect and
would reset that page's accumulated search signals, for no gain a label change
does not already deliver. The route stays; the nav label, page copy, and SEO
metadata changed.

## Consequences

- One place to reason about, test, and break: `src/worker/inquiryService.js`.
- `/api/contact` remains a stable public contract (the Pickleball beta form
  still posts it) without keeping a second pipeline alive.
- The admin gains a real operational inbox: filters, ownership, notes,
  qualification reasons, attribution, consent, delivery attempts, retry, soft
  archive, and a formula-injection-safe CSV export.
- Local-dev note: any response that answers a request WITHOUT reading its body
  must call `drainRequestBody()`, or `wrangler dev --local`'s loopback proxy
  corrupts the next request on that connection. This bit the admin gate, the
  retry route, and the PATCH route's 404 path during development.
