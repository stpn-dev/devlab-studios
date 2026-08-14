# Tech Stack

Updated 2026-08-14 for release `1.5.0`. `package.json` and `wrangler.jsonc`
remain the version and binding sources of truth.

## Frontend

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework/build | [Astro](https://astro.build/) | 7.1 | Server output through the Cloudflare adapter; public routes use Astro file-based routing and server loaders |
| Interactive UI | [React](https://react.dev/) | 19.2 | Admin CMS, galleries, modals, carousels, and the intentionally isolated landing-sample application |
| Island/admin routing | [React Router](https://reactrouter.com/) | 7.11 | Used inside React applications, not for normal public Astro routes |
| Styling | [Tailwind CSS](https://tailwindcss.com/) | 3.4 | Astro integration plus shared global CSS and design tokens |
| Icons | [Lucide React](https://lucide.dev/) | 0.562 | UI and approved decorative vector motifs |
| Utility | [clsx](https://github.com/lukeed/clsx) | 2.1 | Conditional class composition |
| Validation/language | TypeScript + Zod | 6.0 + 4.4 | Strict TypeScript for Astro/API/schema code; Zod validates CMS blocks and collection writes |

## Backend and storage

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Worker runtime | `@astrojs/cloudflare` | 14.1 | Generates the deployed Worker entry and resolves environment bindings at build time |
| API routes | Astro endpoints | — | `src/pages/api/**/*.ts` for public content, admin CRUD, auth, media, leads, audit history, and versions |
| Database | Cloudflare D1 | — | Separate `devlab-studios-cms` and `devlab-studios-cms-preview` databases |
| Object storage | Cloudflare R2 | — | Separate production and preview buckets; `media_assets` provides CMS-visible metadata |
| Admin CMS | React SPA under `/admin/*` | — | Dedicated Astro entry, schema-driven controls, custom collection/page editors, and React Router navigation |
| External delivery | Resend API | — | Contact submissions persist to D1 before asynchronous delivery/retry handling |

## Tooling

| Purpose | Tool | Version/role |
|---|---|---|
| Type checking | Astro Check + TypeScript | Strict project validation |
| JavaScript linting | ESLint | 9.39, flat configuration |
| CSS linting | Stylelint | 16.26 with Tailwind-aware configuration |
| E2E testing | Playwright | 1.62; static public suite plus local Worker/D1 admin coverage |
| Deployment CLI | Wrangler | 4.116 through the Cloudflare adapter/toolchain |
| CI/CD | GitHub Actions + Workers Builds | Preview deployment, validation, release automation, and production deployment |
| Commit hygiene | Husky, lint-staged, commitlint | Conventional Commit enforcement and staged-file checks |
| Release automation | Repository CI | Creates immutable tags and GitHub Releases from explicit package version bumps |

## Deliberate boundaries

- No third-party headless CMS: the CMS is custom, D1-backed, and validated.
- No arbitrary HTML/SVG input in CMS blocks: presentation choices use controlled
  schemas and approved icon keys.
- No Tailwind 4 migration is bundled into current product work.
- No CSS-in-JS layer: use Tailwind utilities and repository CSS.
- No automatic data promotion from Preview to Production: D1 and R2 changes are
  explicit, environment-specific operations.
- No Project media duplication in Work: Work references Projects and owns only
  its separate presentation narrative.
