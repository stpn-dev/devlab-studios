# Tech Stack

Updated 2026-07-31 for the Astro/CMS rebuild (Phase 1). Check
`package.json`/`wrangler.jsonc` for the current source of truth.

## Frontend

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework/build tool | [Astro](https://astro.build/) | 7.1 | `output: 'server'`, `@astrojs/cloudflare` adapter |
| Legacy app (being incrementally replaced) | [React](https://react.dev/) | 19.2 | Wrapped as one `client:only` island (`src/AppIsland.jsx`) per Astro's own CRA-migration guidance; converted to real `.astro` pages one at a time in Phase 3 |
| Legacy routing | [React Router](https://reactrouter.com/) | 7.11 | Only inside the wrapped legacy island — being phased out in favor of Astro's file-based routing as pages convert |
| Styling | [Tailwind CSS](https://tailwindcss.com/) | 3.4 | Via `@astrojs/tailwind` (documented "legacy Tailwind 3" integration path — still functional, not planned for a v4 upgrade as part of this rebuild) |
| Icons | [Lucide React](https://lucide.dev/) | 0.562 | |
| SEO/meta tags (legacy island only) | [react-helmet-async](https://github.com/staylor/react-helmet-async) | 3.0 | Superseded by Astro's native `<head>`/frontmatter as each page converts in Phase 3 |
| Utility | [clsx](https://github.com/lukeed/clsx) | 2.1 | |
| Language | TypeScript | 6.0 (pinned) | Strict mode (`astro/tsconfigs/strict`) for all new code; existing `.jsx` stays JS until each page is rewritten in Phase 3 |

## Backend / API

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Worker runtime | `@astrojs/cloudflare` adapter | 14.1 | Generates the deployed Worker entry (`wrangler.jsonc`'s `main`); replaces the hand-written Hono app |
| API routes | Astro file-based API routes | — | `src/pages/api/**/*.ts`, one file per endpoint (or per dynamic segment) |
| Database | Cloudflare D1 | — | `devlab-studios-cms`, unchanged from before this rebuild |
| Object storage | Cloudflare R2 | — | `devlab-studios` bucket, unchanged |
| Admin CMS (current, being rebuilt in Phase 4) | Plain React components + hand-rolled `fetch()` | — | `@refinedev/*` is present as a dependency but genuinely unused (confirmed via exhaustive grep) — scheduled for removal in Phase 4 |

## Tooling

| Purpose | Tool | Version |
|---|---|---|
| Linting (JS/JSX) | ESLint | 9.39 (flat config) |
| Linting (TS) | typescript-eslint | latest, pinned against TS 6.0 (typescript-eslint doesn't yet support the TS 7 line) |
| Linting (CSS) | Stylelint | 16.26 + `stylelint-config-tailwindcss` |
| E2E testing | Playwright | 1.62 — `tests/e2e/*.spec.js`, run against `astro build && astro preview` and `wrangler dev --local` |
| Deployment CLI | Wrangler | 4.116 (bundled via `@astrojs/cloudflare`) |
| CI | GitHub Actions | `.github/workflows/ci.yml` — lint, build, `audit-ci` |
| Commit hygiene | Husky + lint-staged + commitlint | enforces Conventional Commits and pre-commit linting |
| Release automation | Custom CI job | tags + publishes a GitHub Release automatically when `package.json`'s version changes — see `CHANGELOG.md`'s versioning policy |

## Explicitly not used (revisit if this changes)

- **No `@refinedev/*` usage** despite being a declared dependency — confirmed dead weight, removal scheduled for Phase 4.
- **No Tailwind v4** — staying on 3.4 to avoid an unrelated, unscoped migration risk during the rebuild.
- **No CSS-in-JS** — Tailwind utility classes + plain CSS files.
- **No third-party headless CMS** — the CMS being built in Phase 4 is D1-backed and custom (schema-driven, benchmarked against mature CMS UX conventions, not a Git-backed CMS — see the approved plan's decision log for why).
