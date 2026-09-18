# Scoring

Code: `src/lead-engine/scoring/score.js`. Weights and thresholds:
`src/lead-engine/config/defaults.js`. Signals: `src/lead-engine/signals/extract.js`
and `signals/patterns.js`.

Workers AI does **not** invent the score. Every point comes from a signal that
was observed on a public page, has a weight in one configuration file, and
produces a reason row the lead detail screen renders. That is what makes "why was
this lead qualified" answerable six months later, and it is what keeps the
expensive, non-deterministic step (the model) gated behind a cheap, reproducible
one.

`scoreLead()` is **pure**: signals and configuration in, score and reasons out.
No database, no I/O, no clock. So it is exhaustively testable (21 tests in
`scoring/score.test.js`) and can be re-run over historical signals when weights
change.

## Signal extraction, briefly

`extractSignals()` reads the crawled pages and produces observations. It is
HTML/DOM inspection, structured data (JSON-LD), script-host fingerprinting and
phrase matching. Nothing in it is a model.

A few decisions worth knowing:

- **Technology detection is by script/iframe host, not free text.** A page that
  *mentions* Calendly in a blog post has not integrated Calendly, and a false
  "already has scheduling" costs a lead its workflow-opportunity score. Wildcard
  entries match by suffix; everything else is an exact host match, because a
  substring check would let `notcalendly.com.evil.net` register as Calendly.
- **Manual-workflow phrases are grouped by concept**, so eleven variations of
  "call us" is one manual workflow, not eleven. That grouping is what makes
  `MULTIPLE_MANUAL_WORKFLOWS` mean something.
- **Absence signals are site-wide only.** `NO_VISIBLE_SCHEDULING` and
  `NO_VISIBLE_CHAT` are emitted after every page has been scanned. "No booking
  found on the about page" says nothing.
- **Accumulation is across pages.** A business with a phone-only contact page and
  a downloadable form on its services page has two manual workflows, and that is
  the observation worth scoring.
- Nothing in `patterns.js` is vertical-specific. "Owner portal" and "tenant
  portal" are generic operational-software terms; a vertical's own vocabulary
  lives in the campaign's `config_json`.

## The four categories

| Category | Question it answers |
|---|---|
| `icp_fit` | Is this the kind of business the campaign is looking for? |
| `workflow_opportunity` | Does the public site show manual process worth automating? |
| `contactability` | Can we reach them, and did they publish a way to? |
| `data_quality` | How much do we actually know, and how confident is it? |

## Weights

`SIGNAL_WEIGHTS` in `config/defaults.js`. A signal not listed here scores **zero**
— adding an extractor does not silently change every existing lead's score until
a weight is chosen for it deliberately.

### `icp_fit`

| Signal | Points | Emitted? |
|---|---:|---|
| `TARGET_INDUSTRY` | +15 | yes |
| `TARGET_COUNTRY` | +5 | **no extractor** |
| `TARGET_METRO` | +5 | **no extractor** |
| `MULTIPLE_SERVICES` | +5 | yes (≥2 campaign `serviceTerms` matched) |
| `MULTIPLE_LOCATIONS` | +5 | yes |
| `MULTIPLE_AUDIENCES` | +5 | yes (≥2 `AUDIENCE_TERMS`) |
| `DISQUALIFYING_KEYWORD` | **−25** | yes |

### `workflow_opportunity`

| Signal | Points | Emitted? |
|---|---:|---|
| `MANUAL_WORKFLOW_LANGUAGE` | +10 | yes |
| `MULTIPLE_MANUAL_WORKFLOWS` | +5 | yes (>1 distinct kind) |
| `DOWNLOADABLE_FORM` | +8 | yes |
| `PDF_WORKFLOW` | +5 | yes (a linked PDF **and** form/application language) |
| `APPLICATION_FORM` | +6 | yes |
| `QUOTE_REQUEST_FORM` | +5 | yes |
| `CLIENT_PORTAL` | +4 | yes (customer/owner/tenant portal phrasing) |
| `NO_VISIBLE_SCHEDULING` | +5 | yes |
| `NO_VISIBLE_CHAT` | +3 | yes |
| `CRM_DETECTED` | **−3** | yes |
| `BOOKING_DETECTED` | **−6** | yes |

A business already running a CRM is **not disqualified** — the observed
opportunity is usually the gap between the CRM and the manual steps around it —
but it is a weaker signal than a business with none. A business with public
booking already in place is weaker still.

### `contactability`

| Signal | Points |
|---|---:|
| `PUBLIC_BUSINESS_EMAIL` | +10 |
| `CONTACT_FORM` | +4 |
| `PUBLIC_PHONE` | +3 |
| `CONTACT_PAGE_REACHABLE` | +3 |

`CONTACT_FORM` requires a form with a `textarea`, or a form on a page that
classifies as a contact page — that is what distinguishes a contact form from a
search box or a newsletter signup. A form that is neither emits
`FORM_PRESENT_NOT_CONTACT`, which carries no weight.

### `data_quality`

| Signal | Points | Emitted? |
|---|---:|---|
| `ACTIVE_WEBSITE` | +5 | yes |
| `RESOLVED_CANONICAL_DOMAIN` | +3 | yes |
| `MULTIPLE_PAGES_ANALYZED` | +3 | yes (>1 usable page) |
| `STRUCTURED_DATA_PRESENT` | +2 | yes (JSON-LD found) |
| `CORROBORATED_BY_TWO_SOURCES` | +2 | **no extractor** |

### Three weights have no extractor

`TARGET_COUNTRY` (+5), `TARGET_METRO` (+5) and `CORROBORATED_BY_TWO_SOURCES` (+2)
have weights and operator-facing labels but **nothing in `signals/extract.js`
emits them**. `dedupeCandidates` computes `sourceCount` "for the
`CORROBORATED_BY_TWO_SOURCES` signal", but no code turns that count into a
signal row.

Practical consequences:

- The realistic maximum score is **114 before clamping**, not 126. Clamping to
  100 means this is invisible in the total, but it does mean geography
  contributes nothing to `icp_fit` today even though the labels suggest it does.
- A campaign whose value comes from geography (right industry, wrong metro) is
  scored the same as one in the target metro. Metro filtering happens at
  *discovery* time via the Overpass bboxes and the Brave queries, not at scoring
  time.
- If you add these extractors later, **bump `RULESET_VERSION`** — existing scores
  would otherwise become incomparable with new ones.

Signals extracted but carrying no weight (informational only, visible on the
lead detail screen): `CHAT_WIDGET_DETECTED`, `FORM_PRESENT_NOT_CONTACT`,
`MANUAL_<kind>` per-kind rows, `CUSTOMER_PORTAL` / `OWNER_PORTAL` /
`TENANT_PORTAL` / `MAINTENANCE_REQUEST`, and every `TECH_*` and `PLATFORM_*` row.

## Thresholds and routing bands

`SCORE_THRESHOLDS` — expressed as **lower bounds**, so there is exactly one
number per boundary and no possibility of a gap or an overlap.

| Total | Routing | Stage | Priority | Goes to AI? |
|---|---|---|---|---|
| 0 – 39 | `not_qualified` | `NOT_QUALIFIED` | low | no |
| 40 – 59 | `hold` | `HOLD` | low | no |
| 60 – 74 | `ai_review` | `RULE_QUALIFIED` | normal | **yes** |
| ≥ 75 | `priority_ai_review` | `RULE_QUALIFIED` | high | **yes** |

Bands are half-open: `[0, hold)`, `[hold, aiReview)`, `[aiReview, priorityAiReview)`,
`[priorityAiReview, ∞)`.

`hold` is the interesting band. It means "close, but not confident enough to
spend a model call on" — the lead sits in `HOLD`, appears in the dashboard's
actionable list, and a human decides whether to resume or reject it.

`routesToAi(routing)` is the single gate. Defining it once means the research
workflow, the job dispatcher and the admin's manual "review now" action cannot
drift about what qualifies.

Priority feeds `lead_jobs.priority` (10 for priority, 0 otherwise), so when the
day's AI budget is tight a 90-scoring lead is reviewed before a 61-scoring one.

## Clamping

```js
const rawTotal = sum of all four categories
const total = Math.max(0, Math.min(100, rawTotal))
```

Category subtotals are stored **unclamped** on `lead_scores`
(`icp_fit`, `workflow_opportunity`, `contactability`, `data_quality`), so a
negative `icp_fit` is visible on the detail screen even when the total floors at
zero.

Negative weights are real and must be able to push a lead below the bar. But a
negative *total* carries no more information than zero and would break the
routing bands and the UI's progress rendering.

## Explainability

Every scoring run writes a `lead_scores` row with `reasons_json` — an array of
`{ code, label, points, category }` that the lead detail screen renders verbatim.

Reasons are sorted by **absolute** contribution, then alphabetically by code, so
the screen leads with the reasons that actually decided the outcome rather than
with whichever signal happened to be extracted first. A −25 disqualifier sorts
above a +15 industry match.

Zero-point signals are excluded from the reason list entirely.

`lead_scores` is append-only and `ruleset_version` is stamped on every row, so:

- changing a weight and rescoring leaves the previous score readable and
  comparable;
- a score displayed today always matches the reasons that produced it, because
  the total is stored rather than recomputed.

`RULESET_VERSION` (currently `1`) must be bumped whenever a weight or threshold
change would make two scores incomparable.

## Worked example

A small US property-management company. Four pages crawled: `/`, `/contact`,
`/services`, `/owners`. The site is WordPress, has HubSpot tracking, publishes
`info@` on the contact page, a phone number, a contact form with a message box,
and an owner-portal link. It asks visitors to "call our office" and offers a
"download the form" link. It has no Calendly and no chat widget.

| Signal | Category | Points |
|---|---|---:|
| `TARGET_INDUSTRY` ("property management") | `icp_fit` | +15 |
| `MULTIPLE_SERVICES` ("rent collection", "tenant screening") | `icp_fit` | +5 |
| `MANUAL_WORKFLOW_LANGUAGE` (`phone_intake`, `form_download`) | `workflow_opportunity` | +10 |
| `DOWNLOADABLE_FORM` | `workflow_opportunity` | +8 |
| `NO_VISIBLE_SCHEDULING` | `workflow_opportunity` | +5 |
| `NO_VISIBLE_CHAT` | `workflow_opportunity` | +3 |
| `CRM_DETECTED` (HubSpot, via `js.hs-scripts.com`) | `workflow_opportunity` | −3 |
| `PUBLIC_BUSINESS_EMAIL` (`info@…`) | `contactability` | +10 |
| `CONTACT_FORM` | `contactability` | +4 |
| `PUBLIC_PHONE` | `contactability` | +3 |
| `CONTACT_PAGE_REACHABLE` | `contactability` | +3 |
| `ACTIVE_WEBSITE` | `data_quality` | +5 |
| `RESOLVED_CANONICAL_DOMAIN` | `data_quality` | +3 |
| `MULTIPLE_PAGES_ANALYZED` (4) | `data_quality` | +3 |

Category subtotals:

```
icp_fit               15 +  5                         = 20
workflow_opportunity  10 +  8 +  5 +  3 −  3          = 23
contactability        10 +  4 +  3 +  3               = 20
data_quality           5 +  3 +  3                    = 11
                                                 total = 74
```

**74 → `ai_review`**, stage `RULE_QUALIFIED`, priority `normal`. One point below
the priority band.

`MULTIPLE_MANUAL_WORKFLOWS` (+5) would have fired here — two distinct kinds were
detected (`phone_intake` and `form_download`) — taking it to 79 and into
`priority_ai_review`. The example omits it to show how close the boundary is.

Two variations on the same site:

| Change | New total | Routing |
|---|---:|---|
| Add `MULTIPLE_MANUAL_WORKFLOWS` (+5) | 79 | `priority_ai_review` |
| Calendly embedded → `BOOKING_DETECTED` replaces `NO_VISIBLE_SCHEDULING` (−6, and lose +5) | 63 | `ai_review` |
| Page says "we buy houses" → `DISQUALIFYING_KEYWORD` (−25) | 49 | `hold` |
| Both of the last two | 38 | `not_qualified` |

That last row is the disqualifier doing its job: a "we buy houses" site with
otherwise-perfect contactability and data quality still falls out of the
pipeline, and the reason list says exactly why.

## Where to change things

| To change | Edit | Then |
|---|---|---|
| A weight or threshold, permanently | `config/defaults.js` | Bump `RULESET_VERSION` |
| A weight or threshold, at runtime | `/admin/lead-crm/settings` → `scoring.weights` / `scoring.thresholds` | Deep-merged over the defaults; deleting the row restores them |
| What is detected | `signals/patterns.js` (vocabulary) or `signals/extract.js` (logic) | Bump `EXTRACTOR_VERSION`; add a weight *and* a label, or it scores zero |
| Vertical vocabulary | The campaign's `config_json` | No code change |

A unit test asserts every entry in `SIGNAL_WEIGHTS` has a matching entry in
`SIGNAL_LABELS`, so a weight can never exist without something readable to show
for it.
