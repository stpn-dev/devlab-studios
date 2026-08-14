# Security

Written as part of Phase 6 (deployment & hardening) of the Astro/CMS
rebuild program, against the codebase as it exists today. Supersedes
`docs/security/*.md`, which were written against the pre-rebuild Vite SPA
(and already carry a 2026-07-30 annotation pass noting what's since
changed) — kept for history, not as current guidance.

## Security headers

Every response now carries these headers, applied in `src/middleware.ts`
via `src/lib/securityHeaders.ts`:

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | Restricts script/style/frame/connect sources |
| `X-Content-Type-Options` | `nosniff` | Blocks MIME-sniffing attacks |
| `X-Frame-Options` | `DENY` | This site is never meant to be framed by anyone |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Don't leak full URLs to third parties |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | No use for any of these |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | HTTPS is already enforced by `src/middleware.ts`'s canonical-domain redirect; this tells browsers to skip the plaintext round-trip entirely next time |
| `X-Robots-Tag` | `noindex, nofollow` on `/admin*` and `/api/admin/*`; `noindex, follow` on `/landing-sample-*` | Keep the admin surface and demo pages out of search results |

**Why middleware, not `public/_headers`**: `public/_headers` (Cloudflare
Pages-style headers file) only applies to responses served directly from
the static ASSETS binding. With `output: 'server'`, almost everything a
visitor actually loads — every real page, `/admin`, every `/api/*` route
— is server-rendered through Astro instead, so `_headers`' page-level
rules never reached them. This was confirmed directly: building and
curling the homepage showed zero security headers despite `_headers`
declaring a `/*` rule for exactly this. `_headers` still exists and still
correctly covers the genuinely-static leftovers (`/_astro/*` bundles,
`robots.txt`, `sitemap.xml`), kept in sync with the CSP in middleware as a
redundant safety net, not the source of truth.

### CSP allowances and why each exists

```
default-src 'self'
script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com
connect-src 'self' https://*.zohopublic.com https://*.zoho.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://challenges.cloudflare.com
img-src 'self' data: https:
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
font-src 'self' https://fonts.gstatic.com data:
frame-src 'self' https://challenges.cloudflare.com
object-src 'none'
base-uri 'self'
frame-ancestors 'none'
form-action 'self'
upgrade-insecure-requests
```

- `'unsafe-inline'` on `script-src`/`style-src`: the JSON-LD structured
  data block and Tailwind's inline critical styles aren't nonced. Tightening
  this would need a nonce/hash pipeline wired through Astro's SSR
  rendering — not done yet, tracked as a follow-up, not a silent gap.
- `googletagmanager.com` / `google-analytics.com`: GA4 (see
  `docs/operations.md` for the measurement ID).
  (The Resend delivery call happens server-side in
  `src/worker/leadDelivery.js` and isn't subject to browser CSP at all, so
  no `connect-src` entry is needed for it.)
- `challenges.cloudflare.com` on `script-src`, `connect-src`, and
  `frame-src`: Cloudflare Turnstile (see `docs/operations.md`'s "Turnstile
  setup"). Added in this pass — the original CSP predates Phase 5 and
  would have silently blocked the widget the first time headers actually
  applied to a real page load.

Confirmed via `tests/e2e/public-pages.spec.js`'s "security headers apply
to real, server-rendered responses" and "the contact form CSP allows
Turnstile to actually load" tests — the latter listens for CSP violation
console messages while the widget loads, so a future CSP regression here
fails a test instead of silently breaking the contact form.

## Authentication

- **Admin** (`/admin`, `/api/admin/*`): `ADMIN_AUTH_MODE` selects between
  `password` (PBKDF2 hash + HMAC-signed session cookie,
  `src/worker/middleware/adminAuth.js`) and `cloudflare-access` (delegates
  to Cloudflare Zero Trust at the edge — see `docs/operations.md`
  for how to switch). Every `/api/admin/*` route is gated by the same
  `requireAdmin` check in `src/middleware.ts`, regardless of mode.
- **Public API**: no auth (by design — `/api/contact`, `/api/services`,
  etc. are meant to be publicly readable/submittable), protected instead
  by rate limiting and, for `/api/contact`, Turnstile + D1-backed dedup
  (see `docs/operations.md`'s "Leads backend" section).

## Secrets

Never committed — see `docs/operations.md`'s secrets table for the full
list and `.env.example` for local dev placeholders. Preview and
production must use **different** values for every secret (see
`docs/deployment.md`'s "Preview environment setup") — reusing production's
admin password in preview would defeat the entire point of having a
separate environment. `RESEND_API_KEY` is a special case: it is
intentionally left **unset** in Preview entirely, rather than given a
different value, so preview/e2e runs can never send a real email.

## Rate limiting

`src/pages/api/contact.ts` keeps an in-memory per-IP counter
(`isContactRateLimited`) as a first line of defense — explicitly *not*
durable across Worker isolates, cheap, and backed up by Turnstile and the
D1-backed duplicate check for anything it misses. No other public route
currently rate-limits; none of them (services/resources/profile/site-settings
reads, project reads) do anything expensive enough server-side to be worth
it yet.

## Known gaps (tracked, not silently ignored)

- CSP `'unsafe-inline'` (see above) — would need a nonce pipeline.
- No WAF/bot-management rules configured beyond Turnstile on the one form
  that needs it — not needed at this site's current traffic scale.
- Preview environment isolation is documented and configured in
  `wrangler.jsonc`, but the actual Cloudflare resources (a second D1
  database and R2 bucket) haven't been provisioned yet — the API token
  available while writing this lacked the permissions to create them. See
  `docs/deployment.md`'s "One-time setup" for the exact commands to run
  once a sufficiently-privileged token is available.
