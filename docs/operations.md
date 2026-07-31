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

Maintenance mode is a runtime check (`src/middleware.ts`), not a build-time flag: it reads the `maintenance_mode` key from the `site_settings` D1 table on every request to `/`, `/about`, `/experiences`, `/services`, `/portfolio`, `/profile`, and `/resources*`, rewriting to `/maintenance` when set. Toggle it with `wrangler d1 execute` against `site_settings` (or the future admin Site Settings screen) — no redeploy required.

## Local test/dev fixtures

- `.dev.vars` (gitignored): local-only `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_SESSION_SECRET`/`ZOHO_WEBHOOK_URL` values used by `wrangler dev --local` and the Playwright `admin.spec.js` suite. Not real credentials — safe to regenerate at will via `npm run cms:hash-admin-password`.
- Local D1: `npx wrangler d1 migrations apply devlab-studios-cms --local` applies `migrations/*.sql` to a local SQLite file under `.wrangler/` (gitignored).

## Other non-secret, hardcoded values worth knowing about

- GA4 Measurement ID (`G-MD3PL91M9G`) is hardcoded in `index.html` — GA IDs are meant to be public, not a secret.
- `compatibility_date`/`compatibility_flags` in `wrangler.jsonc` are deployment config, not environment-specific.

## Switching admin auth to Cloudflare Access

The code path (`src/worker/middleware/adminAuth.js`'s `cloudflare-access`
branch) has existed since Phase 1 and needs no application changes to use
— Phase 4's admin rebuild (new shell, schema-driven forms, versioning)
goes through the same `requireAdmin` gate in `src/middleware.ts`
regardless of mode, so switching modes doesn't touch any admin screen.
What's actually required is Cloudflare-side configuration this repo can't
perform on its own:

1. In the Cloudflare dashboard, go to **Zero Trust → Access → Applications**
   and add a **Self-hosted** application covering `admin.devlabstudios.com/*`
   or `www.devlabstudios.com/admin*` (and `/api/admin/*`) — whichever
   matches how `/admin` is actually served.
2. Add at least one **policy** (e.g. "Allow" for a specific email or your
   Google/GitHub identity) — Access enforces this at the edge, before any
   request reaches the Worker.
3. Set `ADMIN_AUTH_MODE=cloudflare-access` in `wrangler.jsonc`'s `vars` (or
   leave `ADMIN_AUTH_MODE` unset with no `ADMIN_SESSION_SECRET`/admin
   credentials configured — `getAdminAuthMode()` falls back to
   `cloudflare-access` in that case too).
4. Once Access is enforcing the policy, every request reaching the Worker
   already carries `cf-access-authenticated-user-email`, so
   `requireAdmin` passes and `GET /api/admin/session` returns immediately
   — the admin app's login screen is only ever seen if Access itself isn't
   actually in front of `/admin`, e.g. a misconfigured policy.
5. `ADMIN_EMAIL` (if still set) is used as an optional extra check against
   the Access-authenticated email — remove it if you want to allow anyone
   the Access policy admits, or keep it to additionally pin one specific
   admin address.

Verify locally is not meaningful for this mode — Cloudflare Access is an
edge product, not something `wrangler dev` can simulate. Verification has
to happen against the real deployed Worker after the Access application
and policy are in place.

## Preview/production isolation (Phase 6 target — not yet in place)

Today there is one environment: whatever the Cloudflare dashboard's single Workers Builds project points at. Phase 6 of the rebuild plan introduces a real `local`/`preview`/`production` split, where preview must never share production's D1 database, R2 bucket, Zoho webhook, Queues, or secrets. This document should gain a second table per environment once that split exists.
