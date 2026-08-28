# Devlab Pickleball — Local Development Runbook

## One-time setup

1. Create a Google OAuth 2.0 Client ID (Web application) in Google Cloud Console.
   Authorized redirect URI: `http://localhost:8787/api/pickleball/auth/google/callback`.
2. Add to your local `.dev.vars` (gitignored):
   ```
   GOOGLE_OAUTH_CLIENT_ID=<from Google Cloud Console>
   GOOGLE_OAUTH_CLIENT_SECRET=<from Google Cloud Console>
   PICKLEBALL_SESSION_SECRET=<any long random string>
   PICKLEBALL_OAUTH_REDIRECT_BASE_URL=http://localhost:8787
   PICKLEBALL_TEST_AUTH_ENABLED=true
   ```
3. Apply migrations: `npx wrangler d1 migrations apply devlab-pickleball --local`
4. Bootstrap your first organization:
   ```bash
   npm run pickleball:create-organization -- "Your Club Name" "your-club-slug" "your-email@example.com" > /tmp/org.sql
   npx wrangler d1 execute devlab-pickleball --local --file=/tmp/org.sql
   ```
5. Run `npx wrangler dev --local`, visit `http://localhost:8787/pickleball/app`, sign in with Google.

## Running tests

- Unit: `npm run test:unit -- src/lib/pickleball src/worker/pickleball`
- E2E: `npx playwright test --project=worker tests/e2e/pickleball/` (requires the bootstrap step above to have run first, so the `test-login` fixture email has an active membership)
  - The cross-organization isolation test needs a *second* organization and an org-scoped scoring
    ruleset, neither of which any Phase 1 API can create. `scripts/pickleball/apply-e2e-fixtures.mjs`
    seeds them idempotently (`e2e-cross-org-b`, `org-b-admin@example.com`,
    `e2e-cross-org-b-ruleset`); `playwright.config.js` runs it as part of the `worker` project's
    `wrangler dev` command, so it happens automatically *before* the server opens the local D1.
    If you start `wrangler dev` yourself and let Playwright reuse it, run the script once by hand
    first: `node scripts/pickleball/apply-e2e-fixtures.mjs`.

## Demo data

`scripts/pickleball/seed/generate-demo-seed.mjs` prints a fresh-DB-only demo dataset (spec §13) —
mirrors `scripts/cms/generate-project-seed.mjs`'s pattern (print SQL, apply with `wrangler d1
execute --file=`), not idempotent (plain INSERTs, no `ON CONFLICT`). Produces 1 organization, 1
venue, 4 courts, 16 players, 1 DRAFT session, 1 LIVE session with a populated queue (8 players) and
two finished games, plus an extra completed history session whose games are there purely to give
different players eligible-games counts spanning all three OPI confidence tiers (PROVISIONAL,
DEVELOPING, ESTABLISHED). Also seeds one org-scoped custom scoring ruleset, demoing the Settings
page.

```bash
npm run pickleball:seed:demo -- your-email@example.com   # writes scripts/pickleball/seed/demo-seed.sql
npx wrangler d1 execute devlab-pickleball --local --file=scripts/pickleball/seed/demo-seed.sql
```

The email argument becomes the seeded organization's ADMIN `invited_email` (defaults to
`admin@example.com`) — sign in with that Google account to reach it. Only ever run this against a
database that doesn't already have `seed-org` in it.

## Notes

- `PICKLEBALL_TEST_AUTH_ENABLED` must never be set in `wrangler.jsonc`'s committed `vars` — it exists only for local/CI `.dev.vars`.
- Organization creation is invite-only by design — there is no self-serve signup. New organizations are created via `scripts/pickleball/create-organization.mjs`.
