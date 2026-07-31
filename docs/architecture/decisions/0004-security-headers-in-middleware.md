# 4. Enforce security headers in middleware, not \_headers

**Status:** Accepted (Phase 6)

## Context

`public/_headers` (a Cloudflare Pages-style headers file, with a full
CSP, `X-Frame-Options`, HSTS, etc.) already existed, carried over from
before the Astro rebuild. During the Phase 6 security review it was
verified — not assumed — to actually still take effect: build the site,
run `wrangler dev --local`, and `curl` a real page. The homepage came
back with **zero** of the headers declared in `_headers`. Curling a
genuinely static file (`/robots.txt`, an `/_astro/*` bundle) showed them
correctly. The conclusion: `_headers` only ever applies to responses
served directly from the static ASSETS binding. With `output: 'server'`,
essentially every real response — every page, `/admin`, every `/api/*`
route — is instead rendered by Astro and passed through
`src/middleware.ts`, which `_headers` never reaches. This had been true
since the Phase 1 rendering migration; it just hadn't been checked until
now. It also meant the CSP's `script-src`/`connect-src`/`frame-src`
allowlist — written before Phase 5 — had no entry for
`challenges.cloudflare.com` (Turnstile), which would have silently
blocked the contact form's spam-protection widget the moment headers
started actually applying to the page that uses it.

## Decision

Apply the full header set in `src/middleware.ts` via
`src/lib/securityHeaders.ts`, on every response the middleware returns
(SSR pages, API responses, redirects — including the 301s from the
D1-backed redirect lookup and the canonical-domain redirect). Update the
CSP to allowlist `challenges.cloudflare.com` for Turnstile at the same
time, in both the middleware copy and `_headers` (kept in sync as a
redundant safety net for the genuinely-static leftovers it still does
correctly cover — `_headers` is not deleted, just no longer trusted as
the enforcement point for real pages).

## Consequences

- The site now actually ships CSP/HSTS/X-Frame-Options/etc. on the pages
  visitors and admins load — it did not before, despite `_headers`
  existing and looking correct.
- `/admin*` and `/api/admin/*` now correctly get `X-Robots-Tag: noindex,
  nofollow` (previously declared in `_headers` but, for the same reason,
  never actually applied, since `/admin` is SSR'd).
- New Playwright coverage
  (`tests/e2e/public-pages.spec.js`): one test asserts the headers on a
  real page/API/`/admin` response, a second listens for CSP violation
  console messages while the Turnstile widget loads on `/contact` — so a
  future CSP regression here fails a test instead of silently breaking
  the contact form the way the original gap would have.
