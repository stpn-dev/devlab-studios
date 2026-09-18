# Discovery

Code: `src/lead-engine/discovery/` (adapters + normalization) and
`src/lead-engine/services/discovery.js` (orchestration).

Discovery turns "a metro and a trade" into candidate businesses with resolvable
websites. It does not judge them — that is the crawler's and the scorer's job.
What comes out of an adapter is a **hypothesis**, not a fact.

## The source registry gate

Nothing is read from a source that is not an approved row in `lead_sources`.

`services/discovery.js` calls `assertSourceUsable(db, slug)` before every
adapter, and a refusal is recorded with its reason and skipped — the run
continues on the remaining adapters. The gate is what stops an arbitrary
directory URL from quietly becoming an automated scrape target.

The columns that make up the gate:

| Column | Meaning |
|---|---|
| `enabled` | The operator switched this source on. |
| `automation_allowed` | Programmatic API access is permitted. |
| `crawl_allowed` | Page crawling is permitted. Separate, because a source may allow one and not the other. |
| `policy_status` | `unreviewed` / `approved` / `restricted` / `prohibited`. **A human's** reading of the source's terms. The software does not decide it. |
| `policy_notes` | What was checked and what was found. |
| `last_policy_reviewed_at` / `_by` | Attribution for the review. |

`scripts/lead-engine/seed.mjs` registers three sources with `enabled=0`,
`automation_allowed=0`, `crawl_allowed=0` and `policy_status='unreviewed'`. The
`policy_notes` it seeds are a **starting point for the review, not the review** —
they say what to go and check. Enabling a source is a deliberate act in
`/admin/lead-crm/sources`.

### The three registered sources

| Slug | Type | What to check before enabling |
|---|---|---|
| `osm-overpass` | `osm_overpass` | The current [Overpass API usage policy](https://operations.osmfoundation.org/policies/api/), and that our volume is within it. ODbL attribution applies where data is *displayed publicly* — it is not displayed publicly here, it is internal research evidence. |
| `brave-search` | `search_api` | The plan permits this use; note the request quota. |
| `manual-import` | `manual_import` | No third-party terms apply to the import itself, but **the source of the list does**. Do not import a purchased list. |

Only `osm-overpass` and `brave-search` appear in the `ADAPTERS` map that the
scheduled run iterates. `manual-import` is used by the import endpoint.

## Overpass (OpenStreetMap)

`src/lead-engine/discovery/overpass.js`.

Overpass is a **donated public service run by volunteers**, with a published
etiquette. The adapter follows it literally rather than approximately, because
getting it wrong gets an entire IP range banned — both rude and unrecoverable.

| Rule | How it is enforced |
|---|---|
| One request in flight | `CONCURRENCY.overpass = 1`; areas are queried strictly sequentially in a `for` loop |
| Server-side timeout | `[timeout:25]` in the QL preamble, so a runaway query is killed at *their* end; our own `AbortController` is 30s, deliberately higher, so the server gets to answer "that took too long" |
| Bounded result set | `out body center <limit>`, capped at `OVERPASS.maxElementsPerRequest` (200) |
| Identify ourselves | `User-Agent: DevLabResearchBot/1.0 (+https://www.devlabstudios.com/crawler)` — the same identity the crawler uses, pointing at a page that explains it |
| Back off on refusal | **The first failure stops the run.** A 429 or a 504 is a request to back off; firing the remaining areas at it anyway is how a soft limit becomes a ban. Whatever was collected before the failure is returned alongside the error. |

Three budgets bound an Overpass run, lowest wins: the number of configured
areas, `OVERPASS.maxAreas` (10), and the daily `overpass_requests` allocation
(40).

### Query construction

Overpass QL has no parameter binding, so tag keys and values are interpolated.
Therefore:

- Keys must match `/^[A-Za-z0-9_:.-]+$/` or `buildOverpassQuery` throws.
- Values are escaped (`\` and `"`). An unescaped quote in a campaign-supplied
  value would end the string literal and let the rest become query syntax.
- A bbox must be `[south, west, north, east]` with `south < north` and
  `west < east`. An **inverted box is refused**, because it silently matches
  nothing — which looks like "the area has no businesses" rather than "the config
  is wrong".
- A tag with no value means "this key exists at all" (`["shop"]`), which is a
  legitimate campaign filter.

A configuration error returns `overpass_invalid_config` and stops the run rather
than continuing with a subset the operator did not ask for.

Ways and relations are queried alongside nodes; `out ... center` gives them a
representative point.

### What is kept

`OVERPASS.evidenceTags` — name, brand, operator, office, shop, amenity, craft,
website, `contact:website`, phone, `contact:phone`, `contact:email`, and the
`addr:*` fields — go into `payload`. The rest of the element is discarded.

The website is taken from `contact:website`, then `website`, then `contact:url`,
preferring the tag that is specifically about contact details.

### Honest limitation

OSM tags are crowd-sourced. The `website` tag can be years stale, point at a
Facebook page, or belong to the building rather than the business. **Most OSM
entries for a business have no website at all.** A run that produces far fewer
candidates than the bbox contains businesses is normal, not a bug. The raw tags
are kept in `payload` so a later disagreement is traceable to what OSM actually
said.

### Failure modes, all non-throwing

`overpass_not_configured` · `overpass_invalid_config` · `overpass_rate_limited`
(429) · `overpass_query_timeout` (504 — the bbox or tag set was too broad, a
config problem not an outage) · `overpass_http_<status>` · `overpass_timeout` ·
`overpass_network_error` · `overpass_invalid_json` (Overpass serves an HTML error
page when overloaded) · `overpass_malformed_response`.

## Brave Search (optional)

`src/lead-engine/discovery/brave.js`.

**Optional is the load-bearing word.** With no `BRAVE_SEARCH_API_KEY`
configured, the adapter returns
`{ candidates: [], requests: 0, error: 'brave_not_configured' }` and the run
continues on Overpass and manual imports alone. Nothing downstream treats the
absence of a key as a failure. That is what keeps the whole pipeline runnable
without a paid API.

### Discovery only

What the adapter takes from a search result is **the URL and the title** — "a
site that might be a business of the kind we are looking for exists at this
domain".

The snippet is kept only as a 200-character bounded `payload.description`, for
operator provenance, and it is **never forwarded to Workers AI**. The AI
opportunity review reasons only over pages this system fetched itself. A search
snippet is a third party's summary of a page; feeding it to a model would let an
unverified sentence become a scored "finding". The crawler re-fetches every
domain from source, and that is the only text the model ever sees.

### Queries are explicit, never composed

`buildBraveQueries` reads `campaign.config.brave.queries` verbatim. It
deliberately does **not** compose queries from the campaign's target industries
and metros: each query is a metered request, and a generated cross-product
silently turns a three-industry, four-city campaign into twelve of them. An
operator writes the queries they want to pay for.

Queries are trimmed, capped at 400 characters, de-duplicated case-insensitively,
and limited to `BRAVE.maxQueriesPerRun` (10).

Three request budgets, lowest wins: the campaign's own `config.brave.requestBudget`,
the number of queries, and the daily `brave_requests` allocation (100).

### Failure modes

`brave_not_configured` · `brave_no_queries` · `brave_unauthorized` (401/403) ·
`brave_rate_limited` (429) · `brave_http_<status>` · `brave_timeout` ·
`brave_network_error` · `brave_invalid_json` · `brave_malformed_response`.

A failed response **stops** the loop rather than continuing: a rejected key or an
exhausted quota fails identically for every remaining query, and each retry still
costs a request against the daily budget.

### Honest limitation

Search results for a local-business query are largely directories, social
profiles and aggregators. `normalizeCandidate` drops the non-company hosts, so
the effective yield per request is much lower than `count` suggests. The title is
used as a provisional name only — search titles carry site furniture ("Home |
Acme Property Management — Austin TX") and the crawler's own extraction
overwrites it later.

## Manual import

`src/lead-engine/discovery/manualImport.js`, exposed at
`POST /api/admin/lead-crm/campaigns/:id/import`.

The source with no API, no rate limit and no policy question — and the one most
likely to be malformed, because it was assembled by hand in a spreadsheet.

**The contract is per row.** Every row that can be used is used, and every row
that cannot produces an `{ line, reason }`. An import of 500 rows with 12 bad
ones imports 488 leads and shows 12 line numbers. It does not fail, and it does
not silently drop 12 businesses.

### CSV (`parseImportCsv`)

- RFC 4180 on the points that matter: quoted fields may contain commas and
  newlines; `""` inside a quoted field is one literal quote. Only a quote at the
  *start* of a field opens a quoted field, so `6" pipe` is taken literally.
- Anything else ragged is taken literally rather than rejected — an operator's
  spreadsheet export is not going to be repaired by being refused.
- **Column order is never assumed.** The header row maps columns to fields via
  `COLUMN_ALIASES`. A positional parser breaks silently the first time someone
  reorders two columns in Excel, writing phone numbers into the city field.
- A UTF-8 BOM (which Excel writes) is stripped from the first header cell.
- A duplicated header keeps the **first** occurrence.
- **Line numbers are tracked, not derived from the row index**, because a quoted
  field may contain newlines — row 4 is not necessarily line 5, and an error
  pointing at the wrong line is worse than none.
- Without a website column the import fails with `missing_website_column`.
  Guessing which column holds URLs would be worse than saying so.

Recognised headers:

| Field | Aliases |
|---|---|
| name | name, company, company name, business, business name, organisation, organization |
| website | website, website url, url, domain, web, web site, site |
| email | email, e mail, email address, contact email |
| phone | phone, phone number, telephone, tel, contact phone |
| city | city, town, locality |
| region | region, state, province, county |
| country | country, country code |
| category | category, industry, sector, type, business type |

### Domain list (`parseDomainList`)

One domain or URL per line. Blank lines and `#` comments are ignored so a list
can be annotated. The lowest-ceremony path for an operator with a list and
nothing else.

### Limits

`IMPORT_LIMITS.maxRows` = 5000 data rows, `maxTextLength` = 4 000 000 characters.
Beyond either, `row_limit_exceeded` / `file_too_large`. 5000 is already far more
than the daily discovery budget will admit.

### Imported rows are not privileged

`importCandidates` runs them through **exactly the same** normalization,
deduplication and admission path as an automated adapter, and enqueues research
the same way.

## Normalization

`src/lead-engine/discovery/normalize.js` — the one candidate shape every adapter
produces.

**The hard rule: a candidate without a resolvable canonical domain is not a
candidate.** `lead_companies.canonical_domain` is the identity key and the
crawler has nothing to fetch without one. A nameless row with a website is
usable; a named row without one is not.

Rejection is an ordinary outcome, counted rather than thrown:

| Reason | Meaning |
|---|---|
| `no_website` | No website field at all |
| `unparseable_website` | Not a URL, or a bare IP, or no dot in the host |
| `non_company_host` | A Facebook page, a Linktree, a Yelp listing — a real business we cannot identify or crawl |

`non_company_host` is checked **before** `canonicalDomain` so the reason
distinguishes those two cases. The counts tell an operator tuning a campaign
completely different things.

The `NON_COMPANY_HOSTS` list in `domain/domains.js` covers the major social
networks, link shorteners, `g.page`/`business.site`, and site-builder subdomains
(`wixsite.com`, `weebly.com`, `blogspot.com`, `wordpress.com`, `squarespace.com`,
`godaddysites.com`). Without it, every business whose "website" is a Facebook
page would merge into one company record with `canonical_domain = facebook.com`.

Other normalization rules:

- **Country code** must be ISO-3166-1 alpha-2 or it is dropped. A column saying
  "United States" is not guessed at: the country code drives campaign targeting
  and the compliance profile, and an invented value there is worse than a missing
  one.
- **Coordinates** are validated as a *pair*. A lone latitude places nothing on a
  map, and `Number('')` is `0` — which would plant every coordinate-less
  candidate in the Gulf of Guinea.
- **Field ceilings** (`CANDIDATE_LIMITS`) mirror the repository column bounds, so
  a 40KB "name" is cut here rather than silently truncated at the INSERT.
- **`payload` is bounded**: strings to 300 chars, 24 keys per object level, 2
  levels of nesting, 10 array items. Functions, class instances and cycles are
  dropped, which also means `JSON.stringify` on the result cannot throw.
- Field aliases are accepted (`website`/`url`/`domain`, `state`/`region`,
  `lon`/`lng`) so each adapter does not need its own mapping layer.
- Nothing mutates its input. The adapter's raw object is still the raw object
  when it is written to `lead_source_records.payload_json`.

## Deduplication

Two layers, at different times.

### 1. In-run: `dedupeCandidates`

Collapses candidates that share a `canonicalDomain`, across all adapters, before
anything expensive happens.

Merging is **additive and first-non-empty-wins**: Overpass usually knows the
street and the phone, a search result usually knows the trading name, a CSV
usually knows the email, and the union is a better lead than any of them alone.
Nothing is overwritten, so **adapter order decides preference** — pass the source
you trust most first. (`ADAPTERS` iterates Overpass then Brave.)

`sourceCount` is the payoff: it is what the `CORROBORATED_BY_TWO_SOURCES` signal
reads. Records sharing an `externalId` are the same record seen twice (a re-run,
or two overlapping campaign areas) and corroborate nothing, so they are counted
once.

Name equality is judged on the normalized form (`normalizeCompanyName` strips
`inc`/`llc`/`ltd`/`corp`/etc. and punctuation), so "Acme LLC" and "Acme, L.L.C."
are one name. A genuine disagreement is kept in `nameVariants` for the operator —
it is the usual sign that two businesses share one parent domain.

### 2. Across runs: the database

`admitCandidate` upserts `lead_companies` on `canonical_domain` and `lead_leads`
on `(campaign_id, company_id)`. A candidate that resolves to a company already in
this campaign becomes a `DUPLICATE_SKIPPED` activity row and **nothing else** —
no crawl, no AI call, no second lead. Its reserved discovery budget unit is
released.

That ordering is what keeps a hundred-candidate run from costing a hundred crawls
when forty of them are businesses a previous run already found.

The `DISCOVERED` activity metadata records `seenInAnotherCampaign` when the
company already existed from a different campaign — worth knowing, because it
means the same business is being approached twice.

### Why canonical domain

`domain/domains.js` derives the registrable domain: lowercased hostname, trailing
dot stripped, last two labels — or three when the last two are in
`MULTI_PART_TLDS`.

**There is no public-suffix list.** A full PSL is ~250KB that would have to be
bundled into the Worker and kept current, to serve a rule that matters only for
multi-part TLDs. `MULTI_PART_TLDS` enumerates the ones that occur in the target
markets (US and PH) plus a generous set of commonly-encountered others. The
failure mode of an *unlisted* multi-part TLD is a canonical domain one label too
short — which **over-merges** two unrelated businesses onto one record — so the
list is deliberately generous rather than minimal.

Getting this wrong permissively crawls the same business twice and may email it
twice. Getting it wrong strictly merges two unrelated businesses. Both directions
are covered by `domain/domains.test.js` (23 tests).

## Budgets

Applied in this order:

1. **Monthly** — `checkMonthlyDiscoveryBudget`, `MONTHLY_DISCOVERY_LIMIT` = 3000
   candidates, summed across the month's daily global rows.
2. **Per-source daily request budget** — `overpass_requests` (40),
   `brave_requests` (100), consumed before the adapter runs.
3. **Per-campaign candidate ceiling** — `lead_campaigns.max_candidates` (100 for
   Campaign 001).
4. **Per-candidate daily budget** — `discovery_candidates` (200), consumed per
   admission and released again if the candidate turned out to be a duplicate.

## Running discovery

`POST /api/admin/lead-crm/campaigns/:id/run` with `{ dryRun, limit }`.

**A "dry run" is not a no-op.** `dryRun: true` sets `enqueueResearch: false`,
which means it discovers, normalizes, dedupes, **writes companies, source records
and leads to D1**, and consumes discovery budget — it just does not enqueue a
single crawl. Nobody else's server is touched, but your database is. See
[dry-run.md](dry-run.md).

A campaign whose `status` is not `active` returns
`{ status: 'skipped', reason: 'Campaign is draft.' }` regardless of who asked.
That is checked in `runCampaignDiscovery` itself, not only in the route, because
the scheduler calls the same function.
