# Tech Stack

Versions reflect `package.json`/`wrangler.jsonc` at the time this doc was
written (2026-07-30). Check those files for the current source of truth.

## Frontend

| Layer | Technology | Version | Notes |
|---|---|---|---|
| UI framework | [React](https://react.dev/) | 19.2 | Client-side rendered only, no SSR/SSG |
| Build tool | [Vite](https://vite.dev/) | 7.2 | `@vitejs/plugin-react` |
| Routing | [React Router](https://reactrouter.com/) | 7.11 | `createBrowserRouter`, client-side |
| Styling | [Tailwind CSS](https://tailwindcss.com/) | 3.4 | + `postcss`, `autoprefixer` |
| Icons | [Lucide React](https://lucide.dev/) | 0.562 | |
| SEO/meta tags | [react-helmet-async](https://github.com/staylor/react-helmet-async) | 3.0 | Per-route tags applied at runtime |
| Utility | [clsx](https://github.com/lukeed/clsx) | 2.1 | Conditional class names |

## Backend / API

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Worker framework | [Hono](https://hono.dev/) | 4.12 | Runs as the Cloudflare Worker entry (`src/worker.js`) |
| Database | Cloudflare D1 | — | `devlab-studios-cms`, SQL migrations in `migrations/` |
| Object storage | Cloudflare R2 | — | `devlab-studios` bucket, for uploaded media |
| Admin CMS framework | [Refine](https://refine.dev/) | core 5.0 / react-router 2.0 / simple-rest 6.0 | Powers `/admin`, isolated via lazy-loading |

## Tooling

| Purpose | Tool | Version |
|---|---|---|
| Linting (JS/JSX) | ESLint | 9.39 (flat config) |
| Linting (CSS) | Stylelint | 16.26 + `stylelint-config-tailwindcss` |
| Deployment CLI | Wrangler | via `wrangler.jsonc` config |
| CI | GitHub Actions | `.github/workflows/ci.yml` — lint, build, `npm audit` |
| Commit hygiene | Husky + lint-staged + commitlint | enforces Conventional Commits and pre-commit linting |

## Explicitly not used

- **No TypeScript** — pure `.jsx`/`.js`. `@types/react`/`@types/react-dom` are
  present as devDependencies but currently vestigial (editor IntelliSense
  only).
- **No test framework** — no Jest/Vitest/Playwright configured yet (see
  [../CURRENT_STATE.md](../CURRENT_STATE.md) for the recommendation).
- **No CSS-in-JS** — Tailwind utility classes + a handful of plain CSS files
  (`src/App.css`, `src/index.css`, `src/styles/animations.css`).
- **No SSR/SSG framework** (Next.js, Astro, etc.) — see
  [../performance/PERFORMANCE_FINDINGS.md](../performance/PERFORMANCE_FINDINGS.md)
  for the performance context behind a possible future evaluation.
- **No third-party headless CMS** (Contentful/Sanity/Strapi/WordPress) — the
  CMS is custom-built on D1 + R2 + Hono + Refine.
