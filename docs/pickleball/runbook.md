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

## Platform admin

The platform admin & self-serve pilot org feature (spec
`2026-09-01-devlab-pickleball-platform-pilot-design.md`) lets a small set of
platform admins invite pilot clubs to self-serve create their own
organization, and suspend/reactivate any organization. There is no UI or API
to grant `users.is_platform_admin` itself — this is deliberate (spec
Decision 1): it's a platform-level bootstrap action, not something any
in-app role should be able to grant itself or anyone else.

### Promote the first platform admin

The only way to set the flag in production is a direct SQL statement against
the remote D1 database — the same pattern `scripts/pickleball/create-organization.mjs`
uses for org bootstrap, just inline since there's only one column to touch:

```bash
npx wrangler d1 execute devlab-pickleball --remote --command "UPDATE users SET is_platform_admin = 1 WHERE email = '<email>'"
```

The target user must already have signed in once (via Google OAuth) so their
`users` row exists — if the `UPDATE` matches zero rows, have them sign in
first, then re-run it. Locally, run the same command against the local DB
(drop `--remote`, or point at `devlab-pickleball-preview` for the preview
environment).

### Issue a pilot invite

A platform admin can invite a pilot either from the operator app's Platform
page (`/pickleball/app/platform`, visible only to `is_platform_admin`
sessions) or directly via the API:

```bash
curl -X POST http://localhost:8787/api/pickleball/platform/org-invites \
  -H 'Content-Type: application/json' \
  --cookie "<platform admin's session cookie>" \
  -d '{"invitedEmail": "pilot@example.com", "maxAdmins": 1, "maxFacilitators": 3, "maxScorekeepers": 5}'
```

`maxAdmins`/`maxFacilitators`/`maxScorekeepers` are optional and nullable —
omit any of them (or pass `null`) for an unlimited seat cap on that role. The
response's `acceptUrl` is what gets sent to the invitee; they sign in with
Google, land on the accept-invite page, and create their own club, which
carries the invite's seat caps onto the new `organizations` row.

### Suspend / reactivate an organization

From the Platform page's organizations list, or via the API:

```bash
# Suspend — 403s every org-scoped request against it. Its public spectator
# route is the one exception: it 404s instead, matching the same "not found"
# shape/status it already returns for an unknown or revoked code, so an
# anonymous spectator can't distinguish "suspended" from "doesn't exist"
curl -X POST http://localhost:8787/api/pickleball/platform/organizations/<organizationId>/suspend \
  -H 'Content-Type: application/json' --cookie "<platform admin's session cookie>" -d '{}'

# Reactivate
curl -X POST http://localhost:8787/api/pickleball/platform/organizations/<organizationId>/reactivate \
  -H 'Content-Type: application/json' --cookie "<platform admin's session cookie>" -d '{}'
```

Both routes authenticate via `requirePlatformAdmin` (Google identity +
`is_platform_admin`, no org membership required), so a platform admin can
suspend and later reactivate an organization even if it's the only org they
personally belong to. This no-lockout guarantee extends to the operator SPA
itself: `/auth/session` (session bootstrap, called on every page load) and
`/auth/switch-org` also recognize a platform admin whose `activeOrgId`
points at the SUSPENDED org and return a valid session with
`activeOrgId: null` instead of 403ing them out to the login page — so the
Platform page (gated only on `isPlatformAdmin`) stays reachable in-browser
to reactivate the org, not just via direct API calls.

## Notes

- `PICKLEBALL_TEST_AUTH_ENABLED` must never be set in `wrangler.jsonc`'s committed `vars` — it exists only for local/CI `.dev.vars`.
- Organization creation is invite-only by design — there is no unsolicited self-serve signup. New organizations are created either via `scripts/pickleball/create-organization.mjs`, or by a pilot accepting a platform admin's org invite (see "Platform admin" above).
