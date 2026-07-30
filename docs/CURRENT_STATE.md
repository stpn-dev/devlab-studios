# Current State

Snapshot as of 2026-07-30, written as part of a repo housekeeping/documentation
pass. Replaces the stale "Known Limitations" section that used to live in
`README.md` (which incorrectly described the site as having no CMS/backend).

## What's implemented

- Public site: Home, About, Services, Profile, Resources (+ dynamic
  `/resources/:slug`), Contact, five `/landing-sample-*` marketing pages, 404
  and Maintenance pages. `/experiences` and `/portfolio` redirect to `/profile`
  (legacy route aliases).
- Custom CMS: Cloudflare D1 + R2 + Hono backend, admin UI at `/admin` (built on
  Refine) for managing projects, services, resources, profile content, site
  settings, and SEO metadata. See
  [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md).
- Every content-bearing page falls back to bundled static content
  (`src/data/*.js`) when D1 has no data for that page, so the CMS can be
  populated incrementally without breaking the site.
- Contact form proxied server-side to a Zoho webhook, with basic per-IP rate
  limiting and payload validation.
- Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy) applied via
  `public/_headers`; `/admin*` and `/api/admin/*` marked `noindex`.
- SEO: per-route meta tags via `react-helmet-async`, `sitemap.xml`,
  `robots.txt`, JSON-LD (per prior `feat: implement comprehensive SEO
  optimizations` commit).

## Dependency security

CI runs `npx audit-ci --config audit-ci.json` (replacing plain `npm audit` on
2026-07-31) against production dependencies. One advisory is allowlisted:

- **`GHSA-qwww-vcr4-c8h2`** (react-router, RSC-mode CSRF bypass) — fixed only
  in react-router 8.3.0, but `react-router-dom` (the package this app actually
  imports) has not published a v8 release, so there is no available
  non-breaking fix. The advisory explicitly states it only affects apps using
  React Router's unstable RSC (React Server Components) APIs — this app uses
  none (plain `createBrowserRouter`/`RouterProvider`, no RSC). Revisit and
  remove the allowlist entry once `react-router-dom` ships a fixed release, or
  when evaluating a move to the unified `react-router` v8+ package.

## Known issues / limitations

- **No SSR/SSG** — pure client-side rendering; see
  [performance/PERFORMANCE_FINDINGS.md](./performance/PERFORMANCE_FINDINGS.md).
- **No automated tests** — no unit, integration, or E2E test suite exists.
- **Images are unoptimized** — 6.2 MB of largely uncompressed PNGs in
  `src/assets/`.
- **In-memory rate limiting** (`src/worker.js`, `contactAttempts` Map) resets
  on every Worker cold start/redeploy — not persistent across instances.
- **No `engines`/`.nvmrc` pin** despite CI assuming Node 20 (fixed as part of
  this housekeeping pass).

## Dead code inventory

Identified during this audit and removed as part of housekeeping:

- `src/services/api/apiClient.js` — a fetch wrapper with normalized error
  handling; confirmed zero imports anywhere in `src/`. Superseded by the
  simpler `src/utils/cachedFetch.js` actually used by the content hooks.
- `functions/api/contact.js` — a Cloudflare Pages Functions-style handler for
  `/api/contact`, duplicating the Hono route already defined in
  `src/worker.js` (`app.post('/api/contact', handleContact)`). `wrangler.jsonc`
  deploys `src/worker.js` as the Worker entry point (not a Pages Functions
  build), so this file was never reachable in production.

## Recommended follow-ups (not actioned in this pass)

These were identified during the audit but intentionally left for a separate,
explicit decision rather than being changed automatically:

- ~~**Stale remote branches** — `origin/cloudflare/workers-autoconfig` and
  `origin/copilot/fix-error-in-actions`~~ **Done (2026-07-31).** Both were
  one-off bot/agent-generated branches (Cloudflare's dashboard auto-config
  proposal and a GitHub Copilot CI-fix attempt, both from 2026-03-10, both
  fully superseded by later manual commits on `main`) and have been deleted
  from `origin`.
- **`screenshots/` folder** — currently tracked in git (~800 KB of ad-hoc QA
  PNGs). Recommend either untracking + gitignoring it, or moving it into
  `docs/` if it's meant to be an intentional documentation asset.
- **`@types/react` / `@types/react-dom`** devDependencies are vestigial in a
  non-TypeScript project — consider removing, or treat as a signal to
  eventually migrate to TypeScript.
- **No test suite** — consider adopting Vitest (unit) and/or Playwright (E2E)
  for the critical user flows (contact form, admin login, navigation).
- **Framework evaluation (Astro or otherwise)** — the next planned step after
  this housekeeping pass; see
  [performance/PERFORMANCE_FINDINGS.md](./performance/PERFORMANCE_FINDINGS.md)
  for the data that evaluation should start from.
