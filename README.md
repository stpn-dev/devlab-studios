# DevLab Studios — Full-Stack Development & AI Automation

The public portfolio and content platform for DevLab Studios, positioning
Stephen Rey G. Agustinez as a **Full-Stack Software Engineer & AI Automation
Specialist**. The site combines an Astro-rendered public experience with a
self-built Cloudflare CMS for managing projects, Work narratives, services,
articles, profile content, media metadata, and operational settings.

**Production:** [https://www.devlabstudios.com/](https://www.devlabstudios.com/)

**Preview:** [https://devlab-studios-preview.stpnrey-agustinez.workers.dev/](https://devlab-studios-preview.stpnrey-agustinez.workers.dev/)

## Documentation

| Document | Purpose |
|---|---|
| [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) | Current implementation, environment status, and open operational work |
| [docs/branch-workflow.md](docs/branch-workflow.md) | Canonical `development` → preview → `main` promotion and branch-cleanup workflow |
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | Astro, Cloudflare Worker, D1, R2, and CMS architecture |
| [docs/architecture/TECH_STACK.md](docs/architecture/TECH_STACK.md) | Runtime, framework, storage, and tooling inventory |
| [docs/content-model.md](docs/content-model.md) | CMS entities, page blocks, Work/Project relationship, and media index |
| [docs/deployment.md](docs/deployment.md) | Preview/production deployment, isolation, verification, and rollback |
| [docs/testing.md](docs/testing.md) | Type checking and Playwright test suites |
| [docs/guides/](docs/guides/) | CMS, deployment, and error-handling guides |
| [docs/security/](docs/security/) | Security references and remediation history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Commit, changelog, review, and release conventions |
| [CHANGELOG.md](CHANGELOG.md) | Version policy and release history |

## Platform overview

- Astro 7 renders the public routes and Cloudflare API endpoints.
- React 19 powers interactive islands and the Admin CMS workspace.
- Cloudflare Workers hosts production and the isolated preview Worker.
- D1 stores structured CMS content, versions, audit events, and leads.
- R2 stores uploaded media; `media_assets` is the CMS-visible metadata index.
- Static content in `src/data/` keeps public pages available when D1 content is
  missing or unavailable.
- Work entries select existing Projects. Projects own titles, technology,
  links, cover images, and ordered multi-image galleries; Work owns its
  independent description, Challenge, System Architecture, and Delivery Value
  narrative.

## Getting started

### Prerequisites

- Node.js 22.12 or newer (see `.nvmrc` and `package.json`)
- npm
- A Cloudflare account only when testing real D1/R2 bindings or deployments

### Install and run

```bash
npm install
cp .env.example .env.local
npm run dev
```

The Astro development server prints the active local URL, normally
`http://localhost:4321`.

### Verification and maintenance scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Astro development server |
| `npm run typecheck` | Run Astro/TypeScript validation |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the Cloudflare production output |
| `npm run preview` | Preview the built site locally without deployed D1/R2 bindings |
| `npm run test:e2e -- --project=static` | Run the complete static Playwright suite |
| `npm run audit` | Check production dependencies against the audit policy |
| `npm run cms:seed:projects` | Regenerate the project seed from static records; requires an explicit `R2_PUBLIC_BASE_URL` |
| `npm run cms:upload:project-media` | Upload project media to the configured R2 environment |
| `npm run cms:hash-admin-password` | Generate a compatible admin password hash |

## Content and media behavior

CMS-backed public reads use D1 when a published record exists and otherwise
fall back to the bundled static source. Uploads are performed from the owning
editor and stored in R2. `/admin/media` inventories the bound R2 bucket,
optimizes new browser uploads to WebP, replaces referenced images safely, and
blocks deletion while an image is still used by public content. The Worker
independently verifies the optimized file signature and size before storage.

The Work editor never uploads or duplicates Project media. Add and maintain
images under Projects, then select that Project under Work and edit only the
Work-specific presentation copy.

Admin navigation mirrors the public information architecture: Home, About,
Services, Work, Insights, and Profile are primary; Process and Contact are
supporting pages. Case Studies and Testimonials remain available only through
their legacy storage/API paths and are intentionally absent from normal Admin
navigation and public page composition.

## Branches and deployment

Only two long-lived branches are retained:

- `development` deploys to the isolated preview Worker, D1, and R2 environment.
- `main` is production and auto-deploys through Cloudflare Workers Builds.

For non-trivial changes, verify locally, push `development`, verify the live
preview environment, and only then fast-forward `main`. Keep the two branches
at the same commit after production promotion. See
[docs/branch-workflow.md](docs/branch-workflow.md) for exact commands, cleanup
rules, and D1 safeguards.

## License

Proprietary — all rights reserved. See [LICENSE](LICENSE).
