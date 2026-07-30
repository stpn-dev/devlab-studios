# Performance Findings

Findings from a codebase audit conducted 2026-07-30, ahead of a planned
evaluation of whether a static-site framework (e.g. Astro) would resolve the
site's perceived slowness and inconsistent responsiveness across screen sizes.
This document records **findings only** — it does not recommend or decide on a
framework migration. See [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md)
for how the current system works.

## 1. No SSR/SSG — pure client-side rendering

`index.html` ships an empty `<div id="root">`. Every visitor's browser must
download, parse, and execute JS before any content appears. There is no
prerendering step in `vite.config.js` and no edge-rendering in
`src/worker.js` beyond serving the static bundle. This is the single largest
architectural factor behind "slow to load" — it's a first-paint problem, not
a bundle-size problem.

## 2. Double-render content model

Every content-bearing page fetches its own data twice conceptually (see
[ARCHITECTURE.md § Request flow: public pages](../architecture/ARCHITECTURE.md)):
static fallback renders instantly, then a `useEffect` fetch to `/api/*` may
swap the content in on D1 hit. This means:

- An extra network round-trip after first paint on every page, for content
  that (currently) rarely differs from the static fallback.
- A visible re-render/flash if D1 content differs from the bundled fallback.
- No caching of the "is this page CMS-managed yet" decision — it's
  re-evaluated on every navigation.

## 3. Unoptimized images (largest concrete cost)

- `src/assets/` totals **6.2 MB**, shipped essentially as-is into
  `dist/assets/`. Several files are 200–450 KB as plain PNGs with no
  compression pass: `recent-photo.png` (484 KB), three certificate images
  (420–450 KB each), multiple project screenshots (200–330 KB each).
- No responsive images (`srcset`/`sizes`/`<picture>`), no build-time image
  optimization (no `sharp`, `imagemin`, `astro:assets`, or equivalent).
- `loading="lazy"` is applied inconsistently — present on some gallery images
  in `PortfolioRow.jsx`/`ImageModal.jsx`, absent on others.
- By contrast, CMS-uploaded project images (via `/api/admin/media`) are
  already restricted to WebP — new content is better optimized than the
  legacy bundled assets.

## 4. GPU/compositing cost on mobile

13 uses of `backdrop-blur-*` Tailwind utilities across `GlassCard.jsx`,
`MainLayout.jsx` (decorative blurred circles), `Navbar.jsx`, `PortfolioRow.jsx`,
`ImageModal.jsx`, and `Admin.jsx`. Backdrop blur is a known compositing cost,
particularly on lower-end mobile GPUs — a plausible contributor to reports of
jank on some devices even though bundle/network cost is unaffected.

## 5. What is already reasonably optimized

To avoid over-correcting: the following are already implemented well and
should be preserved in any future change:

- Route-based code splitting (`React.lazy` per page in `src/App.jsx`) plus
  manual vendor chunking in `vite.config.js`.
- Deferred, non-blocking Google Fonts loading (`index.html`) and deferred
  analytics (`gtag.js` loaded on `window.load` via `requestIdleCallback`,
  explicitly commented as tuned for mobile first-render).
- HTTP caching headers on public content endpoints
  (`Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400`
  in `src/worker.js`).
- The admin/CMS bundle (Refine, ~319 KB chunk) is isolated via lazy-loading
  and never loaded by public visitors.
- A recent commit (`perf: reduce mobile startup work`) shows prior, ongoing
  attention to mobile performance.

## Summary for the framework evaluation

The two biggest, framework-independent wins available regardless of what's
decided about Astro are **image optimization** and **collapsing the
static+fetch double-render** into a single content source. Whether solved by
adopting a static-site framework with build-time asset pipelines and
prerendering, or by optimizing the current Vite/React setup directly, is the
subject of the separate follow-up evaluation.
