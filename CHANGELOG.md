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
