# Performance/Accessibility Baseline — 2026-08-04

Captured the same way as `../baseline-2026-07-31/README.md`, after enabling the Cloudflare Images binding, wiring optimized `<picture>` markup through the portfolio/certification islands, and reducing Safari compositing cost (see `docs/superpowers/plans/2026-08-04-cross-platform-performance.md`).

| Page | Performance (before → after) | LCP (before → after) | CLS (before → after) | Total weight (before → after) |
|---|---|---|---|---|
| `/` (Home) | 73 → 73 | 3.7s → 3.2s | 0.237 → 0.057 | 583 KiB → 488 KiB |
| `/profile` | 57 → 71 | 5.4s → 3.3s | 0.236 → 0.025 | 862 KiB → 1,788 KiB |
| `/resources` | 77 → 79 | 2.9s → 2.7s | 0.236 → 0.044 | 382 KiB → 360 KiB |

Raw reports: `home.report.{html,json}`, `profile.report.{html,json}`, `resources.report.{html,json}`.

## Reading these numbers

- **CLS is fixed everywhere** — the ~0.236 layout-shift problem identified in the 2026-07-31 baseline is gone on all three pages (down to 0.025–0.057), consistent with the width/height and compositing fixes made in this plan.
- **LCP improved substantially on `/` and `/profile`** (3.7s→3.2s, 5.4s→3.3s) and modestly on `/resources` (2.9s→2.7s), matching the image-optimization and GPU-compositing work.
- **`/profile`'s total weight got worse, not better (862 KiB → 1,788 KiB), and this is a real regression worth flagging before merge.** Root cause: `src/lib/content/profile.ts`'s `resolveBadgeImages()` collapses each imported certificate badge (`ImageMetadata` objects with the width/height/format Astro's image service needs) down to a plain `.src` string before `attachOptimizedBadges()` passes it into `optimizeImage()` — unlike `src/pages/profile.astro`'s profile-photo call, which correctly passes the full `ImageMetadata` object. Losing that metadata means the Cloudflare Images transform never actually runs for the three certification badges (Zapier/Make/n8n): the `<picture>` element's avif/webp `<source>` srcsets resolve to the same untransformed URL as the fallback `<img>`, so the browser ends up downloading the raw, un-resized PNGs directly from `/_astro/*.png` — 420–454 KB each, ~1.3 MB combined, confirmed via this run's `profile.report.json` `network-requests` audit (`N8N_Certificate.*.png`, `Zapier_Certificate.*.png`, `Make_Certificate.*.png` all served at full size with no `/_image?...` query string, versus the profile photo which correctly loads as an 11.9 KB AVIF through `/_image?href=...&f=avif`). Despite this, `/profile`'s Performance score and LCP/CLS still improved — the badges sit below the fold and load lazily, so they don't hurt the metrics that matter most, but they do inflate total page weight well past the pre-rebuild baseline. This is outside Task 10's file-touch scope (`playwright.config.js` + this docs directory only) and is reported here, not fixed, for the whole-branch reviewer to weigh in on.
- These were captured the same way as the 2026-07-31 baseline: locally against `npm run build && npm run preview`, single run, no throttling profile pinned, `--preset=perf` (accessibility category not included in this run) — treat as directional, not lab-grade.
