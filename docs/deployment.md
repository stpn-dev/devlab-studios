# Deployment

Written as part of Phase 6 (deployment & hardening) of the Astro/CMS
rebuild program. Covers how a build actually reaches Cloudflare, how the
preview environment is isolated from production, and how to roll back a
bad deploy.

## How a deploy works today

The Cloudflare dashboard's Workers Builds project is connected to this
repo and deploys the `main` branch automatically on push (git-integrated
CI/CD — there's no separate `wrangler deploy` step to run by hand for
normal production releases). `astro build` runs, `@astrojs/cloudflare`
produces `dist/client` (static assets) and `dist/server` (the Worker
script + a generated `wrangler.json`), and Workers Builds deploys that
output using the bindings declared in `wrangler.jsonc`.

## Preview environment setup

**The non-obvious part**: `wrangler deploy --env preview` alone does
**not** work with this adapter. `@astrojs/cloudflare` bakes the resolved
bindings into `dist/server/wrangler.json` at `astro build` time —
*before* `wrangler deploy` (or Workers Builds) ever runs — so passing
`--env preview` at deploy time arrives too late; it deploys whatever was
baked in at build time, which defaults to production's bindings. This was
confirmed by inspecting `dist/server/wrangler.json` after building with
an `env.preview` block present: without a build-time signal, its
`definedEnvironments` came back empty and the bindings were production's.

The fix: set `CLOUDFLARE_ENV=preview` as an environment variable for the
`astro build` step itself. `@astrojs/cloudflare` reads it via Wrangler's
own `unstable_readConfig` and bakes in `wrangler.jsonc`'s `env.preview`
block instead of the top-level (production) config. Once that's done,
`wrangler deploy` — with or without `--env preview` — deploys exactly
what was baked in, under the separate `devlab-studios-preview` Worker
name, so there's no path by which a preview deploy can accidentally
overwrite the production Worker.

### One-time setup — done

This has already been provisioned once (2026-07-31):

1. **Preview D1 database**: `devlab-studios-cms-preview`
   (`3e01246b-fe41-4bb4-b667-30fa964ba82b`), created via
   `wrangler d1 create` and filled into `wrangler.jsonc`'s
   `env.preview.d1_databases[0].database_id`. All 6 migrations applied
   with `wrangler d1 migrations apply devlab-studios-cms-preview --remote --env preview`.
2. **Preview R2 bucket**: `devlab-studios-preview`, created via
   `wrangler r2 bucket create`, public access enabled via
   `wrangler r2 bucket dev-url enable devlab-studios-preview`. The
   resulting public URL is in `wrangler.jsonc`'s
   `env.preview.vars.R2_PUBLIC_BASE_URL`.
3. **Preview secrets** — deliberately different from production's, set via
   `wrangler secret put <NAME> --env preview`: `ADMIN_EMAIL`,
   `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `ZOHO_WEBHOOK_URL`
   (a placeholder — preview leads still persist to D1 even though delivery
   fails). `TURNSTILE_SECRET_KEY` intentionally left unset (degrades
   gracefully, safe for preview).
4. **Verified end to end** against the live deployed Worker: homepage,
   `/api/health`, `/admin` login, and security headers all confirmed
   working at `https://devlab-studios-preview.<subdomain>.workers.dev`.

If these ever need re-provisioning (e.g. after deleting the resources), repeat with:

```sh
npx wrangler d1 create devlab-studios-cms-preview
npx wrangler d1 migrations apply devlab-studios-cms-preview --remote --env preview
npx wrangler r2 bucket create devlab-studios-preview
npx wrangler r2 bucket dev-url enable devlab-studios-preview
```

then fill the resulting IDs/URL into `wrangler.jsonc`'s `env.preview` block.

### Automated deploys

`.github/workflows/deploy-preview.yml` deploys automatically on every
push to the `development` branch: `npm ci` → `CLOUDFLARE_ENV=preview npm
run build` → `wrangler deploy --env preview` (via
`cloudflare/wrangler-action`). This is a GitHub Actions workflow, not
Workers Builds — it was added because Workers Builds' dashboard
configuration isn't something this repo can set, and per-branch build
commands aren't guaranteed to be available on every plan.

**Requires a `CLOUDFLARE_API_TOKEN` repository secret** (Settings →
Secrets and variables → Actions), scoped with at least `D1:Edit`,
`Workers R2 Storage:Edit`, and `Workers Scripts:Edit` — the same token
used for the manual setup above works. Set it with:

```sh
gh secret set CLOUDFLARE_API_TOKEN
```

(paste the token when prompted) or via the GitHub UI. Nothing else is
needed — `db49443cea6f0725d848254f17bcdab5` (the account ID, not
secret) is already in the workflow file.

**Production (`main`) is deliberately left to Workers Builds**, which
already auto-deploys it — adding a second automated deploy path for the
same branch would risk two concurrent deploys racing each other. If you
ever want GitHub Actions to own production too, disable Workers Builds'
auto-deploy for `main` first, then add a matching `deploy.yml` for it
(same shape as `deploy-preview.yml`, without `CLOUDFLARE_ENV` and without
`--env preview`).

### Verifying isolation

After setup, confirm preview and production can't see each other:

```sh
npx wrangler d1 execute devlab-studios-cms-preview --remote --env preview --command "SELECT COUNT(*) FROM leads"
```

should show only preview's own test data, never a real lead captured
through the production contact form (and vice versa).

## Rollback procedure

- **Content** (anything editable in `/admin`): every save is versioned
  (`content_versions` table) — use the Version History panel on the
  affected content type/page/item and Restore the prior version. This
  applies a new version on top, it never rewrites history, so a bad
  restore can itself be rolled back the same way.
- **Code**: Workers Builds keeps prior deployments. In the Cloudflare
  dashboard, go to **Workers & Pages → devlab-studios → Deployments** and
  use **Rollback to this deployment** on the last known-good build. This
  reverts the Worker script and static assets; it does not touch D1/R2
  data, so it's safe to use even if the bad deploy already wrote data
  (that data stays — only the code reverts).
- **Migrations**: migrations in this project are additive-only (see
  `docs/content-model.md`) — none of them have ever dropped or
  destructively rewritten an existing column. If a future migration needs
  a rollback, write a new forward migration that undoes it; don't edit or
  delete an already-applied migration file.

## See also

- `docs/operations.md` — environment variables, bindings, local dev setup
- `docs/security.md` — security headers, auth, and the CSP/Turnstile
  interaction
- `docs/architecture/decisions/` — ADRs for the reasoning behind the
  bigger calls referenced above
