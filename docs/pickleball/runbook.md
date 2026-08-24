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

## Notes

- `PICKLEBALL_TEST_AUTH_ENABLED` must never be set in `wrangler.jsonc`'s committed `vars` — it exists only for local/CI `.dev.vars`.
- Organization creation is invite-only by design — there is no self-serve signup. New organizations are created via `scripts/pickleball/create-organization.mjs`.
