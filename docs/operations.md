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
| `TURNSTILE_SITE_KEY` | Public runtime sitekey for the environment-specific contact-form widget. Preview and production use different keys. |
| `RESEND_FROM_EMAIL` | Sender address for the lead-notification email (defaults to `hello@devlabstudios.com`). |
| `LEAD_NOTIFICATION_EMAIL` | Recipient address for the lead-notification email (defaults to `hello@devlabstudios.com`). |

## Secrets (set via Cloudflare dashboard or `wrangler secret put` — never in the repo)

| Secret | Used by | Purpose |
|---|---|---|
| `RESEND_API_KEY` | `POST /api/contact` (background delivery, see below) | Resend API key used to send the lead-notification email. Intentionally unset in Preview. |
| `TURNSTILE_SECRET_KEY` | `POST /api/contact` | Environment-specific server-side verification secret. Deployed requests fail closed when it is unset. |
| `ADMIN_SESSION_SECRET` | `adminAuth.js` | HMAC key signing the admin session cookie. |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` | `adminAuth.js` | Single-admin credential pair (PBKDF2 hash format — see `scripts/cms/hash-admin-password.mjs`). |
| `ADMIN_USERS` | `adminAuth.js` | Alternative to the pair above — a JSON array of `{email, passwordHash, role}` for multiple admins. Only one of this or the pair above is needed. |
| `CLOUDFLARE_API_TOKEN` | CI / manual `wrangler` use only | Never referenced by the app at runtime — explicitly kept out of `.env.example` per its own warning comment. |

## Build-time / frontend variables (`.env.local`, not runtime secrets)

| Variable | Purpose |
|---|---|
| `VITE_CONTACT_API_URL` | Overrides the contact form's submit target; defaults to `/api/contact`. |

## Leads backend (Phase 5)

`POST /api/contact` persists every submission to the `leads` table
*before* attempting delivery — this is the core reliability guarantee:
a Resend outage never loses a lead, it just leaves it in `status: failed`,
retryable from `/admin/leads`. The Resend delivery attempt itself runs
in the background via `Astro.locals.cfContext.waitUntil()` (Astro 6.2+'s
Cloudflare-forwarded `ExecutionContext.waitUntil`, not the older/removed
`locals.runtime.ctx` pattern), so the visitor's response doesn't wait on
it. Every attempt (the automatic first one and any manual admin retry)
is recorded in `delivery_attempts` — see `src/worker/leadDelivery.js`.

There's no Cloudflare Queue involved: `@astrojs/cloudflare`'s generated
Worker entry only exports `fetch`, with no hook for a `queue()` consumer
export, so genuine Queue-based retry would require a second,
independently-deployed Worker. Given this site's scale, `waitUntil` +
durable D1 persistence + manual retry was chosen instead — see the
git history around the Phase 5 commits for the fuller tradeoff.

Submissions with the same email + message within a 5-minute window are
treated as the same inquiry (`findRecentDuplicateLead`) — no new lead
or delivery attempt, so double-clicks and retry-after-timeout don't
spam Resend or the admin Leads list.

### Turnstile setup

The contact form uses explicit widget rendering with the action
`contact_form`. The backend validates every deployed token through
Siteverify and also verifies its hostname and action. Tokens are treated as
single-use, widget expiration and failures reset cleanly, and a short
Siteverify timeout prevents an upstream outage from hanging the form.

Provision two Managed widgets:

1. Preview: allow only `devlab-studios-preview.stpnrey-agustinez.workers.dev`.
2. Production: allow only the canonical production hostname(s).
3. Put each public sitekey in that environment's `wrangler.jsonc` `vars` as
   `TURNSTILE_SITE_KEY`.
4. Set each matching secret with `wrangler secret put TURNSTILE_SECRET_KEY`
   (add `--env preview` for Preview).

Deployed environments fail closed when either value is missing. Localhost
alone uses Cloudflare's published always-pass test sitekey and may omit the
secret so browser tests can run without production credentials.

Maintenance mode is a runtime check (`src/middleware.ts`), not a build-time flag: it reads the `maintenance_mode` key from the `site_settings` D1 table on every request to `/`, `/about`, `/experiences`, `/services`, `/portfolio`, `/profile`, and `/resources*`, rewriting to `/maintenance` when set. Toggle it with `wrangler d1 execute` against `site_settings` (or the future admin Site Settings screen) — no redeploy required.

## Local test/dev fixtures

- `.dev.vars` (gitignored): local-only `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_SESSION_SECRET`/`RESEND_API_KEY` values used by `wrangler dev --local` and the Playwright `admin.spec.js` suite. `RESEND_API_KEY` is set to a deliberately-invalid placeholder so local/test runs never send a real email. Not real credentials — safe to regenerate at will via `npm run cms:hash-admin-password`.
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

## Preview/production isolation (Phase 6)

`wrangler.jsonc` now has an `env.preview` block with its own Worker name
(`devlab-studios-preview`), D1 database, and R2 bucket — separate from
production's `devlab-studios` in every way, so preview can never read,
write, or leak production leads, content, or secrets.

**The one-time provisioning is not done yet** — the API token available
when this was set up couldn't create D1 databases or R2 buckets
(`wrangler d1 create` / `wrangler r2 bucket create` both failed with a
permissions error), so `wrangler.jsonc`'s `env.preview.d1_databases[0].database_id`
and `env.preview.vars.R2_PUBLIC_BASE_URL` are still placeholders. See
`docs/deployment.md`'s "Preview environment setup" for the exact commands
to run once a sufficiently-privileged token is available, and
`docs/architecture/decisions/0005-preview-environment-build-time-env.md`
for why `CLOUDFLARE_ENV=preview` has to be set on the **build** command
rather than passed as `--env preview` to `wrangler deploy` — a
non-obvious consequence of how `@astrojs/cloudflare` bakes bindings in at
build time.

Preview needs its own values for every secret in the table above except
`RESEND_API_KEY`, which is intentionally left unset so preview and e2e
runs never send a real email (leads still persist to D1 with a failed
delivery attempt): `ADMIN_SESSION_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`,
`TURNSTILE_SECRET_KEY` — set with `wrangler secret
put <NAME> --env preview`, never copied from production. Turnstile must use a
separate Preview widget and secret, not the Production pair.
