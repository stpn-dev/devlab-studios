# Contributing

This is a single-maintainer project, but these conventions keep history
readable and the changelog accurate.

## Branch strategy

- `main` — production. Cloudflare deploys automatically from every push here.
- `development` — integration branch for work in progress; merge into `main`
  when ready to release.
- Feature work happens on short-lived branches off `development` (or `main`
  for small fixes), named `type/short-description` (e.g.
  `feat/resources-pagination`, `fix/contact-rate-limit`).

## Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/).
Once husky + commitlint are installed (`npm install`), non-conforming commit
messages are rejected by the `commit-msg` hook.

```
<type>(<optional scope>): <short description>

<optional body>
```

Allowed types:

| Type | Use for |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `perf` | A performance improvement |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `style` | Formatting/visual changes with no logic change |
| `docs` | Documentation only |
| `test` | Adding or correcting tests |
| `chore` | Tooling, dependency bumps, config |
| `ci` | CI/CD pipeline changes |

Examples:
```
feat(resources): add pagination to resources feed
fix(contact): correct rate-limit window reset
docs: update architecture diagram
```

## Pull request process

1. Branch off `development` (or `main` for a small, isolated fix).
2. Make your change; run `npm run lint` and `npm run build` locally.
3. **Update [CHANGELOG.md](CHANGELOG.md)** — add an entry under
   `## [Unreleased]` describing the change from a user/operator perspective.
4. Open a PR using the template in
   `.github/PULL_REQUEST_TEMPLATE.md`. CI (`.github/workflows/ci.yml`) runs
   lint, build, and `npm audit` automatically.
5. Merge to `main` (directly, or via `development` for larger batches of
   work) — Cloudflare deploys automatically.

## Versioning

Full policy and the release process live in
[CHANGELOG.md](CHANGELOG.md#versioning-policy) — read that before cutting a
release. Short version: decide the SemVer bump yourself based on what
actually changed (CI does not guess this from commit messages), bump
`package.json` and retitle `[Unreleased]` to a dated version heading in one
commit, then push to `main`. CI detects the version change and automatically
tags the release and publishes a GitHub Release — you never run `git tag`
by hand except as a documented fallback if CI is down.
