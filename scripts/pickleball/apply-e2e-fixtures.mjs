// Applies the Playwright fixtures that no Pickleball API can create.
//
// Organizations are invite-only by design — there is no self-serve signup and
// no POST /organizations endpoint — and scoring_rulesets has no write endpoint
// in Phase 1 either. The cross-organization isolation spec needs both: a
// second org with its own ADMIN, and an org-scoped (non-NULL organization_id)
// ruleset to prove the scoring_ruleset_id tenancy check is a filter rather
// than a blanket rejection.
//
// This runs *before* `wrangler dev` starts (see the `worker` webServer command
// in playwright.config.js) rather than from a test's beforeAll: writing to the
// local D1 SQLite file from a second process while miniflare has it open has
// been observed to drop in-flight connections, which shows up as unrelated
// specs failing with ECONNREFUSED.
//
// Every statement is idempotent, so re-running it across suite runs is a no-op.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const DEFAULT_ORG_ID = 'e2e-default-org'
export const DEFAULT_ORG_ADMIN_EMAIL = 'operator@example.com'
export const ORG_B_ID = 'e2e-cross-org-b'
export const ORG_B_ADMIN_EMAIL = 'org-b-admin@example.com'
export const ORG_B_RULESET_ID = 'e2e-cross-org-b-ruleset'

// Seeded by migrations/pickleball/0002_default_ruleset.sql with a NULL
// organization_id — the shared global profile every org may reference.
export const GLOBAL_RULESET_ID = 'usap-2026-sideout-11-doubles'

// The platform-pilot e2e spec (pickleball-platform.spec.js) needs a user
// with is_platform_admin = 1 before the suite starts -- there is no API
// that can grant that flag (it's a platform-level bootstrap, same as the
// real deploy's `wrangler d1 execute ... --remote` promotion step). Given
// its own dedicated org (rather than reusing e2e-default-org) so this
// fixture stays isolated from every other spec's roster/membership-count
// assertions on that org.
export const PLATFORM_ADMIN_EMAIL = 'platform-admin@example.com'
export const PLATFORM_ADMIN_ORG_ID = 'e2e-platform-admin-org'
const PLATFORM_ADMIN_USER_ID = 'e2e-platform-admin-user'
// Must match test-login.ts's `googleSub: \`test-${email}\`` convention exactly
// -- upsertUserByGoogleSub looks up this user by google_sub on every
// test-login call, and only UPDATEs email/name/avatar_url on a match, so a
// mismatch here would make it INSERT a second, non-admin user row instead
// of reusing this one.
const PLATFORM_ADMIN_GOOGLE_SUB = `test-${PLATFORM_ADMIN_EMAIL}`

const FIXTURE_TIMESTAMP = '2026-08-24T00:00:00.000Z'

export const FIXTURE_SQL = `
INSERT OR IGNORE INTO organizations (id, name, slug, created_at, updated_at)
VALUES ('${DEFAULT_ORG_ID}', 'E2E Default Org', '${DEFAULT_ORG_ID}', '${FIXTURE_TIMESTAMP}', '${FIXTURE_TIMESTAMP}');

INSERT OR IGNORE INTO organization_memberships (id, organization_id, user_id, invited_email, role, status, created_at, updated_at)
VALUES ('${DEFAULT_ORG_ID}-admin', '${DEFAULT_ORG_ID}', NULL, '${DEFAULT_ORG_ADMIN_EMAIL}', 'ADMIN', 'ACTIVE', '${FIXTURE_TIMESTAMP}', '${FIXTURE_TIMESTAMP}');

INSERT OR IGNORE INTO organizations (id, name, slug, created_at, updated_at)
VALUES ('${ORG_B_ID}', 'E2E Cross-Org B', '${ORG_B_ID}', '${FIXTURE_TIMESTAMP}', '${FIXTURE_TIMESTAMP}');

INSERT OR IGNORE INTO organization_memberships (id, organization_id, user_id, invited_email, role, status, created_at, updated_at)
VALUES ('${ORG_B_ID}-admin', '${ORG_B_ID}', NULL, '${ORG_B_ADMIN_EMAIL}', 'ADMIN', 'ACTIVE', '${FIXTURE_TIMESTAMP}', '${FIXTURE_TIMESTAMP}');

INSERT OR IGNORE INTO scoring_rulesets (id, organization_id, name, rules_version, scoring_method, target_score, win_by, format, active, created_at, updated_at)
VALUES ('${ORG_B_RULESET_ID}', '${ORG_B_ID}', 'Org B Private Ruleset', 'E2E-1', 'SIDE_OUT', 15, 2, 'DOUBLES', 1, '${FIXTURE_TIMESTAMP}', '${FIXTURE_TIMESTAMP}');

INSERT OR IGNORE INTO organizations (id, name, slug, created_at, updated_at)
VALUES ('${PLATFORM_ADMIN_ORG_ID}', 'E2E Platform Admin Org', '${PLATFORM_ADMIN_ORG_ID}', '${FIXTURE_TIMESTAMP}', '${FIXTURE_TIMESTAMP}');

-- test-login.ts 403s before ever looking up/creating the user row unless the
-- email already has an ACTIVE membership somewhere, so the platform admin
-- needs one of its own even though its actual power comes from
-- users.is_platform_admin, not this membership's role.
INSERT OR IGNORE INTO organization_memberships (id, organization_id, user_id, invited_email, role, status, created_at, updated_at)
VALUES ('${PLATFORM_ADMIN_ORG_ID}-admin', '${PLATFORM_ADMIN_ORG_ID}', NULL, '${PLATFORM_ADMIN_EMAIL}', 'ADMIN', 'ACTIVE', '${FIXTURE_TIMESTAMP}', '${FIXTURE_TIMESTAMP}');

INSERT OR IGNORE INTO users (id, google_sub, email, name, avatar_url, is_platform_admin, created_at, updated_at)
VALUES ('${PLATFORM_ADMIN_USER_ID}', '${PLATFORM_ADMIN_GOOGLE_SUB}', '${PLATFORM_ADMIN_EMAIL}', 'Platform Admin', '', 1, '${FIXTURE_TIMESTAMP}', '${FIXTURE_TIMESTAMP}');

-- Belt-and-suspenders: guards against a stale row from a prior local D1 file
-- that predates this fixture (e.g. created with is_platform_admin's default
-- of 0 before this feature existed). INSERT OR IGNORE above is a no-op in
-- that case, so re-assert the flag directly.
UPDATE users SET is_platform_admin = 1 WHERE email = '${PLATFORM_ADMIN_EMAIL}';
`.trim()

// Invoked as a plain JS entry under the current node binary rather than via
// `npx`: Node refuses to spawn a Windows `.cmd` shim without `shell: true`
// (EINVAL), and a shell would only add path-quoting problems here.
function resolveWranglerBin() {
  const require = createRequire(import.meta.url)
  // 'wrangler' resolves to <pkg>/wrangler-dist/cli.js; the launcher we want is
  // <pkg>/bin/wrangler.js, two levels up and back down.
  return join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js')
}

export function applyE2eFixtures() {
  const sqlPath = join(mkdtempSync(join(tmpdir(), 'pb-e2e-')), 'fixtures.sql')
  writeFileSync(sqlPath, FIXTURE_SQL, 'utf8')

  execFileSync(
    process.execPath,
    [resolveWranglerBin(), 'd1', 'execute', 'devlab-pickleball', '--local', `--file=${sqlPath}`],
    { stdio: 'inherit', windowsHide: true },
  )
}

// Only shell out when run as a CLI entry — the spec imports the ids above and
// must not trigger a D1 write just by importing them.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  applyE2eFixtures()
}
