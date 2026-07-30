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

This project follows [Semantic Versioning](https://semver.org/) starting at
`1.0.0`. Bump `package.json`'s `version` and tag the release (`git tag
vX.Y.Z`) when cutting a new version; move the corresponding `CHANGELOG.md`
entries from `[Unreleased]` into a new dated `[X.Y.Z]` section.
