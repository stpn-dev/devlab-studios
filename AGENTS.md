# Agent Instructions

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) working
in this repository. Read this before making changes, especially anything
touching git branches, D1 data, or a production deploy.

## Working directly in this folder vs. a worktree

**Default: edit directly in this checkout**, so changes are visible in the
user's IDE as they happen. Only create an isolated git worktree
(`.claude/worktrees/<name>` or similar) for large, multi-round feature work
where isolation from the user's own in-progress changes genuinely matters —
not as a default habit for routine tasks.

## Branch workflow: `development` before `main`

- `main` is production. Cloudflare Workers Builds auto-deploys `main` on
  every push — there is no separate manual deploy step.
- `development` deploys to a fully isolated preview environment
  (`https://devlab-studios-preview.stpnrey-agustinez.workers.dev`) via
  `.github/workflows/deploy-preview.yml` — separate Worker, D1, R2, and
  secrets from production. Nothing done there can affect real visitors or
  leads.
- **Sequence for anything beyond a trivial fix:** commit → push the
  feature branch (if one is in use) → fast-forward `development` and push
  → verify on the live preview URL → only then fast-forward `main` and
  push. Keep `development` and `main` in sync after every `main` push
  (fast-forward whichever is behind) so they never silently diverge.
- Verify with `npm run typecheck && npm run build` and the full e2e suite
  (`npx playwright test --project=static`) before pushing to either
  branch — not just the specific page/feature being touched.

## Versioning and releases

Full policy lives in `CHANGELOG.md` (semver against this project's real
public contract — pages/routes, `/api/*` shapes, D1 schema — not npm
package semantics). The short version:

1. Add a `[Unreleased]` CHANGELOG entry **in the same commit** as the
   change itself — don't defer this and reconstruct it later from memory
   (this was skipped for a while this session and had to be rebuilt
   retroactively from `git log`, which is worse and more error-prone than
   doing it as you go).
2. When ready to ship: bump `package.json` **and** `package-lock.json`'s
   `version` fields, retitle `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`,
   start a fresh empty `[Unreleased]` above it, commit as
   `chore: release X.Y.Z - <summary>`.
3. Push to `main`. CI detects the version bump and automatically creates
   the `vX.Y.Z` tag + GitHub Release — never do this by hand, and never
   retag an existing version (tags are immutable; ship a new patch
   instead).
4. **Bumping `package-lock.json`: never use a bulk find-and-replace.**
   Other unrelated dependencies routinely share the exact same version
   string by coincidence (e.g. bumping `1.2.0 → 1.3.0` also silently
   corrupted an unrelated `run-parallel` dependency pinned at `1.2.0` this
   session). Edit only the two root-level `"version"` fields at the top
   of the file, and diff afterward to confirm nothing else changed.

## D1: production vs. preview, and seed files

- Two completely separate D1 databases: `devlab-studios-cms` (production)
  and `devlab-studios-cms-preview` (preview). Always double-check which
  one a `wrangler d1 execute` command targets — `--remote` alone doesn't
  tell you which environment; `--env preview` (or its absence) does.
- **The seed files (`scripts/cms/seed/*.sql`) are not a reliable mirror of
  reality.** They're meant for bootstrapping a fresh environment, but
  existing databases drift from them silently — this session found
  production's `profile_about` still had a shape that predated a schema
  change from several releases back, with no error or warning anywhere.
  Before assuming "the seed is correct" or "the database matches the
  code," query the actual current value and compare it to what the
  deployed code actually reads.
- **Don't run the full seed script against a database that already has
  real data.** It uses `DELETE FROM x; INSERT INTO x (...)` for several
  tables — correct for a fresh environment, destructive for one with
  content an admin has already edited. When fixing a live/existing
  database, write a minimal, targeted `UPDATE` or a guarded
  `INSERT ... WHERE NOT EXISTS (...)` instead, scoped to exactly the rows
  that need fixing.
- `scripts/cms/generate-project-seed.mjs` (run via `npm run
  cms:seed:projects`) reads `R2_PUBLIC_BASE_URL` from the shell
  environment with no `.env` fallback. If it's unset, every project's
  `image_url` silently regenerates as an empty string — always set it
  explicitly for this one command:
  `R2_PUBLIC_BASE_URL="https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev" npm run cms:seed:projects`,
  then diff the regenerated file before committing to confirm only the
  intended row(s) changed.
- A content type's shape has to stay in sync across **four** places by
  hand — the D1 write path/repository, the admin UI form, the public
  page's read path, and the static fallback file — because nothing in
  this codebase enforces that automatically. When changing one, grep for
  and update all four in the same change, and verify the actual rendered
  page, not just the code.

## Production D1 writes

- Requires a Cloudflare API token (`CLOUDFLARE_API_TOKEN`). Ask the user
  to paste it fresh for the specific action rather than assuming an
  earlier value in a long conversation is still accurate — use it inline
  for that one command only, never write it to a file, log it, or echo it
  back.
- The sandbox's auto-mode classifier blocks commands that combine a raw
  secret with a remote write in one call; this is often transient and a
  single retry succeeds, but if it doesn't, stop and let the user decide
  rather than working around it.
- Read the current value before overwriting anything on production —
  confirm the actual bug, then apply the minimal fix, then read it back
  to confirm.

## Housekeeping

- If a task starts a local preview server (`npm run preview`) for
  verification, stop it before finishing —
  `tasklist //FI "IMAGENAME eq node.exe"` to check, kill anything you
  started. Leftover servers have caused real confusion this session
  (port conflicts, stale content).
- Redirects belong in the D1 `redirects` table + `middleware.ts` (which
  only consults it on an actual 404) — don't add a hardcoded page-level
  redirect for anything that already has a row there; the two silently
  shadow each other and only one will ever fire.
