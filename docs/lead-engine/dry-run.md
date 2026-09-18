# Dry run — Discovery Campaign 001

The first production-like exercise of the Lead Intelligence Engine.

**The first run STOPS at `READY_TO_CONTACT`. No email is sent. No Zoho draft is
even required.** The point is to look at what the engine produced — business
quality, domain correctness, duplicate handling, crawler accuracy, signal
accuracy, score quality, AI opportunity quality, contact provenance and CRM UX —
*before* anyone is contacted.

If at the end of this procedure you have not sent a single email, the dry run
succeeded.

## The campaign

Seeded by `scripts/lead-engine/seed.mjs` as a **draft with its schedule
disarmed**. Activating it and arming the schedule are separate, deliberate acts.

| Field | Value |
|---|---|
| Name | `US Property Management — Dry Run` |
| Slug | `us-property-management-dry-run` |
| Status | `draft` |
| `schedule_enabled` | `0` |
| Country | `US` |
| `max_candidates` | 100 |
| `max_ai_reviews` | 40 |

### Configuration (`config_json`)

Property-management vocabulary lives **here**, in campaign configuration, and
nowhere in the engine's source. That is the whole point of the column: the engine
is vertical-agnostic and this row is what makes one run about property management.

| Key | Contents |
|---|---|
| `industryLabel` | `Property management` |
| `targetIndustries` | property management, property manager, rental management, hoa management, community association management, residential property management |
| `serviceTerms` | tenant screening, rent collection, maintenance coordination, lease renewal, property marketing, eviction, inspection, owner statement, hoa management, vendor management, move-in, move-out |
| `disqualifyingKeywords` | we buy houses, cash for your home, mortgage broker, title insurance, real estate school, property management software, property management platform, franchise opportunity |
| `metros` | Austin, Dallas, Tampa, Phoenix, Charlotte |

`overpass.areas` — five bounding boxes `[south, west, north, east]`, deliberately
tight (city proper plus immediate metro). A loose box returns a state's worth of
results and spends the candidate budget on businesses nowhere near the metro.

| Metro | bbox |
|---|---|
| Austin, TX | `30.1, -97.94, 30.52, -97.56` |
| Dallas, TX | `32.62, -96.99, 32.99, -96.6` |
| Tampa, FL | `27.86, -82.58, 28.08, -82.34` |
| Phoenix, AZ | `33.29, -112.32, 33.71, -111.92` |
| Charlotte, NC | `35.1, -80.95, 35.39, -80.68` |

`overpass.tags` — `office=estate_agent`, `office=property_management`,
`shop=estate_agent`. `office=estate_agent` is the broadest and catches most of
them; the other two are less consistently applied but cost nothing in the same
query.

`brave.queries` — five, one per metro, US, 20 results each. **Only used if a
Brave key is configured.**

## Phase 0 — prerequisites

Work through [deployment.md](deployment.md) steps 1–5 first. Confirm:

- [ ] Migration 0012 applied (22 `lead_*` tables).
- [ ] Seed applied (3 sources, 1 campaign, 1 settings row).
- [ ] `LEAD_ENGINE_ENABLED = "true"`. Everything else still `"false"`.
- [ ] `/admin/lead-crm` loads; the dashboard shows zeros.
- [ ] `/crawler` renders and quotes the same user agent `CRAWLER.userAgent` sends.

**Do this on preview first if you can.** Preview shares the real internet, so a
crawl from preview is just as real to the site being crawled — but a mistake there
does not touch production data.

## Phase 1 — enable, in this order

### 1.1 Review the source policies

`/admin/lead-crm/sources`. Read the terms. Record what you found in
`policy_notes`. Set `policy_status`. Then enable.

For this run, at minimum:

| Source | `enabled` | `automation_allowed` | `crawl_allowed` | `policy_status` |
|---|---|---|---|---|
| `osm-overpass` | 1 | 1 | 0 | `approved` |
| `manual-import` | 1 | 1 | 0 | `approved` |
| `brave-search` | leave 0 unless you have a key and have read the terms | | | |

`crawl_allowed` is about crawling **the source itself**, not the businesses it
returns. The business-website crawl is governed by robots.txt and
`LEAD_CRAWLER_ENABLED`, not by this column.

The seeded `policy_notes` tell you what to check — the Overpass API usage policy,
the Brave plan terms, and the provenance of any list you import. They are a
starting point, not the review.

### 1.2 Fill in the business identity

`/admin/lead-crm/settings` → `business.identity`. Every field.

Skipping this is *survivable* — every US lead will stop at `needs_human_review`
with the exact missing fields named, which is itself worth seeing once. But you
cannot generate a usable draft, so fill it in before phase 4.

### 1.3 Turn on discovery

Set `LEAD_DISCOVERY_ENABLED = "true"` in `wrangler.jsonc` (and
`env.preview.vars`), commit, deploy.

### 1.4 Activate the campaign

`/admin/lead-crm/campaigns` → `draft` → `active`.

**Leave `schedule_enabled` at 0.** Nothing should run on its own yet.

## Phase 2 — the dry run itself

Press **Dry run** on the campaign.

```
POST /api/admin/lead-crm/campaigns/<id>/run   { "dryRun": true, "limit": 25 }
```

Use a small `limit` first — 25, not 100.

### What "dry run" actually means

`dryRun: true` sets `enqueueResearch: false`. So it **does**:

- query Overpass (and Brave, if enabled);
- normalize, dedupe and admit candidates;
- **write `lead_companies`, `lead_source_records` and `lead_leads` rows**;
- consume `overpass_requests` and `discovery_candidates` budget;
- write `DISCOVERED` / `DUPLICATE_SKIPPED` activity rows.

And it **does not**:

- enqueue a single `lead_research` job;
- crawl anybody's website;
- call Workers AI;
- touch Zoho.

It is not a no-op. It writes to your database. It just touches nobody else's
server beyond the discovery query itself.

The response:

```json
{ "status": "ok", "created": 18, "duplicates": 0, "rejected": 0,
  "candidates": 18, "adapters": [ { "slug": "osm-overpass", "status": "ok",
  "candidates": 18, "requests": 5 } ] }
```

### Inspect: business quality

Go to `/admin/lead-crm/leads` and read the first twenty.

- [ ] **Are these property-management companies?** Open five websites. OSM's
      `office=estate_agent` catches residential sales brokerages as well as
      property managers, and that is the most likely source of noise.
- [ ] **Are they in the target metros?** The bboxes are tight but OSM's
      `addr:city` is unreliable.
- [ ] **Is the size plausible?** A national franchise with 400 offices is not the
      ICP.
- [ ] **Any obvious non-businesses** — a building, a park, a vacant listing?

If the answer is mostly no, the fix is the **campaign config** (narrower tags,
tighter bboxes, more disqualifying keywords), not the engine.

### Inspect: domain correctness

- [ ] `canonical_domain` matches the actual site for every one.
- [ ] **No social hosts.** `facebook.com` or `linktr.ee` as a canonical domain
      would be a serious bug — it would merge every such business into one
      company record. `NON_COMPANY_HOSTS` should have rejected them.
- [ ] `www.` stripped, scheme stripped, no trailing path.
- [ ] Subdomains handled sensibly (`portal.example.com` → `example.com`).
- [ ] No canonical domain one label **too short** — the failure mode of an
      unlisted multi-part TLD, which over-merges. Unlikely in `.com`-heavy US
      data; watch for it if you ever run a PH campaign.

```sql
SELECT canonical_domain, name, website_url, city, region
  FROM lead_companies ORDER BY created_at DESC LIMIT 30;
```

### Inspect: duplicate handling

- [ ] **Run the dry run again, identically.** `created` should be 0 and
      `duplicates` should equal the previous `created`.
- [ ] `DUPLICATE_SKIPPED` activity rows appear, and **only once per lead** — the
      dedupe key is `duplicate:<leadId>:<domain>`.
- [ ] No second `lead_leads` row for the same company.
- [ ] Discovery budget was **released** for the duplicates.

```sql
SELECT campaign_id, company_id, COUNT(*) FROM lead_leads
 GROUP BY 1,2 HAVING COUNT(*) > 1;   -- must return nothing
```

- [ ] Scan for two distinct businesses merged onto one record — check
      `nameVariants` in `lead_source_records.payload_json`, which is the usual
      sign of two businesses sharing a parent domain.

If discovery quality is poor, **stop here.** Fix the campaign config and repeat
phase 2. Nothing downstream improves a bad candidate list.

## Phase 3 — the first real run

Set `LEAD_CRAWLER_ENABLED = "true"`, deploy. Then **Run discovery** (not Dry run)
with a small limit.

This is the first step that touches strangers' servers.

Research jobs are enqueued but the cron only fires once a day, so drain by hand:
`/admin/lead-crm/activity` → **Drain** (`{ action: 'drain', limit: 25 }`).

### Inspect: crawler accuracy

Open five leads' detail screens and compare the crawl record with the real site.

- [ ] **Pages fetched** — the homepage plus up to three others. Did link scoring
      reach the contact page? A site using `/get-in-touch` should still be found
      via anchor text.
- [ ] **Skips and failures.** `robots_disallowed:*` is correct behaviour, not a
      bug — but a high rate suggests the user agent is being blocked. Check
      `content_type:*`, `timeout`, `http_403`.
- [ ] **No page bodies stored.** `lead_crawl_runs.pages_json` must contain URLs,
      statuses, byte counts and reasons — **never HTML**.
- [ ] **Per-domain delay respected.** Check the `wrangler tail` timestamps.
- [ ] **Browser Run** (if enabled) fired only on genuinely client-rendered sites.

```sql
SELECT status, skip_reason, error_message, COUNT(*)
  FROM lead_crawl_runs GROUP BY 1,2,3 ORDER BY 4 DESC;
```

### Inspect: signal accuracy

**The single most important manual check in this document.** For five leads, open
the site and the signals list side by side.

- [ ] Every `MANUAL_*` signal's evidence excerpt really appears on the page.
- [ ] `BOOKING_DETECTED` / `CHAT_WIDGET_DETECTED` / `CRM_DETECTED` correspond to
      scripts that are genuinely loaded, not mentions in prose.
- [ ] `NO_VISIBLE_SCHEDULING` / `NO_VISIBLE_CHAT` are correct — an **absence**
      claim is the easiest to get wrong and the most likely to end up in a draft.
- [ ] `TARGET_INDUSTRY` matched a real phrase, not a footer boilerplate.
- [ ] `DISQUALIFYING_KEYWORD` did not fire on a legitimate business.
- [ ] `CONTACT_FORM` distinguished a real contact form from a newsletter box.
- [ ] `PUBLIC_BUSINESS_EMAIL` is a real address, and its `source_url` shows it.

A wrong signal becomes a wrong score, then a wrong AI assessment, then a false
sentence in an email to a stranger. This is where that chain is cheapest to break.

### Inspect: score quality

- [ ] Sort leads by score. **Would you rank them the same way?** That is the
      whole test.
- [ ] Read the reason list on three leads. Does it explain the score?
- [ ] Do the bands land sensibly? A useful distribution is a handful ≥75, a
      reasonable group 60–74, some 40–59 on hold, and the rest rejected. If
      everything is ≥75 the bar is too low; if nothing is, too high.
- [ ] Check the `HOLD` band specifically — those are the borderline calls.
- [ ] Remember that `TARGET_COUNTRY`, `TARGET_METRO` and
      `CORROBORATED_BY_TWO_SOURCES` have weights but **no extractor**, so
      geography contributes nothing to `icp_fit`. See [scoring.md](scoring.md).

```sql
SELECT routing, COUNT(*), MIN(total), AVG(total), MAX(total)
  FROM lead_scores WHERE is_current = 1 GROUP BY routing;
```

Tune `scoring.thresholds` in settings and rescore rather than editing weights on
the first pass.

## Phase 4 — AI review

Set `LEAD_AI_ENABLED = "true"`, deploy, drain again.

### Inspect: AI opportunity quality

Read every one of the first ten. This is the most expensive thing to get wrong.

- [ ] **`observed_problem` is an observation.** "The public website asks visitors
      to call the office" — good. "Their team manually processes every inquiry" —
      that is an inference and belongs in `inference_notes`. If the model is
      putting inferences in the observation field, the prompt is not working and
      you should not proceed.
- [ ] **`inference_notes` is hedged** and clearly separated.
- [ ] **`opportunity_type` and `devlab_service` fit** what was actually observed.
- [ ] **`outreach_angle` is specific**, not "help you streamline operations".
- [ ] **Rejections are honest.** A model rejecting half the leads with a clear
      reason is working correctly. The prompt says a low-quality answer is worse
      than an honest false.
- [ ] **Confidence tracks quality.** Spot-check a 0.9 and a 0.65.

```sql
SELECT status, COUNT(*) FROM lead_ai_runs WHERE task='opportunity_review' GROUP BY 1;
SELECT raw_output FROM lead_ai_runs WHERE status='invalid_output' LIMIT 5;
```

A cluster of `invalid_output` means the prompt or model needs attention.

Check Cloudflare's dashboard for actual neuron consumption. `lead_ai_runs.neurons`
is a local estimate and may be null — see [workers-ai.md](workers-ai.md).

### Inspect: contact provenance

- [ ] Every contact has a `source_url` **and opening it shows the address**.
- [ ] `source_type` matches the page.
- [ ] Role addresses (`info@`, `hello@`) preferred over named ones.
- [ ] **No address that is not on the site.** Any `firstname.lastname@` pattern
      you cannot find on a page is a serious bug — there is no code that should
      generate one.
- [ ] Excluded local parts absent — no `abuse@`, `careers@`, `noreply@`.
- [ ] No placeholders — no `you@example.com`.
- [ ] MX state is labelled *"Domain accepts mail (MX records found — not a mailbox
      check)"*, never "verified".
- [ ] `NO_CONTACT` leads genuinely have no findable public address.

```sql
SELECT c.email, c.email_type, c.source_type, c.source_url, c.mx_present,
       co.canonical_domain
  FROM lead_contacts c JOIN lead_companies co ON co.id = c.company_id
 ORDER BY c.created_at DESC LIMIT 30;
```

### Inspect: compliance

- [ ] Every US lead has a `lead_compliance_reviews` row with
      `profile_key = 'us-can-spam-operational'`.
- [ ] With `business.identity` empty: `needs_human_review`, naming the missing
      fields.
- [ ] With it filled: `passed`.
- [ ] Add a test address to suppression and confirm the lead becomes `blocked`.

## Phase 5 — drafts, and the hard stop

Drafts are generated automatically once a lead is AI-qualified, has a contact, and
passes compliance.

### Inspect: draft quality

Read **every** draft. All of them.

- [ ] 90–140 words. Plain. No marketing language.
- [ ] Opens with something specific and verifiable that you can check against the
      evidence excerpts.
- [ ] **No price, no metric, no client reference, no timeline, no invented
      credential, no fake prior conversation.**
- [ ] No claim about internal processes.
- [ ] No link that was not supplied.
- [ ] The opt-out line is present and says reply with STOP.
- [ ] Signed with the configured sender name.
- [ ] **Would you put your name on it?**
- [ ] Check `violations[]` on the API response / activity metadata. Anything the
      invention guard caught is stored, not silently removed.

Try the variants — `shorter`, `more_technical`, `suggest_call`, `no_cta` — to see
whether the regeneration path is usable.

### Inspect: CRM UX

Work through the screens as an operator:

- [ ] Dashboard actionable cards point at real work.
- [ ] Leads table sorts and filters usefully; score and next action are legible.
- [ ] Lead detail shows the score reasons, the signals with evidence, the crawl
      record, the AI assessment, the contact with provenance, the compliance
      checks and the timeline — all without needing SQL.
- [ ] Review queue is genuinely workable for 20 leads in one sitting.
- [ ] Hold / reject / archive / do-not-contact all behave and are audited.
- [ ] Activity screen shows jobs and lets you retry a dead one.
- [ ] A blocked lead says **exactly** why.

### THE HARD STOP

**The first run ends at `READY_TO_CONTACT`. No email is sent.**

You may optionally exercise **Create Zoho Draft** on **one** lead, to verify the
Zoho integration end to end. If you do:

- [ ] Open Zoho and confirm the message is in **Drafts**.
- [ ] Confirm the from, to, subject and body are right.
- [ ] **Confirm nothing was sent.** Check the Sent folder — it must not be there.
- [ ] Then **delete the draft from Zoho.** Do not send it.

Nothing in the software can send it. The stop is a decision about the *content*,
not a technical safeguard.

Before you ever send a real one:

- [ ] You have read every draft you would send.
- [ ] Signal accuracy was verified on a sample and you believe the claims.
- [ ] Contact provenance was verified on a sample.
- [ ] `business.identity` is complete and correct.
- [ ] The compliance profile passes for a real reason, not a waiver.
- [ ] The opt-out line is present and the address it names is monitored.
- [ ] You have decided, as a person, that this specific business would not mind
      hearing from you.

## Phase 6 — decide

Write down what you found. Then:

| Finding | Action |
|---|---|
| Candidate quality poor | Tune `config_json` — tags, bboxes, disqualifiers. Re-run phase 2. |
| Signals wrong | Fix `signals/patterns.js` or `extract.js`. Bump `EXTRACTOR_VERSION`. Re-crawl. |
| Scores mis-rank | Tune `scoring.thresholds` first, weights second. Bump `RULESET_VERSION` for a permanent weight change. |
| AI assessments generic | Write a `v2` prompt. **Do not edit `v1`** — it would invalidate every historical run. |
| Drafts unusable | Same. The prompt is the lever. |
| Contact yield low | Check whether the crawler is reaching contact pages at all. |
| Everything looks right | Send **one** email, by hand, to a business you would be comfortable phoning. Watch what happens. |

**Do not arm the schedule yet.** `LEAD_CAMPAIGN_SCHEDULES_ENABLED` and the
campaign's `schedule_enabled` stay off until several manual runs have produced
output you were happy with. That is the step that makes the engine run without
anyone asking it to, and it should be the last thing you turn on.

## Resetting between attempts

Local or preview only. **Never on production.**

```sql
-- Everything the engine created, keeping sources, settings and the campaign.
DELETE FROM lead_leads;      -- cascades to signals, scores, ai_runs, contacts,
                             -- compliance, conversations, messages, drafts,
                             -- tracking, crawl runs, activity
DELETE FROM lead_companies;
DELETE FROM lead_source_records;
DELETE FROM lead_jobs;
DELETE FROM lead_usage_daily;   -- resets today's budgets
```

`lead_suppression` and `lead_sync_state` are **not** in that list on purpose:
suppression is a record of people who asked not to be contacted, and deleting it
would undo that. Clear it only if you are certain every entry was test data.

Re-applying the seed after this is safe (`INSERT OR IGNORE`).
