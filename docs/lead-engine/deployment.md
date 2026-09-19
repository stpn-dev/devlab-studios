# Deployment

The engine ships inside the existing deploy process. There is no separate
pipeline, no separate Worker, and no new Cloudflare resource to provision.

Read [`../deployment.md`](../deployment.md) first — everything below assumes it.

## How this ships

| Branch | Path | Target |
|---|---|---|
| `development` | `.github/workflows/deploy-preview.yml` → `CLOUDFLARE_ENV=preview npm run build` → `wrangler deploy --env preview` | `devlab-studios-preview` |
| `main` | Cloudflare Workers Builds (git-integrated, automatic on push) | `devlab-studios` |

`src/lead-engine/` is bundled into the same Worker as the public site. The admin
screens are routes in the existing Astro app. Nothing about the build changes.

Two things that were already true and now matter more:

- **`CLOUDFLARE_ENV=preview` must be set for the `astro build` step**, not just
  the deploy. `@astrojs/cloudflare` bakes resolved bindings into
  `dist/server/wrangler.json` at build time, before `wrangler deploy` runs.
  Passing `--env preview` alone arrives too late. See
  `docs/architecture/decisions/0005-preview-environment-build-time-env.md`.
- **`src/worker.ts` is the entrypoint** and now also exports the five Workflow
  classes and declares a `queue()` handler. Both are inert with no bindings
  configured. See [cloudflare-workflows.md](cloudflare-workflows.md) and
  [queues.md](queues.md).

Follow the repository's preview-first policy
([`../branch-workflow.md`](../branch-workflow.md)): promote to `development`,
verify on the live Preview Worker and Preview D1, then fast-forward `main`.

## The migration

`migrations/0013_lead_usage_metric_nominatim.sql` widens
`lead_usage_daily.metric` to admit `nominatim_requests`. **Without it discovery
reports success and admits nothing** — the counter insert is `INSERT OR IGNORE`,
so the CHECK rejection is swallowed and every budget reservation refuses on a
database with zero usage. Apply it wherever 0012 is applied.

`migrations/0012_lead_intelligence_engine.sql` — 22 tables, all prefixed `lead_`,
in the existing `devlab-studios-cms` database.

It is **purely additive**. It creates no index on an existing table, alters
nothing, and drops nothing. Every statement is `CREATE TABLE IF NOT EXISTS` or
`CREATE INDEX IF NOT EXISTS`, so re-running it is a no-op.

Deploying the code without applying the migration is safe in the sense that the
public site is unaffected — the engine's queries would fail, but every flag is off
so nothing runs them. Apply it anyway, before you turn anything on.

```bash
# 1. Local, first
npx wrangler d1 migrations apply devlab-studios-cms --local

# 2. Preview
npx wrangler d1 migrations apply devlab-studios-cms-preview --remote --env preview

# 3. Production — only after preview is verified, with a fresh token
npx wrangler d1 migrations apply devlab-studios-cms --remote
```

Verify:

```bash
npx wrangler d1 execute devlab-studios-cms --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lead\_%' ESCAPE '\' ORDER BY name"
```

22 rows. Note that `leads` and `lead_activities` (the public site's own tables)
are **not** part of this set and must be left alone — see
[data-model.md](data-model.md).

Per project convention: **never edit an applied migration.** A correction is a new
forward migration.

## The seed

`scripts/lead-engine/seed.mjs` prints SQL on stdout rather than writing to a
database — the same pattern as `scripts/cms/generate-insights-seed.mjs`. The
operator sees exactly what will be written before anything is, and the same
output can be applied to local, preview and production deliberately rather than by
a script deciding for them.

```bash
npm run lead-engine:seed       # writes scripts/lead-engine/seed.sql

npx wrangler d1 execute devlab-studios-cms --local --file scripts/lead-engine/seed.sql
npx wrangler d1 execute devlab-studios-cms-preview --remote --env preview --file scripts/lead-engine/seed.sql
npx wrangler d1 execute devlab-studios-cms --remote --file scripts/lead-engine/seed.sql
```

`npm run lead-engine:seed` is
`node scripts/lead-engine/seed.mjs > scripts/lead-engine/seed.sql`, matching the
`cms:seed:*` and `pickleball:seed:demo` aliases.

Every statement is `INSERT OR IGNORE`, so re-applying changes nothing. The
campaign id is a fresh `randomUUID()` on each generation, so **re-generating and
re-applying creates a second campaign** — the `slug` unique constraint prevents
that, and the insert is ignored. A committed `scripts/lead-engine/seed.sql`
already exists with a fixed id.

### What it seeds, and what it deliberately does not

| Seeded | State |
|---|---|
| 3 sources (`osm-overpass`, `brave-search`, `manual-import`) | `enabled=0`, `automation_allowed=0`, `crawl_allowed=0`, `policy_status='unreviewed'` |
| Campaign 001 "US Property Management — Dry Run" | `status='draft'`, `schedule_enabled=0` |
| `business.identity` | **All fields empty** except `legalName` and `website` |

Registering a source is not the same as having read its terms, and only a human
can do the second one. Seeding a campaign that immediately started crawling other
people's websites would be exactly the wrong default. And seeding an empty
business identity makes the US compliance profile hold every lead rather than the
engine inventing a postal address.

The `policy_notes` on each source are a **starting point for the review, not the
review** — they say what to go and check.

## The ordered enable sequence

From fully-off to a dry run. **Do not skip ahead**, and do each step on preview
before production.

Each routine step is reversible in CRM Settings. Deployment ceilings remain
available for an incident-response stop that cannot be overridden in the UI.

### Step 0 — deploy, off

The shipped state. Merge the branch through `development` to `main`. All nine
operational switches are off in D1; the deployment ceilings permit UI control.

**Verify:** the public site is unaffected. `/admin/lead-crm` loads and shows a
disabled state. The cron tick logs
`lead_engine.scheduled_tick` with `result: ok` having done nothing, or returns
`{ status: 'disabled' }` before logging.

### Step 1 — migration and seed

Above. **Verify:** 22 tables, 3 source rows, 1 draft campaign, 1
`business.identity` row.

### Step 2 — turn on the engine, nothing else

The committed deployment ceiling already permits the engine. Turn on **Engine
(master switch)** in **Lead CRM > CRM Settings**. Fresh environments start with
all operational switches off.

**Verify:** `/admin/lead-crm` renders the dashboard with real (empty) counts.
Sources, Campaigns, Settings all load. Nothing reaches the internet — every
sub-flag is still off.

### Step 3 — review the source policies

`/admin/lead-crm/sources`. For each source you intend to use: read its terms,
record what you found in `policy_notes`, set `policy_status`, and set `enabled` /
`automation_allowed` / `crawl_allowed`.

**This is a human step and there is no way around it.** `assertSourceUsable`
refuses an unreviewed source, so discovery finds nothing until it is done.

For automated discovery you need at least one approved source. `brave-search`
is optional and needs a separate account, API key, and an acceptable plan.
`osm-overpass` is keyless, but keyless does not mean unrestricted: review the
policy for the exact endpoint you configure. The main public instance directs
regular commercial use to self-hosted or paid infrastructure. Manual import
remains available as the free, operator-controlled path.

Do not substitute the public Nominatim endpoint for automated business
discovery. Its usage policy forbids systematic POI queries and treats scheduled
requests as bulk geocoding. A self-hosted Nominatim instance is a different
service and may be evaluated separately. Likewise, do not replace the API with
a Playwright search-results scraper: that makes search-engine anti-bot controls
and terms part of this system's reliability and provenance model.

### Step 4 — fill in the business identity

`/admin/lead-crm/settings` → `business.identity`. Every field: `senderName`,
`senderEmail`, `postalAddress`, `city`, `region`, `postalCode`, `countryCode`.

Until this is complete the US compliance profile fails
`sender_identity_configured`, `postal_address_configured` and
`opt_out_mechanism_present`, and **every US lead stops at
`needs_human_review`**.

You can legitimately do the dry run without this — you will simply see every lead
blocked at the compliance step, which is itself a useful thing to confirm. But
you cannot generate a usable draft.

### Step 5 — discovery

```jsonc
"LEAD_DISCOVERY_ENABLED": "true"
```

Deploy. Activate the campaign (`draft` → `active`) on
`/admin/lead-crm/campaigns`. **Leave `schedule_enabled` at 0.**

**Verify:** press **Dry run**. Candidates are discovered, normalized and deduped,
and `lead_companies` / `lead_leads` rows appear — but **no crawl is enqueued**.
Inspect the businesses. See [dry-run.md](dry-run.md).

> A dry run is not a no-op. It writes rows and consumes discovery budget. It just
> touches nobody else's server beyond the Overpass/Brave query itself.

### Step 6 — crawler

```jsonc
"LEAD_CRAWLER_ENABLED": "true"
```

Deploy. Now a real run (**Run discovery**, not Dry run) enqueues research jobs,
and the next cron tick — or a manual drain from `/admin/lead-crm/activity` —
starts crawling real business websites.

**Verify:** crawl runs complete, robots refusals are recorded as skips with
reasons, signals look like what the pages actually say, and scores rank leads the
way you would.

This is the first step that touches strangers' servers. Do it on a small `limit`
first.

### Step 7 — Workers AI

```jsonc
"LEAD_AI_ENABLED": "true"
```

Deploy. Qualified leads are now reviewed by the model and drafts are generated.

**Verify:** `lead_ai_runs` rows with `status = 'ok'`, opportunity assessments that
are specific rather than generic, and drafts you would be willing to sign. Check
`invalid_output` rows — a cluster means the prompt needs attention.

### Step 8 — Zoho

Complete [zoho-integration.md](zoho-integration.md) Part 1 first, then:

```jsonc
"ZOHO_MAIL_ENABLED": "true"
```

Deploy. **Verify:** the settings screen says `Connected.`, then create one Zoho
draft and **look at it in Zoho** — confirm it is in Drafts, correctly addressed,
and that nothing was sent.

### Step 9 — mailbox sync

```jsonc
"ZOHO_MAIL_SYNC_ENABLED": "true"
```

Deploy. **Verify:** send that draft by hand from Zoho, then press **Sync now**.
The lead should move to `CONTACTED` → `AWAITING_REPLY`. Reply to yourself and
confirm the inbound message is imported and matched. Reply `STOP` from a test
address and confirm suppression fires.

### Step 10 — optional extras

Any order, any time after step 7:

| Flag | Also needs |
|---|---|
| `LEAD_TRACKING_ENABLED` | — |
| `LEAD_BROWSER_RUN_ENABLED` | `CLOUDFLARE_ACCOUNT_ID` + `BROWSER_RENDERING_API_TOKEN`. Its **ceiling ships `false`** precisely because neither secret exists; set them first, then raise it. |
| (Nominatim discovery) | Nothing. Enable the `osm-nominatim` source after policy review — no key exists to set. |
| (Brave discovery) | `BRAVE_SEARCH_API_KEY` secret + the source enabled. Optional; the free path does not use it. |

### Step 11 — schedules, last

```jsonc
"LEAD_CAMPAIGN_SCHEDULES_ENABLED": "true"
```

**and** `schedule_enabled = 1` on the campaign. **Both** are required — the flag
and the per-campaign switch are independent by design.

**Do not do this until a manual dry run and a manual real run have both been
inspected end to end.** This is the step that makes the engine run without
anyone asking it to.

### Steps 12+ — Queues and Workflows

Optional and not required for correctness. Each needs a code change beyond the
configuration change. See [queues.md](queues.md) and
[cloudflare-workflows.md](cloudflare-workflows.md).

## Pre-deploy checklist

```bash
npm run typecheck
npm run build
npm run test:unit
npx playwright test --project=static
```

Then confirm by reading the diff:

- [ ] All nine deployment ceilings are explicit in `wrangler.jsonc` and
      `env.preview.vars`, and production and preview AGREE; runtime state is
      reviewed in CRM Settings
- [ ] `LEAD_CAMPAIGN_SCHEDULES_ENABLED` is still `"false"` in both. It is the
      switch that makes campaigns run unattended, and it stays shut until a
      manual dry run AND a manual real run have both been inspected end to end
- [ ] `LEAD_BROWSER_RUN_ENABLED` is still `"false"` unless
      `CLOUDFLARE_ACCOUNT_ID` and `BROWSER_RENDERING_API_TOKEN` are both set —
      an open ceiling without them fails inside every research job it touches
- [ ] The `queues` and `workflows` blocks are still commented out, or the
      resources genuinely exist
- [ ] No secret is in `wrangler.jsonc`, `.env.example` or any committed file
- [ ] `migrations/0012` and `0013` are unchanged if either has already been
      applied anywhere — a correction is a new migration, never an edit

## Rollback

| What | How |
|---|---|
| **Turn the engine off** | `LEAD_ENGINE_ENABLED = "false"`, deploy. Fastest, and usually enough. |
| **Worker code** | Cloudflare dashboard → Workers & Pages → `devlab-studios` → Deployments → *Rollback to this deployment*. Reverts code and assets; does not touch D1. |
| **The migration** | Do **not** try to roll it back. It is purely additive and harmless when unused. If a table genuinely must go, write a new forward migration. |
| **Seeded data** | Delete the rows directly. Nothing else references them. |
| **Operational data** | See [disaster-recovery.md](disaster-recovery.md). |

Code deployment does not promote D1 data. Routine switches live in D1 and fail
closed when D1 is unavailable. Setting `LEAD_ENGINE_ENABLED = "false"` and
deploying remains the independent emergency stop.

## Why the flags are in the committed config

They are deployment safety ceilings, not credentials. Routine operational
changes happen in CRM Settings; changing a ceiling requires a commit and deploy
because it is reserved for incident response and hard environment policy.
