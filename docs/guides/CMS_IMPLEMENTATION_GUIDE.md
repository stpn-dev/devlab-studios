# CMS Implementation Guide

## Current Slice

This repo now has the foundation for a Cloudflare-native CMS:

- Hono Worker API in `src/worker.js`
- D1 schema in `migrations/0001_cms_foundation.sql`
- R2 media binding for the existing `devlab-studios` bucket
- Public `/api/projects` endpoint with static fallback behavior
- Admin route at `/admin`
- Admin project CRUD endpoints under `/api/admin/projects`
- R2 upload endpoint at `/api/admin/media`
- Repeatable project seed/media scripts

Public pages still render correctly without D1. If the `DB` binding is missing or empty, the frontend keeps using the static portfolio fallback.

## Required Cloudflare Setup

Current Cloudflare bindings:

```text
D1 database name: devlab-studios-cms
D1 database id: 6ff5e313-51a4-43d5-a649-678eeff1ff25
R2 bucket: devlab-studios
R2 public base URL: https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev
```

`wrangler.jsonc` is already patched with the real D1 and R2 bindings.

Apply the schema:

Preferred path with the current token limits:

1. Open D1 Studio for `devlab-studios-cms`.
2. Open the SQL query tab.
3. Paste the contents of `migrations/0001_cms_foundation.sql`.
4. Run the query.

The dashboard screenshot already shows the schema is present, so this step is complete unless you recreate the database.

Configure Worker variables/secrets:

```text
ADMIN_EMAIL=stpnrey.agustinez@gmail.com
R2_PUBLIC_BASE_URL=https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev
ZOHO_WEBHOOK_URL=existing-secret
```

Protect these paths with Cloudflare Access:

```text
/admin*
/api/admin/*
```

Allow only your admin email.

## Seed Existing Project Content

Project seed SQL is already generated in:

```text
project-seed.sql
```

Upload current project images to R2 under the `projects/` prefix.

The current local API token cannot list or upload R2 objects through Wrangler, so use the dashboard:

1. Open `R2 Object Storage -> devlab-studios`.
2. Create a folder or prefix named `projects`.
3. Upload all files from `src/assets/projects/` that are referenced by `src/data/projectRecords.js`.

Then seed the `projects` table from the dashboard:

1. Open D1 Studio for `devlab-studios-cms`.
2. Open a new query tab.
3. Paste the contents of `project-seed.sql`.
4. Run the query.

The seed is idempotent. Running it again updates existing project rows instead of creating duplicates.

## Verification

Check the public fallback/API:

```text
/api/health
/api/projects
/profile
/services
```

Check admin after Cloudflare Access and D1 are configured:

```text
/admin
/api/admin/session
/api/admin/projects
```

If `/admin` is opened through plain `vite preview`, it will show static read-only fallback data. Real CRUD requires the Worker runtime with D1 and R2 bindings.

## Local And Preview Runtime

For frontend-only preview:

```powershell
npm run preview
```

For Worker packaging validation:

```powershell
npx wrangler deploy --dry-run --outdir .wrangler-dry-run
```

The current token can package the Worker and validate bindings, but it cannot query D1 or upload R2 objects remotely. Use the Cloudflare dashboard for those steps unless you replace the token with one that has D1 and R2 edit permissions.

## Remaining Phases

Next migration slices should move content in this order:

1. Services/resource repeatable records.
2. Profile/about data, skills, tools, workflows, experiences.
3. Full page sections and SEO metadata.
4. Static content cleanup after D1 parity is verified.
