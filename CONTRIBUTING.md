# Contributing

This is a single-maintainer project, but these conventions keep production,
preview, content data, and release history aligned.

## Branch strategy

`development` and `main` are the only long-lived branches:

- `development` is the integration branch and deploys to the isolated preview
  Worker at `devlab-studios-preview.stpnrey-agustinez.workers.dev`.
- `main` is production. Cloudflare Workers Builds deploys every push to the
  `devlab-studios` Worker; there is no normal manual production deploy step.

Short-lived `feat/*`, `fix/*`, or `agent/*` branches are optional for isolated
work. They must be removed locally and remotely after their commits are merged
and verified. The full promotion and cleanup procedure is in
[docs/branch-workflow.md](docs/branch-workflow.md).

## Commit messages

This repository follows
[Conventional Commits](https://www.conventionalcommits.org/). After
`npm install`, the Husky commit hook rejects non-conforming messages.

```text
<type>(<optional scope>): <short description>

<optional body>
```

| Type | Use for |
|---|---|
| `feat` | New capability |
| `fix` | Bug fix |
| `perf` | Performance improvement |
| `refactor` | Internal code change without a user-facing feature or fix |
| `style` | Visual or formatting change without behavior changes |
| `docs` | Documentation only |
| `test` | Test coverage or corrections |
| `chore` | Tooling, dependencies, configuration, or releases |
| `ci` | CI/CD workflow changes |

## Change and promotion process

1. Start from synchronized `development`/`main`, using a short-lived feature
   branch only when isolation is useful.
2. Make the change and add its user/operator-facing description under
   `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) in the same commit.
3. Run:

   ```bash
   npm run typecheck
   npm run build
   npx playwright test --project=static
   ```

4. Push the change to `development` and verify the live preview Worker and
   Preview D1 behavior.
5. Fast-forward `main` only after preview verification, then verify production.
6. Confirm `main` and `development` point to the same commit.
7. Remove merged feature branches only after checking unique commits, open
   pull requests, active worktrees, and uncommitted files.

Never run the destructive full CMS seed against an existing Preview or
Production D1 database. Use targeted, idempotent SQL updates and inspect rows
before and after each remote write.

## Pull requests

Use [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) when a
feature branch needs review. Passing CI does not replace preview-environment
verification for CMS, D1, R2, authentication, or Cloudflare-bound behavior.

## Versioning

The full SemVer and release process is defined in
[CHANGELOG.md](CHANGELOG.md#versioning-policy). A release commit updates only
the root package versions in `package.json` and `package-lock.json`, converts
the current Unreleased notes into a dated version, and starts a fresh
Unreleased section. Pushing that version bump to `main` lets CI create the
immutable tag and GitHub Release; tags are never moved during normal workflow.
