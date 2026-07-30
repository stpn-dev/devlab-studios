# DevLab Studios — Portfolio & CMS

A professional portfolio site for Stephen Rey G. Agustinez (Technical Virtual
Assistant / AI Automation Specialist), with a self-built headless CMS for
managing content without redeploying.

**Live site:** [https://www.devlabstudios.com/](https://www.devlabstudios.com/)

## Documentation

| Doc | Purpose |
|---|---|
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | How the system fits together (SPA + Cloudflare Worker + D1 + R2) |
| [docs/architecture/TECH_STACK.md](docs/architecture/TECH_STACK.md) | Every tool/library and version in use |
| [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) | What's implemented, known issues, recommended follow-ups |
| [docs/performance/PERFORMANCE_FINDINGS.md](docs/performance/PERFORMANCE_FINDINGS.md) | Performance audit findings |
| [docs/guides/](docs/guides/) | CMS setup, error handling, and deployment guides |
| [docs/security/](docs/security/) | Historical security audit + current status |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branch strategy, commit conventions, PR process |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## Tech stack (short version)

React 19 + Vite 7 (client-side rendered SPA) + Tailwind CSS, deployed as a
single Cloudflare Worker (Hono) that serves the built frontend and a JSON API
backed by Cloudflare D1 + R2. Full details in
[docs/architecture/TECH_STACK.md](docs/architecture/TECH_STACK.md).

## Getting started

### Prerequisites

- Node.js 20+ (see `.nvmrc`) and npm
- A Cloudflare account if you need to run against real D1/R2 bindings (the
  frontend runs fine without one — every page falls back to static content)

### Install & run

```bash
npm install
cp .env.example .env.local   # fill in your own values
npm run dev                  # http://localhost:5173
```

### Available scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally (no Worker runtime — D1/R2-backed features fall back to static/read-only) |
| `npm run lint` | ESLint |
| `npm run cms:seed:projects` | Regenerate `scripts/cms/seed/project-seed.sql` from `src/data/projectRecords.js` |
| `npm run cms:upload:project-media` | Upload project images to R2 |
| `npm run cms:hash-admin-password` | Generate an admin password hash for `ADMIN_PASSWORD_HASH` |

## Content model

Every page has bundled static fallback content in `src/data/*.js`, so the
site works with zero configuration. Once the D1 (`DB`) and R2
(`MEDIA_BUCKET`) bindings are configured (see
[docs/guides/CMS_IMPLEMENTATION_GUIDE.md](docs/guides/CMS_IMPLEMENTATION_GUIDE.md)),
content can be managed live from `/admin` instead. See
[docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) for how
the two sources interact.

## Deployment

Deploys as a Cloudflare Worker via Cloudflare's own Git integration on pushes
to `main` — see
[docs/guides/PRODUCTION_DEPLOYMENT_GUIDE.md](docs/guides/PRODUCTION_DEPLOYMENT_GUIDE.md).
`.github/workflows/ci.yml` runs lint/build/`npm audit` on every PR but does
not deploy.

## License

Proprietary — all rights reserved. See [LICENSE](LICENSE).
