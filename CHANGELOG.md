# Changelog

All notable changes to this project are recorded here, following the spirit
of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This file's
`## [Unreleased]` section is updated as part of the same change that makes
the change — never batched up and reconstructed later — so it stays a real,
contemporaneous trace, not a retrospective guess.

## Versioning policy

This project follows [Semantic Versioning](https://semver.org/)
(MAJOR.MINOR.PATCH). The product surface here is the public site's
pages/routes plus the CMS API contract (`/api/*` request/response shapes and
the D1 schema) rather than a published package, so the three levels are
decided against that surface specifically:

- **MAJOR** — a breaking change to the public contract: removing/renaming an
  `/api/*` endpoint or a field the frontend or admin UI depends on, a
  non-backward-compatible D1 schema change, removing a public route, or any
  change explicitly called out as breaking.
- **MINOR** — new backward-compatible capability: a new page/route, a new CMS
  content type or optional API field, a new admin feature. Nothing existing
  breaks.
- **PATCH** — bug fixes, performance/reliability improvements,
  dependency/security patches, refactors, and documentation — no change to
  what a visitor, admin user, or API caller can rely on.

### Process, every time something ships

1. Add an entry to `## [Unreleased]` in the same commit as the change itself.
2. When a set of `[Unreleased]` entries is ready to ship as a release:
   decide the bump level using the rules above (the highest level triggered
   by anything in the batch — one breaking change makes the whole release
   major, even alongside ten patch-level fixes), bump `package.json`'s
   `version` to match, retitle `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`,
   and start a fresh empty `[Unreleased]` above it — all in one commit.
3. Push to `main`. CI (`.github/workflows/ci.yml`) detects that
   `package.json`'s version changed from the previous commit, then
   automatically creates the immutable `vX.Y.Z` tag, pushes it, and publishes
   a matching GitHub Release with body text extracted from that version's
   `CHANGELOG.md` section. Ordinary commits that don't bump the version are
   left untouched — nothing is tagged unless a human explicitly decided a
   release was ready. A manual `git tag vX.Y.Z` (pushed by hand) is only a
   fallback if CI can't run.
4. Tags are immutable — once pushed, a version tag is never moved or
   force-updated. If something ships wrong, the fix is a new patch release,
   not a rewritten tag.
5. "What's current" is answered by GitHub's native mechanism (the
   highest-semver published Release is automatically marked **Latest
   release**) — no floating `latest` tag is maintained.

## [Unreleased]

## [1.8.0] - 2026-09-10

### Changed
- A pickleball session no longer publishes anything by default. The public live/TV view shows real player names on a link that needs no sign-in, so publishing is now something an operator turns on per session from the session control page rather than something that happens to their players automatically. Existing sessions are untouched and keep working; only newly created ones start private. The leaderboard remains separately switchable once sharing is on, and turning sharing off again immediately stops the link resolving — so an operator asked to stop showing someone's name can actually do it.

### Added
- Added `POST /api/pickleball/sessions/:id/visibility` and a sharing control on the session page, gated on `MANAGE_SESSIONS` — publishing personal data is a session-management decision, not a scorekeeping one. Both flags are written together so "leaderboard on, public view off" (a state nobody can observe) cannot be stored.
- Added a privacy notice to the public live view stating what is shown, that anyone with the link can see it, and that the session organiser can switch it off.
- Invited operators are now actually emailed. Inviting someone created their membership and told the inviter "Invitation saved", but sent nothing and gave the invited person no way to learn they had access — the invite worked and was simultaneously invisible, which is indistinguishable from being broken. The email carries their role, the sign-in link for the environment it was sent from, and the one instruction that matters: sign in with Google using the address the invite arrived at, since that is what binds the membership to an account. It is a table-and-inline-styles layout with a plain-text alternative, because Outlook renders through Word and Gmail drops `<style>` blocks. The same endpoint also changes an existing member's role, so the copy says "your role has changed" in that case rather than claiming a long-standing member has just been added. Delivery outcome is now reported back rather than assumed: the operators page confirms the address it reached, or warns that access was granted but the mail did not go out and gives the link to pass on by hand. Nothing is sent from an environment with test logins enabled, so the end-to-end suite cannot mail its throwaway addresses and bounce them off the domain the real invites are sent from.

### Fixed
- Made validation errors say what is actually wrong. The API has always returned field-level detail for a 400, and the API client already attached it as `error.issues`, but all 18 operator pages displayed only the generic top-level message — so a form with one bad field reported a bare "Validation failed." with no indication of which field or why, which is indistinguishable from a broken app. Errors now read like "Win by: Number must be greater than or equal to 1". The scoring-ruleset form also gains a hint that a win-by of 1 is sudden death, since "win by 0" is the natural thing to reach for and is not a value that can exist.
- Replaced every rate limiter with a Durable-Object backed one, because the previous ones were not enforcing anything in production. They used module-scope `Map`s, and Cloudflare gives each Worker isolate its own memory, so the counters almost never saw the same client twice. Measured against the live site rather than inferred: 12 sequential wrong-password attempts on `/api/admin/login` from one address all returned 401 against a limit of 8, and 70 requests to the public session endpoint produced no 429 at all. The admin login now also carries a second, per-address limit, since the per-account one is trivially sidestepped by spraying one guess each across many addresses. Enforcement is proved end to end against a running worker, which is what the old unit tests could not do — they drove the `Map` in-process and passed throughout.
- Gave the pickleball pages their own social share image. All three pointed at the site-wide DevLab Studios "Full-Stack Development & AI Automation" card, so sharing the pickleball link on Facebook or LinkedIn showed a software-consultancy advert with a pickleball caption underneath — and on a social post the image is read before any text. The new 1200x630 card reuses the same hand-authored court artwork and brand gradient as the landing page. The source HTML is kept in `scripts/og/` so it can be re-rendered rather than re-drawn.
- Led the pickleball landing hero with "Be a beta tester" instead of "Operator sign in". While the product is in beta almost everyone arriving is a prospective operator rather than an existing one, so requesting access is the primary action, seeing the guide is secondary, and signing in is a quiet link for the few who already have an account. The new button anchors to the request-access form already on the page.
- Added the site favicon to the four standalone pickleball shells — the operator app, accept-invite, and the live and TV views. Those pages declare their own `<html>` rather than going through `Layout.astro`, so they had been serving a blank tab icon while the marketing pages showed the logo.
- Paginated the organisation roster. `GET /api/pickleball/players` returned every player with no LIMIT and the Players page rendered all of them — fine for a club of twenty, and the first thing to break for a club of two thousand, which is exactly the size a successful launch produces. It now returns a bounded page (50 by default, 200 ceiling) with `total`/`hasMore`, and accepts `search`, matched on the same normalised name the duplicate rules already use. The Players page gains search and paging; the dashboard counts from `total` rather than the rows it happened to receive; and the check-in page's register-a-player picker is now search-backed rather than holding the whole roster, which is what let it keep working past one page. `players` remains the top-level field, so nothing that consumed it breaks.
- Fixed migration `0015` being impossible to apply to a new database, which meant every fresh environment needed a documented manual step and would have blocked any later migration behind it. Root cause, established by bisection against throwaway D1 databases rather than by reading: wrangler concatenates a migration with its own bookkeeping insert and posts that string to D1 unsplit, and D1's server-side splitter breaks a statement at a semicolon followed by a newline. SQLite requires a semicolon inside a trigger body, so a conventionally formatted trigger was cut in half and the API answered `incomplete input`, having applied nothing. Keeping the body's terminator on the same line as `END;` fixes it. A brand-new database now applies all fifteen migrations, trigger included, with one `wrangler d1 migrations apply` and no manual step. Three earlier explanations were disproved along the way and are recorded in the migration file so the next person does not re-derive them.
- Made every permission-gated pickleball API route drain its request body before answering 403. Twenty of them returned the refusal before reading the body, which is the pattern already documented in this repo as crashing a local worker's loopback for every subsequent request in the run; the other thirteen happened to read first, so the whole set now uses one draining helper and a future reordering cannot reintroduce it.
- Fixed the long-standing "known flaky" end-to-end tests. `playwright.config.js` set a 180s test budget but left each `expect` on Playwright's 5s default — a different, much tighter clock. Every operator page is a `client:only` React island, so navigating to one means download, hydrate, then fetch before anything renders, which on a cold worker routinely passes 5s. The first assertion after a `page.goto` therefore failed about one run in three while the page was perfectly healthy. Raising the assertion timeout to 15s (still far under the test budget) fixes the whole class rather than three tests individually.
- Added rate limiting to the unauthenticated public session endpoint. A share code is ~40 bits and unguessable in one shot, but it was the only gate on a view carrying real player names and the endpoint would answer as fast as it was asked, leaving code enumeration trivially scriptable. Capped per IP, far above what the 5s degraded-path poll needs.

## [1.7.0] - 2026-09-08

### Added
- Added Devlab Pickleball's public pages: a product landing page (`/pickleball`), an operator guide (`/pickleball/how-it-works`) and a methodology page, each with share metadata, original inline court artwork that renders without JavaScript, and a request-access path so a prospective operator who is not yet in the system has somewhere to go instead of a dead-end sign-in.
- Added fixed-pairs sessions. A pair is formed from the check-in page and persists for the whole session: it queues and is assigned as a single unit, both partners must be available for it to be offered a court, and it carries its own games-played count so pair fairness is tracked separately from individual fairness.
- Added tournaments in all four specified formats — round robin, single elimination, pool play into a bracket, and double elimination. The entire draw is generated when the bracket is locked and seeded from all-time ratings; later rounds exist as empty slots that fill as results come in. Courts are proposed from the fixture list rather than the fairness queue, and tournament games deliberately do not feed player ratings while still counting toward session wins and losses.
- Added entrant withdrawal. Remaining opponents are awarded walkovers (a win with no points) so a draw still completes after an injury or departure, the withdrawn pair keeps the results it already earned so the pairs that beat it still add up, and withdrawing releases the pair so it can then be dissolved.
- Added the bracket to the public and TV views, showing pools, winners and losers brackets by pair name, with slots nobody has reached yet marked `TBD` rather than left blank.
- Added per-session standings that rank every attending player from check-in, so a leaderboard exists from the first minute of a session rather than only once enough games have been played.
- Added four D1 migrations (`0012`–`0015`) introducing `session_pairs`, `tournament_entrants` and `tournament_fixtures`, three new nullable columns on existing tables, and a trigger enforcing one active pair per player. All are additive: no table is rebuilt, renamed or dropped, and code predating them continues to run against the migrated schema.

### Changed
- Modelled a tournament as a fixed-pairs session carrying a format rather than as a third session type. Everything already built for pairs — formation, availability, assignment, statistics — applies unchanged, and only the parts that genuinely differ (seeding, fixtures, advancement) are new.
- Replaced the Zoho Flow webhook as the contact-form lead-delivery target with the Resend API. A webhook trigger only confirms Zoho *received* the ping, not that its flow actually ran and sent an email — with the flow's subscription lapsed, leads were silently persisting to D1 while reporting "delivered" and no email ever arrived. Resend's response only reports success once the message is actually accepted for delivery, so lead status now reflects reality. Sends from and to `hello@devlabstudios.com` by default (both configurable), and preview intentionally has no working key so preview/e2e runs never send a real email.

### Fixed
- Fixed the mobile navigation panel rendering with no background at all instead of a near-opaque dark surface, letting page content bleed through behind its links. The cause: Tailwind's opacity modifier (`/NN`) only resolves values on its opacity scale (multiples of 5); `bg-[#080d21]/98` used an unsupported value and silently compiled to nothing. Corrected this and two other same-shape instances (light gradient card treatments using `/92` and `/88`) to valid scale values.
- Fixed the admin Leads list silently showing only the single most recent lead. The admin UI always requests `/api/admin/leads` with no `limit` param; `Number(null)` evaluates to `0` in JavaScript, and a `Number.isFinite()` guard let that `0` through as an explicit "limit 1" instead of falling back to the intended default of 100.
- Fixed the platform Organizations page setting state from a floating promise inside its mount effect, which `react-hooks/set-state-in-effect` reports as an error and which failed `npm run lint` — and so CI on `main`, which gates the release tag on it. Pre-existing rather than introduced here, but it blocked this release from being tagged. The load is now awaited inside the effect with an unmount guard, which also stops it setting state on a component the operator has already navigated away from.
- Fixed migration `0012` being impossible to apply to a remote D1 database, which blocked the entire feature from deploying. Every attempt failed with `incomplete input: SQLITE_ERROR`, reproduced on both production and preview, and had gone unnoticed because the migration had only ever been applied to local SQLite files, where wrangler takes a different code path. The trigger it defines is rejected when it travels in the same request as other statements, where something re-splits on the `;` that SQLite's grammar requires inside `BEGIN ... END`; wrangler's own splitter and D1 itself were each ruled out by test. Splitting the trigger into its own migration (`0015`) lets the rest apply normally. `0015` still cannot be applied by `wrangler d1 migrations apply`, because that command appends its own bookkeeping insert to the same request — it is created with a single `d1 execute --command` and the migration recorded manually, which the migration file documents so a new environment cannot silently end up without the constraint.

## [1.6.0] - 2026-08-14

### Added
- Added public-usage guidance to CMS editors, controlled repeatable page-section fields, readable field-level audit diffs, and reference-aware R2 media upload, replacement, and deletion actions.

### Changed
- Reorganized the Admin CMS around the actual public information architecture: Home, About, Services, Work, Insights, and Profile now appear in public order; Process and Contact are supporting content; Projects, Service Catalog, Insight Articles, and Certifications are clearly labeled content libraries.
- Hid the unused Case Studies and Testimonials collections from normal Admin navigation and dashboard surfaces while retaining their storage and API compatibility.
- Removed the dormant Case Study presentation path from the public Work page so legacy records cannot surface there accidentally.
- Wired existing Home, About, Services, Insights, and Contact presentation copy to controlled CMS page blocks without changing their public layouts or enabling arbitrary HTML.
- Renamed Admin-facing Resources/Articles wording to Insights and Site Settings navigation to Navigation & Footer.
- Updated the repository README and operational documentation for the current Astro/Cloudflare platform, Full-Stack Software Engineer & AI Automation Specialist positioning, Work-to-Project CMS model, release 1.5.0 environment status, and the two-branch preview-first workflow.
- Added a canonical branch workflow and cleanup guide after removing merged feature branches and the stale clean worktree.

### Fixed
- Audit Log details now explain the action performed and show safe before/after field previews instead of raw metadata JSON.
- Media uploads now require a size-checked, signature-verified optimized WebP at the Worker boundary; replacement updates known content references before retiring the prior R2 key, and deletion is blocked while references remain.
- Fixed the public Experience timeline rendering its connector line above each node's circle instead of behind it.
- Reworded remaining first-person marketing copy ("We start by mapping…", "After the audit, we define…", "Once the direction is approved, we build…", "Tell us where…", "Our Process", "How we work") to a neutral/third-person voice across the homepage, Process, and Contact pages and their static fallback data, matching the wording pass already applied to Services.
- Corrected a stale seeded value on the Home hero's secondary call-to-action (`secondaryCta` pointed at "View Profile" → `/profile`) that, now that the public renderer reads it, would have silently replaced the live "View Work" → `/work` button; applied via an idempotent update script to preview and production D1.

## [1.5.0] - 2026-08-14

### Added
- Added a dedicated CMS-managed Work page that features existing Project records, keeps Work-specific description, Challenge, System Architecture, and Delivery Value copy independently editable, renders each Project's ordered multi-image gallery, and prevents deletion while a Project remains featured.

### Changed
- Brightened the homepage delivery timeline and aligned the client-credibility language around Full-stack Development + AI Automation.
- Reframed the public experience as a dark-native, full-bleed DevLab system with a full-viewport landing chapter, the canonical brand tagline, restrained logo-derived color energy, open capability architecture, larger proof-first Work presentations, and light surfaces reserved for intentional content artifacts.
- Consolidated public pages into one full-document midnight backdrop with continuous gradients, mesh, and sparse technical markers; transparent section wrappers; and a navbar that integrates at page load before gaining a restrained sticky surface on scroll.
- Refined the Admin CMS into a quieter operational control plane with compact metrics, scan-friendly activity, restrained navigation states, and standardized workspace controls while preserving its routes and workflows.
- Polished the profile tool strip and open dark-surface interactions, compact carousel pagination, process-artifact labels, and desktop hero height so the approved dark-native design remains legible and complete across common first-viewport sizes.

### Fixed
- Guarded the public footer and CMS login against temporary version-history or smoke-test tagline values while retaining a targeted, idempotent D1 correction for existing environments.
- Kept Profile experience actions legible during hover, constrained public detail and image panels beneath the sticky navigation, and extended their dimming backdrop behind the navbar without covering it.
- Extended the CMS visual system with icon-led navigation and sparse, non-interactive vector fields behind workspace content and the login introduction.

## [1.4.4] - 2026-08-13

### Fixed
- Made the CMS Media Library inventory the bound Cloudflare R2 bucket directly instead of relying on an empty D1 tracking table, with storage summaries, object paths, previews, and clear editor-upload guidance.
- Synchronized Production navigation, calls to action, Home and About hero blocks, Profile positioning, canonical resume URL, and Home SEO with the validated Development content through the targeted idempotent update.

## [1.4.3] - 2026-08-13

### Changed
- Quieted and spaced out the public mesh texture, removed decorative dots from admin workspaces and forms, and enriched the CMS login introduction with restrained icon-led capability cards.

## [1.4.2] - 2026-08-13

### Fixed
- Enforced the canonical inline `/resume.pdf` destination on the Profile action so stale CMS content cannot restore the retired external résumé link.

## [1.4.1] - 2026-08-13

### Changed
- Strengthened the lightweight static site-wide wavy dot mesh, carried a quieter mesh texture into shared card surfaces, added branded icons to footer connection links, improved spacing throughout the contact form flow, and prevented form interaction before React hydration and secure verification are ready.

### Security
- Provisioned a dedicated production Managed Turnstile widget and encrypted Worker secret for `devlabstudios.com`, while keeping Cloudflare's official test key restricted to local verification.

## [1.4.0] - 2026-08-13

### Added
- Added a cinematic dark/light public design system with reusable full-stack, data, editorial, and automation vector motifs.
- Added a living-systems homepage hero that maps the customer journey across interface, API, data, AI, automation, and human handoff layers.
- Added backward-compatible CMS hero presentation fields, complete page-block rendering, repeatable CTA/signal controls, and a mobile admin navigation drawer.
- Added the stable `/resume.pdf` route and Profile-only `View Resume` action while preserving the approved ATS resume byte-for-byte.

### Changed
- Repositioned Stephen consistently as a Full-Stack Developer & AI Automation Specialist across primary public copy, SEO, structured data, and CMS fallbacks.
- Aligned the public shell, core route heroes, footer, CMS login/dashboard, and editor surfaces with the new visual system.
- Made site settings merge partial CMS records with safe structural defaults so missing footer fields cannot remove navigation or social links.
- Made partial CMS project collections merge with repository fallbacks so selected public proof cannot silently disappear when D1 is incomplete.
- Restored About to the primary navigation, moved Process out of the primary tab set, strengthened navbar contrast, consolidated shared colors into a navy–indigo–cyan palette, and moved the dot mesh from cards to the global site background.
- Expanded Work with selected automation project screenshots and structured write-ups covering each challenge, system architecture, and delivery value.
- Rebuilt the public color architecture around the canonical electric blue–violet–magenta logo palette, cool pearl canvas, shared surface/card/form primitives, stronger technical mesh, and matching midnight navbar/footer treatments.
- Refined the About page into one authoritative studio-overview hero, with balanced metadata and a consistent card hierarchy instead of a duplicated page introduction.

### Security
- Replaced the deployed Turnstile test-key fallback with environment-specific runtime keys and fail-closed server validation, including hostname/action checks, Siteverify timeout and idempotency, duplicate/expired-token recovery, and safe structured form errors.
- Provisioned a dedicated Managed Turnstile widget for the isolated Preview hostname and connected its public runtime key and encrypted Worker secret.

## [1.3.1] - 2026-08-12

CMS seed and navigation infrastructure fixes, surfaced by a whole-site audit
done right after 1.3.0 shipped. Classified as PATCH: bug fixes and cleanup
only — no new capability, and every redirect/route behaves the same from a
visitor's perspective, just served by the mechanism the CMS was actually
built for instead of a duplicate hardcoded shortcut.

### Fixed
- `scripts/cms/seed/cms-content-seed.sql` targeted the pre-migration-0004
  `resources` table for article content; that table was renamed to
  `articles` in `0004`, so this seed would fail outright if run today. Its
  column list already matched the current `articles` schema exactly — the
  fix was the table name, not the data.
- The seed's `site_footer` JSON stored `legalText` as a plain string; the
  real footer and admin editor both expect `legalLinks` as an array of
  `{label, href}` links to `/privacy` and `/terms`.
- The seed's navigation and footer both pointed "Resources" at `/resources`
  instead of the real `/insights` route, and never had a "Process" nav
  entry at all (the seed predates that page). A `seo_metadata` row also
  used `page_slug: 'resources'`, which the Insights page never looks up
  (it requests `'insights'`) — an orphaned row from the same root cause.
- Production's live database had every one of the above: `profile_about`
  still stored the pre-1.3.0 field names and a plain-string certificates
  list (blanking the About paragraph and every certification's text on
  the live site since 1.3.0 deployed), the nav had no Process entry, and
  Resources still pointed at `/resources`. Fixed directly in production's
  D1 via a targeted, minimal update — no code change was needed for this
  part, since the deployed code already expected the correct shape.
- Removed `src/pages/experiences.astro` and `src/pages/portfolio.astro`,
  two hardcoded redirect pages that duplicated (and always intercepted
  before) the equivalent rows already sitting unused in the D1 `redirects`
  table since migration `0004`. `middleware.ts`'s D1-backed redirect
  lookup was already fully wired up — completes the cleanup that
  migration's own comment deferred to "Phase 3." Verified directly (not
  assumed): the "legacy redirects still work" e2e test previously passed
  entirely through the hardcoded pages for all three legacy routes; after
  removing these two, it was re-run and confirmed the D1 + middleware path
  genuinely serves both redirects correctly on its own.

## [1.3.0] - 2026-08-12

Profile page content refresh and structural rebuild: merged the About/
Certifications content into one document flow with real experience data,
then rebuilt the whole page into a single sidebar + document-flow layout
with a scrollspy and cursor-glow navigation, a restyled Portfolio carousel,
and a wide set of layout/alignment fixes found during verification.
Classified as MINOR: new, backward-compatible presentation and navigation
on the existing `/profile` route — no route, `/api/*` shape, or D1 table
schema changed (the `profile_about` JSON blob's internal shape changed
together with its one reader/writer, the same kind of change 1.2.0 itself
made).

### Added
- Left sidebar navigation (About/Education/Certifications/Experience/
  Tools & Platforms/Portfolio) with scrollspy (highlights the section
  currently in view) and a cursor-following spotlight glow across the
  whole page. Vanilla-JS, matching the existing scroll-reveal pattern —
  no new client-hydrated island.
- Experience entries: a full-detail modal opened via "View details",
  matching the existing modal convention elsewhere on the page.
- Portfolio carousel: dot pagination with an active-pill indicator, and a
  seamless edge fade (no bounding box) replacing the previous hard clip.
- Certifications: issuer logos (Cisco, Google, OWASP) resolved from the
  existing `issuer` field, with a generic fallback icon otherwise.
- Tools & Platforms marquee: 13 additional tools (Claude, Postman, Spring
  Boot, Next.js, TypeScript, JavaScript, Git, Vercel, PHP, Java, Retell AI,
  Twilio, SQL/Databases), widened from 2 to 4 slower rows.
- "DevLab Studios" wordmark now shows in the navbar at every screen width,
  not just `sm` and up.

### Changed
- About and Certificates & Licenses merged into a single `about` field and
  a structured `{ name, issuer, date }` array (previously two separate
  fields and a plain string array) — the admin CMS form and every reader
  updated together.
- Experience section now shows the already-correct 4-entry history
  (previously only 1 entry was live, a data-sync gap, not a content gap).
- Platform Training certifications and the Professional certifications
  list both now render as flat, two-column lists instead of a boxed card
  grid and a single column respectively, for visual consistency with each
  other.
- Portfolio's "Automated Lead Qualification" project: enriched
  description, and its title/tech-stack synced to match what was already
  live in production (a pre-existing divergence between the static
  fallback data and production's D1, found while verifying this release —
  renamed to "Automated Real Estate Lead Qualification & Outbound Calling
  System", added the missing "n8n" tag).
- Per-section headings (About, Education, Certifications, Experience,
  Tools & Platforms, Portfolio) removed at desktop width, where the new
  sidebar nav labels them instead; restored as small inline labels below
  the breakpoint where the nav is hidden.

### Removed
- "Skills" section (always rendered blank — no data source has ever
  populated it).
- "Systems & Workflows" section.

### Fixed
- Several layout bugs surfaced by direct browser verification during this
  release, not just visual inspection: the sidebar's right-hand grid
  column used a bare `1fr` track, which per the CSS Grid spec defaults to
  `minmax(auto, 1fr)` — once Tools & Platforms and Portfolio moved inside
  this grid, their unwrapped content pushed the whole column (and the
  page) wider than the viewport; Portfolio carousel cards varied in both
  height and width because a title's `line-clamp`-ed line count and
  natural (unwrapped) text width still affected flex-item sizing even
  though the clamp only clipped visually; the Experience connector line
  was positioned at a grid column's edge instead of the dot's actual
  rendered center; Experience date text overflowed into the connector
  line at realistic date-range lengths after an earlier column-width
  change; the Portfolio carousel's own prev/next arrows were being faded
  into near-invisibility by its new edge-mask, since they were descendants
  of the masked element; the profile photo's decorative glow read as
  uneven from two separate causes (an asymmetric two-blob gradient, then a
  parent `overflow-y-auto` — added to fix sidebar overflow on short
  viewports — clipping the glow's box-shadow at its own edges); anchor
  jumps from the sidebar nav landed under the fixed navbar (missing
  `scroll-padding-top`).

## [1.2.0] - 2026-08-11

Profile page redesign: an animated tools/platforms marquee with real
vendored brand logos, hero card polish, certification hover effects, a
left-rail experience timeline, and an auto-rotating portfolio carousel
replacing the old expandable rows. Classified as MINOR: purely new,
backward-compatible presentation on one existing page — no route, `/api/*`
shape, or D1 schema changed.

### Added
- "Tools & Platforms" marquee: two-row, alternating-direction,
  auto-scrolling display of real brand logos (via `simple-icons`, vendored
  as local SVG assets — no runtime dependency on the package or a CDN),
  grayscale at rest with brand color and pause on hover. Two logos
  (OpenAI, GoHighLevel) fall back to a generic icon pending real
  brand-kit assets, since neither has a `simple-icons` entry.
- Hero card: entrance animation on load, a pulsing gradient glow behind
  the profile photo, an "available for work" status pill.
- Certification cards: lift + shadow and a diagonal shine sweep on hover;
  issuer and date reveal on hover instead of always showing.
- Experience section rewritten as a left-rail timeline (year badge →
  dot-on-line → card) with a staggered scroll-reveal animation.
- Portfolio section rewritten as an auto-rotating carousel (Embla
  Carousel): seamless infinite loop, pause-on-hover with manual arrow
  controls, a center-focus effect (sharp center card, progressively
  blurred/faded toward the edges), and a dedicated project detail modal
  (`ProjectDetailModal`) replacing the old expandable rows (`PortfolioRow`,
  removed).
- A shared `[data-reveal]` scroll-reveal utility (`src/lib/scrollReveal.ts`),
  used site-wide for entrance animations, with a `<noscript>` fallback so
  content stays visible without JavaScript.

### Changed
- Portfolio carousel only loads a project's cover image once it's within
  a small window of the currently-selected slide (tracked via Embla's own
  position API), instead of every project in a category loading its
  image regardless of visibility — bounds real page weight and avoids
  downloading cover art a visitor will never scroll to.
- `ProjectData` (`src/lib/content/projects.ts`) is now an exported,
  explicitly-typed interface instead of an internal, loosely-typed one.
- `/profile`'s image-weight budget and its underlying Playwright
  measurement (`tests/e2e/image-weight.spec.js`) were corrected: the old
  fixed-timing scroll+settle logic could race past a `client:visible`
  island's hydration and silently undercount real page weight; it now
  waits for the DOM's own image count to stabilize before measuring.

### Fixed
- `ProjectDetailModal` now matches this repo's existing modal conventions
  (Escape-to-close, background scroll lock, `aria-labelledby`) and
  correctly coordinates with the nested image lightbox so a single Escape
  press or scroll-lock release only affects the topmost modal.
- Carousel arrow controls are now visible on keyboard focus and on touch
  devices (previously only revealed on mouse hover, making them
  invisible-but-tappable/focusable).

## [1.1.0] - 2026-08-01

The Astro/CMS rebuild program: rendering migration, schema-driven admin,
leads backend, and deployment hardening. Every entry below was already a
real commit on `feat/astro-cms-rebuild` (see `git log v1.0.0..v1.1.0` for
the full itemized history) — consolidated here into one release because the
`[Unreleased]` section wasn't updated commit-by-commit while the branch was
in progress, contrary to this file's own stated policy above. Classified as
MINOR: the rendering layer and admin were fully rewritten internally, but
every public route and `/api/*` shape a visitor or the frontend depends on
was ported 1:1 or kept working via redirect (see `/resources` → `/insights`
under Changed) — nothing in the public contract broke.

### Added
- Rendering rewritten on Astro + `@astrojs/cloudflare` (replacing the Hono
  SPA worker), querying D1 directly in frontmatter — eliminates the
  double-render (static fallback → client fetch → swap) the previous
  architecture had on every content page.
- Admin rebuilt as a schema-driven headless CMS: Zod-validated content
  types, append-only content versioning with one-click rollback, an audit
  log, generic replace-all/per-item collection CRUD, a block-based page
  composition editor (Home/About/Process), a media library, and real
  D1-backed redirect management (redirects created in `/admin` now actually
  redirect on the public site).
- New public pages: Process, Privacy, Terms, and Work (case studies index +
  detail) — previously scoped but never built.
- Leads backend: submissions persist to D1 before delivery is attempted
  (a downstream Zoho outage can no longer lose a submission), Cloudflare
  Turnstile spam protection on the contact form, 5-minute duplicate-submission
  detection, a `/admin/leads` screen with delivery-attempt history and manual
  retry.
- Real Platform Certifications content (Make/n8n/Zapier) on the Profile page.
- Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy,
  X-Robots-Tag) now enforced on every server-rendered response via
  middleware — previously only reached genuinely static files.
- An isolated preview environment (`devlab-studios-preview`: its own Worker,
  D1 database, R2 bucket, and secrets), deployed automatically on every push
  to `development` via `.github/workflows/deploy-preview.yml`.
- `.github/dependabot.yml` for monthly npm and GitHub Actions dependency
  updates.
- A Playwright end-to-end suite (`tests/e2e/`) — the project had none before
  this program started.
- Five ADRs (`docs/architecture/decisions/`) and `docs/deployment.md`,
  `docs/security.md`, `docs/testing.md`.
- `scripts/cms/hash-admin-password.mjs` now only emits PBKDF2 hashes (removed
  the weak single-round SHA-256 default), always prompts interactively with
  masked input, and requires a confirmation entry instead of accepting the
  password as a CLI argument.
- CI now automatically tags and publishes a GitHub Release whenever
  `package.json`'s version changes on a push to `main`.
- Redesigned the admin Dashboard to match mature CMS conventions: live stat
  cards (Projects, Services, Articles, Case Studies, Testimonials,
  Certifications, Redirects, Leads) linking straight to each section, a
  real Recent Activity feed (icon per action type, relative timestamps,
  actor email) reading from the existing audit log, and a Quick Links
  panel — replacing the plain text-link grid and always-empty-looking
  activity list.

### Changed
- `/resources` renamed to `/insights`; the old path 301-redirects, so
  nothing that linked to it breaks.
- Footer legal links are now editable content (`legalLinks` array) instead
  of a static string.
- Maintenance mode is now a runtime D1 toggle (`site_settings.maintenance_mode`)
  instead of a build-time flag.
- Content Security Policy updated to allow Cloudflare Turnstile
  (`challenges.cloudflare.com`).
- Repo and Worker renamed to `devlab-studios`.

### Removed
- `@refinedev/core`, `@refinedev/react-router`, `@refinedev/simple-rest` —
  the previous admin's Refine dependency, confirmed unused by any admin
  component after the schema-driven rebuild.
- The legacy `src/worker.js` Hono app — every route ported 1:1 to Astro API
  endpoints (same response shapes, same validation, same rate limiting).
- Deleted stale, superseded remote branches `cloudflare/workers-autoconfig`
  and `copilot/fix-error-in-actions` (both one-off bot-generated branches
  from 2026-03-10, fully absorbed into `main` already).

### Fixed
- **Data loss risk**: every "replace all" collection save (testimonials,
  certifications, services, articles, FAQs, experiences, skills, tools,
  navigation, SEO metadata, page blocks, project gallery images — ~12
  functions) deleted all existing rows and re-inserted the new ones as
  separate, sequential `.run()` calls. D1 does not implicitly wrap
  sequential statements in a transaction, so a failure partway through the
  insert loop (bad row, transient error, hitting a platform limit on a
  large save) left the delete committed and the rest of the new data never
  written — a silent, irrecoverable loss of whatever wasn't re-inserted in
  time. Found during a pre-release code review, verified directly against
  `testimonials.js`. Fixed by building the delete + every insert as
  prepared statements and running them through `db.batch()`, which D1
  executes as one atomic transaction.
- Version History "Restore" (`VersionHistoryPanel`, used by every content
  type) failed completely silently on a network error or expired session —
  no error shown, button just did nothing. Same gap in the Leads "Retry
  Delivery" action. Both now show an error message and re-enable the
  action instead of failing invisibly.
- `PUT /api/admin/content/[type]` (services/resources/profile/site-settings/
  seo) and `/api/admin/projects/*` never validated request bodies with Zod
  before writing to D1, unlike every schema-driven collection — a
  deliberately-deferred gap from the Phase 4 debt cleanup
  (docs/architecture/decisions/0002-schema-driven-cms.md), closed here with
  schemas matching the repositories' existing coercion leniency (nothing
  newly required, just real structural validation instead of none).
- Latent JSON-LD XSS pattern in `Layout.astro`: `JSON.stringify` doesn't
  escape `<`, so a string containing `</script>` could prematurely close
  the tag. Not exploitable today (only static strings feed it), but a
  one-line escape closes the class of bug before any CMS data is ever
  wired through the unused `getPortfolioItemSchema` helper.
- `GET /api/admin/leads?limit=-1` (or similar) returned the entire table —
  SQLite treats a negative `LIMIT` as "no limit". Clamped to 1–500.
- Admin shell's sidebar header and topbar had different heights, so their
  border lines didn't align — both now a fixed `h-16`.
- Insights pages (`/insights` and `/insights/:slug`) rendered `[object Object]`
  wherever a post had no cover image: `{createElement(resolveIcon(...), ...)}`
  produces a raw React element object, and Astro's template interpolation
  just stringifies non-renderable values instead of mounting them. Fixed by
  resolving the icon to a component reference and using it as a normal
  `<Icon />` tag, which Astro does know how to render.
- `PortfolioGallery`'s category tabs had no spacing before the results grid
  below them (missing `mt-6`).
- Admin login page was a bare, unbranded form — added the site's actual
  logo, wordmark, and CMS-editable footer tagline (fetched from
  `/api/site-settings`) in a branded split-screen layout matching the rest
  of the site's visual identity.
- Platform Certifications on the Profile page weren't clickable — extracted
  into a `CertificationsGallery` island reusing the same `ImageModal`
  lightbox `PortfolioGallery` already had, so certificate images now open
  full-size on click like project screenshots do.
- `tailwind.config.js`'s `content` glob (`./src/**/*.{js,jsx,ts,tsx}`) never
  included `.astro` files, so Tailwind silently purged every utility class
  used only inside a `.astro` template — which by this point was most of
  the site's page-level styling (gradients, brand colors, layout classes
  on About/Home/Services/etc). Visually broken since whichever Phase 3
  commit first converted a page to `.astro`, but never caught: Playwright
  asserts on headings/text content, not computed styles, and nobody had
  looked closely at the rendered pages until manually reviewing the first
  preview deploy. Fixed by adding `astro,md,mdx` to the glob.
- `.nvmrc`, `package.json`'s `engines.node`, and both GitHub Actions
  workflows bumped from Node 20 to 22 — the Astro version in use requires
  Node `>=22.12.0` and had for a while, but `ci.yml` only runs on `main`,
  which this branch hadn't reached yet, so nothing had ever actually
  built this code with Node 20 in CI until the new preview deploy workflow
  ran and failed immediately.
- `scripts/cms/hash-admin-password.mjs` capped at 100,000 PBKDF2 iterations
  (was 210,000) — Cloudflare's actual deployed Worker runtime rejects
  higher counts with `NotSupportedError`, which `wrangler dev --local` does
  not catch, so every local/CI test passed despite the real deploy failing.
  Discovered by deploying the new preview environment for the first time.
- Patched 4 of 5 high-severity `react-router`/`react-router-dom` CVEs by
  bumping to 7.18.2 (within the existing `^7.11.0` range, non-breaking). The
  5th (`GHSA-qwww-vcr4-c8h2`, an RSC-mode CSRF bypass) has no fix until
  react-router 8.3.0, which `react-router-dom` hasn't published; it only
  affects apps using React Router's unstable RSC APIs, which this app does
  not use — allowlisted in `audit-ci.json` with justification recorded in
  `docs/CURRENT_STATE.md`.
- Replaced the CI `npm audit` step with `audit-ci` so a single allowlisted
  advisory can't mask a future, real one.

## [1.0.0] - 2026-07-30

Baseline release — the first tagged version for this live production site.
Prior history was not tagged and is summarized here from `git log` rather
than itemized commit-by-commit. The `v1.0.0` tag for this entry was pushed
manually as the documented CI-unavailable fallback, since the automated
tagging described above didn't exist yet at the time this was cut.

### Added
- Portfolio pages: Home, About, Services, Profile, Resources (with dynamic
  `/resources/:slug`), Contact, and five `/landing-sample-*` marketing/demo
  pages.
- Custom CMS: Cloudflare D1 + R2 + Hono backend with an admin UI (`/admin`,
  built on Refine) for managing projects, services, resources, profile
  content, site settings, and SEO metadata, with static-content fallback
  when D1 is unconfigured.
- Contact form proxied server-side to a Zoho webhook, with per-IP rate
  limiting and payload validation.
- SEO: per-route meta tags, sitemap, robots.txt, JSON-LD.
- Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy) via
  `public/_headers`.
- Mobile startup performance pass (deferred analytics, non-blocking font
  loading, route-based code splitting).
- `docs/` directory with architecture, tech stack, current-state, and
  performance documentation.
- `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`.
- Commit hygiene tooling: husky + lint-staged + commitlint enforcing
  Conventional Commits.
- `.github/PULL_REQUEST_TEMPLATE.md` and issue templates.
- `.nvmrc` and `engines.node` pin matching CI's Node 20.

### Changed
- Rewrote `README.md` to match the current CMS/Cloudflare-Worker
  architecture (previously described a static-only, no-CMS site).
- Relocated `CMS_IMPLEMENTATION_GUIDE.md`, `ERROR_HANDLING_GUIDE.md`, and
  `PRODUCTION_DEPLOYMENT_GUIDE.md` into `docs/guides/`; corrected stale
  GitHub Pages/Cloudflare Pages references in the latter two.
- Relocated the four security audit documents into `docs/security/` and
  annotated each finding with its current resolution status.
- Renamed `.github/workflows/deploy.yml` to `ci.yml` to match its actual
  behavior (lint/build/audit, no deploy step).
- Moved `cms-content-seed.sql` and `project-seed.sql` into
  `scripts/cms/seed/`.
- Fixed `.stylelintr` → `.stylelintrc` (config was not being auto-discovered).

### Removed
- `src/services/api/apiClient.js` — unused fetch wrapper, zero imports.
- `functions/api/contact.js` — legacy Cloudflare Pages Functions handler
  superseded by the Hono route in `src/worker.js`.
- Stray empty `output/playwright/` directory (no Playwright dependency
  exists in the project).
