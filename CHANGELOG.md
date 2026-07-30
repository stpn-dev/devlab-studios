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

### Fixed
- `scripts/cms/hash-admin-password.mjs` now only emits PBKDF2 hashes (removed
  the weak single-round SHA-256 default), always prompts interactively with
  masked input, and requires a confirmation entry instead of accepting the
  password as a CLI argument.
- Patched 4 of 5 high-severity `react-router`/`react-router-dom` CVEs by
  bumping to 7.18.2 (within the existing `^7.11.0` range, non-breaking). The
  5th (`GHSA-qwww-vcr4-c8h2`, an RSC-mode CSRF bypass) has no fix until
  react-router 8.3.0, which `react-router-dom` hasn't published; it only
  affects apps using React Router's unstable RSC APIs, which this app does
  not use — allowlisted in `audit-ci.json` with justification recorded in
  `docs/CURRENT_STATE.md`.
- Replaced the CI `npm audit` step with `audit-ci` so a single allowlisted
  advisory can't mask a future, real one.

### Removed
- Deleted stale, superseded remote branches `cloudflare/workers-autoconfig`
  and `copilot/fix-error-in-actions` (both one-off bot-generated branches
  from 2026-03-10, fully absorbed into `main` already).

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
