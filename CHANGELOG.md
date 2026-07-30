# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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

## [1.0.0] - 2026-07-30

Baseline release. Versioning and changelog tracking start here — prior
history was not tagged and is summarized from `git log` rather than
itemized commit-by-commit.

### Added
- Portfolio pages: Home, About, Services, Profile, Resources
  (with dynamic `/resources/:slug`), Contact, and five
  `/landing-sample-*` marketing/demo pages.
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
