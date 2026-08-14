# Branch Workflow

This document is the canonical branch and environment workflow for DevLab
Studios. The repository intentionally keeps only two long-lived branches.

## Long-lived branches

| Branch | Purpose | Deployment | Data environment |
|---|---|---|---|
| `development` | Integration and acceptance testing | GitHub Actions deploys `devlab-studios-preview` | Preview D1, R2, and secrets |
| `main` | Production | Cloudflare Workers Builds deploys `devlab-studios` | Production D1, R2, and secrets |

After a production promotion, both branches should point to the same commit so
the next change starts from an unambiguous baseline.

## Normal change flow

1. Fetch and confirm the core branches are synchronized.
2. Work directly in the checkout for routine changes. Use a short-lived branch
   or worktree only when the change genuinely benefits from isolation.
3. Update `CHANGELOG.md` in the same commit as the implementation.
4. Run type checking, the production build, and the full static Playwright
   suite.
5. Fast-forward and push `development`.
6. Verify the live preview URL and any Preview D1/R2 behavior.
7. Fast-forward and push `main` only after preview acceptance.
8. Confirm deployed production behavior and core-branch synchronization.

```bash
git fetch origin --prune
git rev-list --left-right --count origin/main...origin/development
git status --short --branch
```

The divergence count must be `0 0` after production promotion.

## Short-lived branches

A branch is eligible for deletion only when all of the following are true:

- it is fully merged into `main`;
- `git log main..<branch>` contains no commits;
- it has no open pull request;
- it is not attached to an active worktree, or that worktree is confirmed
  clean and intentionally removed first;
- no uncommitted files would be discarded.

Delete exact branch names—never use a broad pattern:

```bash
git branch -d feat/example
git push origin --delete feat/example
git fetch origin --prune
```

As of 2026-08-14, the merged branches `agent/full-ui-alignment`,
`worktree-profile-polish`, and local `feat/astro-cms-rebuild` have been cleaned
up. Only `main` and `development` remain.

## D1 and R2 safeguards during promotion

Code promotion does not copy data between environments. Preview and Production
use different D1 databases, R2 buckets, and secrets.

- Inspect actual destination rows before modifying either database.
- Apply minimal, targeted, idempotent SQL; never run the destructive full seed
  against an existing database.
- Validate Preview first.
- Obtain a fresh Cloudflare API token before a Production D1 write and use it
  only for that command.
- Read Production rows again after the update.
- R2 uploads remain environment-specific unless deliberately uploaded to both.

The `1.5.0` code release includes the Work CMS integration in both branches.
Preview D1 has the Work bootstrap. Production continues to use the safe static
Work fallback until the targeted Work bootstrap SQL is explicitly applied to
Production D1 and verified.

## Recovery

- Roll back code from Cloudflare deployment history; do not rewrite Git history
  or move a published release tag.
- Restore CMS content through version history when supported.
- Reverse database changes with a new forward migration or targeted update,
  never by editing an already-applied migration.
