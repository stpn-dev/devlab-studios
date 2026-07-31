# Performance/Accessibility Baseline — 2026-07-31

Captured with `npx lighthouse` against the production build (`npm run build && npm run preview`) immediately before the Astro/CMS rebuild program started (Phase 0 of `docs/architecture/ARCHITECTURE.md`'s successor plan). Purpose: a concrete "before" snapshot to compare each Phase 3 page conversion against, and to hold the rebuild accountable for the performance/accessibility claims that motivated it.

| Page | Performance | Accessibility | LCP | CLS | Total weight |
|---|---|---|---|---|---|
| `/` (Home) | 73 | 100 | 3.7s | 0.237 | 583 KiB |
| `/profile` | 57 | 100 | 5.4s | 0.236 | 862 KiB |
| `/resources` | 77 | 100 | 2.9s | 0.236 | 382 KiB |

Raw reports: `home.report.{html,json}`, `profile.report.{html,json}`, `resources.report.{html,json}`.

## Reading these numbers

- **Accessibility is already 100 on all three** — the rebuild should not regress this; it's a floor, not a target to hit.
- **CLS (~0.236 everywhere) is a real, consistent problem** independent of LCP — worth root-causing early in Phase 3 (likely web-font swap and/or images rendering without reserved dimensions), not just assumed to disappear once SSR lands.
- **Profile is the worst performer** (57, 5.4s LCP, heaviest payload) — matches the earlier finding that it's the most complex page (most images, most client state). Expect the largest measurable win here once it's converted and its images move to `astro:assets`.
- These were captured locally against `vite preview` (static build, no live D1/Worker), single run, no throttling profile pinned — treat as directional, not lab-grade. Re-run the same three pages the same way after each relevant Phase 3 conversion for a fair comparison.
