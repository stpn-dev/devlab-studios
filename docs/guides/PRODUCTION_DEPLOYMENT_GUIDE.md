# Production Deployment Guide (Cloudflare Worker + GitHub)

> Moved into `docs/guides/` and corrected during the 2026-07-30 housekeeping
> pass. Previously this doc described a "Cloudflare Pages + `_redirects`"
> deployment model; the project actually deploys as a single Cloudflare
> **Worker** (`wrangler.jsonc`, `main: src/worker.js`) serving both the built
> static assets and the API — see
> [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md).

## Scope

This project is deployed as a Cloudflare Worker, connected to GitHub for
continuous deployment on pushes to `main`.

## 1. Cloudflare Setup

1. Open Cloudflare Dashboard → Workers & Pages → Create application → connect
   the `stpn-dev/devlab-studios` repository.
2. Cloudflare reads build config from `wrangler.jsonc` in the repo:
   - Worker entry: `src/worker.js`
   - Static assets: `./dist` (SPA fallback via `not_found_handling`)
   - Build command: `npm run build`
3. Set production branch to `main`.

## 2. Environment Variables / Bindings (Cloudflare)

In the Worker's Settings → Variables and Secrets, configure:

- `ZOHO_WEBHOOK_URL` (Secret) — contact form upstream
- `ADMIN_SESSION_SECRET` (Secret) — signs admin session cookies
- `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (or `ADMIN_USERS` JSON, or
  `ADMIN_AUTH_MODE=cloudflare-access` to use Cloudflare Access instead —
  see `src/worker/middleware/adminAuth.js`)
- `R2_PUBLIC_BASE_URL` — public base URL for the `MEDIA_BUCKET` R2 bucket
- `VITE_MAINTENANCE_MODE` (optional, `false` by default)

Bindings (`wrangler.jsonc`): D1 database `devlab-studios-cms` (binding `DB`),
R2 bucket `devlab-studios` (binding `MEDIA_BUCKET`).

Notes:
- Do not store secrets in repository files — use the Cloudflare dashboard or
  `wrangler secret put`.
- Rotate the Zoho webhook URL/admin credentials immediately if ever exposed.

## 3. Routing and Headers

- **SPA routing**: handled by `wrangler.jsonc`'s
  `assets.not_found_handling: "single-page-application"` — there is no
  `public/_redirects` file; unmatched paths fall through to `index.html` at
  the Worker level.
- **Security headers**: `public/_headers` applies CSP + hardening headers
  (copied into `dist/` at build time and served for matching paths).

## 4. GitHub Workflow Behavior

GitHub Actions is CI-only (lint/build/`npm audit`) — see
`.github/workflows/ci.yml`. Deployment itself is triggered by Cloudflare's own
Git integration on pushes to `main`, not by the GitHub Actions workflow.

## 5. Pre-Deployment Checklist

- `npm ci`
- `npm run lint`
- `npm run build`
- `npm run preview` — sanity-check the production build locally (note: preview
  mode has no Worker runtime, so D1/R2-backed admin features show
  static-fallback/read-only behavior only)
- Validate the contact form against a staging Zoho endpoint if possible
- Verify no sensitive values are present in tracked files (`.env.example`
  should only ever contain placeholders)

## 6. Post-Deployment Verification

After Cloudflare deploy completes:

1. Open the production URL and test routes directly: `/`, `/about`,
   `/services`, `/profile`, `/resources`, `/contact` (and confirm
   `/experiences`, `/portfolio` redirect to `/profile`).
2. Check response headers (CSP, `x-content-type-options`,
   `strict-transport-security`, `referrer-policy`, `permissions-policy`).
3. Test contact form submission end-to-end.
4. Check `/api/health` reports the expected `hasDb`/`hasMediaBucket` state.

## 7. Rollback

1. Revert the problematic commit in GitHub.
2. Push to `main`.
3. Cloudflare triggers a new deployment automatically.
4. Optionally promote a previous successful deployment from the Cloudflare
   dashboard.

## 8. Ongoing Security Hygiene

- Run `npm audit --omit=dev --audit-level=high` regularly (also runs in CI).
- Rotate the Zoho endpoint/admin credentials periodically.
- Keep the CSP in `public/_headers` updated when adding new external
  services/scripts.
- Keep dependencies up to date.
