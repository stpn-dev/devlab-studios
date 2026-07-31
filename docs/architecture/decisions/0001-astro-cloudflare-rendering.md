# 1. Rewrite rendering with Astro + @astrojs/cloudflare

**Status:** Accepted (Phase 1, implemented through Phase 3)

## Context

The live site was a Vite + React 19 SPA with no SSR, deployed as a single
Cloudflare Worker (Hono) with D1 + R2. Every real content page
double-rendered: a static fallback shown first, then a client-side fetch
to the same Worker's API, then a swap if the data differed
(`docs/performance/PERFORMANCE_FINDINGS.md`). Content already lived in
D1, not Git, so a static-site-generation approach would have needed a
rebuild-on-every-edit pipeline just to get content live — a real cost for
no benefit over querying D1 per-request.

## Decision

Move to Astro (`output: 'server'`) with `@astrojs/cloudflare` as the sole
Worker, querying D1 directly in `.astro` frontmatter and API routes.
Follow Astro's own documented migration path for exactly this situation:
wrap the entire existing SPA as one `client:only` island first (zero
behavior change, immediately deployed on the new stack), then convert
pages to real `.astro` routes one at a time in production afterward,
rather than a big-bang rewrite.

`src/worker/repositories/*.js` (business logic) was already
framework-agnostic — only the Hono route-registration shell was
Hono-specific — so porting API routes to Astro's file-based convention
was a mechanical 1:1 re-wire (`docs/architecture/ARCHITECTURE.md`'s "API
layer" table), not a rewrite of logic.

## Consequences

- Eliminated the double-render cost entirely for every converted page.
- `src/lib/honoShim.js` bridges `adminAuth.js` (PBKDF2 + HMAC session
  signing, security-critical) to Astro's request model rather than
  rewriting it — turned out to be a fine permanent home, not just a
  migration stopgap (see Phase 4's note in `ARCHITECTURE.md`).
- New, real local-dev quirk: `astro dev`'s SSR pipeline hits an upstream
  "Missing field `moduleType`" bug in this Astro/adapter version
  combination. Use `astro build && astro preview` for anything requiring
  a clean start; `astro dev` still works for hot-reload during page work.
- The adapter's own build-time behavior (config baking, no Queue consumer
  support) turned out to have further non-obvious consequences — see
  ADRs 3 and 5.
