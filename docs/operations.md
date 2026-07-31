# Operations — Environment Variables & Bindings

Snapshot as of 2026-07-31, taken as Phase 0 of the Astro/CMS rebuild program (see the approved plan for context). Names only — no values. Source of truth for values is the Cloudflare dashboard (Workers & Pages → `devlab-studios` → Settings → Variables and Secrets) and `.dev.vars` locally (gitignored, never committed).

## Cloudflare bindings (`wrangler.jsonc`)

| Binding | Type | Resource |
|---|---|---|
| `DB` | D1 database | `devlab-studios-cms` |
| `MEDIA_BUCKET` | R2 bucket | `devlab-studios` |
| `ASSETS` | Static assets | `./dist` (SPA fallback) |

## Runtime variables (non-secret, in `wrangler.jsonc` → `vars`)

| Variable | Purpose |
|---|---|
| `ADMIN_AUTH_MODE` | `password` \| `cloudflare-access` \| `disabled` — selects the admin auth strategy in `src/worker/middleware/adminAuth.js`. Currently `password`. |
| `R2_PUBLIC_BASE_URL` | Public base URL used to build absolute links to R2-hosted media. |

## Secrets (set via Cloudflare dashboard or `wrangler secret put` — never in the repo)

| Secret | Used by | Purpose |
|---|---|---|
| `ZOHO_WEBHOOK_URL` | `POST /api/contact` | Upstream contact-form delivery target. |
| `ADMIN_SESSION_SECRET` | `adminAuth.js` | HMAC key signing the admin session cookie. |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` | `adminAuth.js` | Single-admin credential pair (PBKDF2 hash format — see `scripts/cms/hash-admin-password.mjs`). |
| `ADMIN_USERS` | `adminAuth.js` | Alternative to the pair above — a JSON array of `{email, passwordHash, role}` for multiple admins. Only one of this or the pair above is needed. |
| `CLOUDFLARE_API_TOKEN` | CI / manual `wrangler` use only | Never referenced by the app at runtime — explicitly kept out of `.env.example` per its own warning comment. |

## Build-time / frontend variables (`.env.local`, not runtime secrets)

| Variable | Purpose |
|---|---|
| `VITE_CONTACT_API_URL` | Overrides the contact form's submit target; defaults to `/api/contact`. |
| `VITE_MAINTENANCE_MODE` | Baked into the client bundle at build time — gates 6 routes to the Maintenance page. **Phase 3 replaces this with a runtime check**; this variable goes away once that ships. |

## Local test/dev fixtures

- `.dev.vars` (gitignored): local-only `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_SESSION_SECRET`/`ZOHO_WEBHOOK_URL` values used by `wrangler dev --local` and the Playwright `admin.spec.js` suite. Not real credentials — safe to regenerate at will via `npm run cms:hash-admin-password`.
- Local D1: `npx wrangler d1 migrations apply devlab-studios-cms --local` applies `migrations/*.sql` to a local SQLite file under `.wrangler/` (gitignored).

## Other non-secret, hardcoded values worth knowing about

- GA4 Measurement ID (`G-MD3PL91M9G`) is hardcoded in `index.html` — GA IDs are meant to be public, not a secret.
- `compatibility_date`/`compatibility_flags` in `wrangler.jsonc` are deployment config, not environment-specific.

## Preview/production isolation (Phase 6 target — not yet in place)

Today there is one environment: whatever the Cloudflare dashboard's single Workers Builds project points at. Phase 6 of the rebuild plan introduces a real `local`/`preview`/`production` split, where preview must never share production's D1 database, R2 bucket, Zoho webhook, Queues, or secrets. This document should gain a second table per environment once that split exists.
