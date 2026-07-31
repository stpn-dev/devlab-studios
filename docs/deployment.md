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

### One-time setup (requires Cloudflare account access this environment doesn't have)

The API token available when this was written could not create D1
databases or R2 buckets (`wrangler d1 create` / `wrangler r2 bucket
create` both failed with a permissions error), so provisioning is a
manual one-time step:

1. **Create the preview D1 database**:
   ```
   npx wrangler d1 create devlab-studios-cms-preview
   ```
   Copy the returned `database_id` into `wrangler.jsonc`'s
   `env.preview.d1_databases[0].database_id` (replacing
   `REPLACE_WITH_PREVIEW_DATABASE_ID`).

2. **Apply all migrations to it**:
   ```
   npx wrangler d1 migrations apply devlab-studios-cms-preview --remote --env preview
   ```

3. **Create the preview R2 bucket**:
   ```
   npx wrangler r2 bucket create devlab-studios-preview
   ```
   Enable public access (R2 dashboard → bucket → Settings → Public
   Access → allow `r2.dev` subdomain) and put the resulting URL into
   `wrangler.jsonc`'s `env.preview.vars.R2_PUBLIC_BASE_URL` (replacing
   `REPLACE_WITH_PREVIEW_BUCKET_PUBLIC_URL`).

4. **Set preview's own secrets** — never copy production's:
   ```
   npx wrangler secret put ADMIN_SESSION_SECRET --env preview
   npx wrangler secret put ADMIN_EMAIL --env preview
   npx wrangler secret put ADMIN_PASSWORD_HASH --env preview
   npx wrangler secret put ZOHO_WEBHOOK_URL --env preview
   npx wrangler secret put TURNSTILE_SECRET_KEY --env preview
   ```
   Using a *different* admin password and a placeholder/non-production
   Zoho webhook for preview is deliberate — it's what makes preview
   genuinely isolated rather than a second door into the same data.

5. **Wire Workers Builds to deploy preview separately.** This repo's
   Workers Builds project deploys `main` → production. Whether preview
   deploys automatically (e.g. on PR branches) or is triggered manually
   depends on dashboard configuration this document can't set from the
   repo — see **Workers Builds → Settings → Build configuration** and set
   the build command for non-production branches to:
   ```
   CLOUDFLARE_ENV=preview npm run build
   ```
   with the deploy step passing `--env preview`. If Workers Builds on
   your plan doesn't support per-branch build commands, deploy preview
   manually instead:
   ```
   CLOUDFLARE_ENV=preview npx astro build && npx wrangler deploy --env preview
   ```

### Verifying isolation

After setup, confirm preview and production can't see each other:
```
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
