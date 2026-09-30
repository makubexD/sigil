---
id: angular/ng-git
kind: rule
title: Git (Angular)
description: Git conventions — commits, branches, atomic changes, secrets hygiene
language: angular
appliesTo:
  - "**/*"
severity: recommended
extends: []
tags:
  - angular
  - git
---


## Commit Messages
Write commit messages in the **imperative mood** — describe what the commit *does*,
not what you did: "Add retry logic for HTTP interceptor", not "Added retry logic".

Focus the subject line on **why** (the business reason or problem solved), not
just the **what** (the mechanical change): "Fix change-detection thrash in dashboard list"
explains the problem; "Update dashboard.component.ts" does not.

```
<type>: <imperative summary under 72 chars>

<optional body: motivation, context, tradeoffs — wrap at 72 chars>
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`.

## Atomic Commits
Each commit should be independently reviewable and deployable — one logical change,
all tests passing, quality gates green. Do not bundle unrelated changes. If you find
a bug while working on a feature, fix it in a separate commit.

## Branch Naming
Use lowercase kebab-case with a type prefix:
- `feat/<short-description>` — new capability
- `fix/<issue-or-description>` — bug fix
- `refactor/<scope>` — structural improvement
- `chore/<task>` — maintenance, dependency bumps, config

Keep branch names short (≤ 40 chars after the prefix) and descriptive.

## No Secrets in History
Never commit secrets to a repository — even to a private one, and even temporarily.
Git history is permanent; a leaked secret in a commit is compromised regardless of
whether the file is later deleted or the branch is squashed. Remember that anything
bundled into the client (including `environment.ts`) is public by definition — see
`ng-security`.

If a secret is accidentally committed:
1. Rotate the secret immediately (treat it as compromised).
2. Remove it from history with `git filter-repo` or BFG.
3. Force-push all affected branches (coordinate with the team).

Use `.gitignore` to exclude `node_modules/`, `dist/`, `.angular/` (build cache),
`coverage/`, `*.log`, and `.env*` files. Use `.env.example` with placeholder values
to document required variables.

## Merge Strategy
Prefer squash-and-merge for feature branches into the main branch so that `git log`
on `main` reads as a clean, one-commit-per-feature history. Reserve merge commits for
integrations between long-lived branches. Avoid `git push --force` on shared branches.

## Small, Focused Pull Requests
Keep pull requests single-purpose — one logical change per PR. Large PRs resist meaningful
review, slow down feedback, and make `git bisect` harder. If a branch has accreted an
unrelated bug fix alongside a feature, split it before opening the PR.

A PR that takes more than 30 minutes to review is likely too large — split it.

## Backward Compatibility
Changing or removing a public interface is a **breaking change** — for a published library
that means a removed/renamed export or selector, a removed or newly-`required` `@Input`, a
narrowed type, or a widened Angular peer-range floor (see `ng-api-compat-reviewer`). Breaking
changes:
- Require a semver-major version bump (see `ng-release`).
- Should be preceded by a deprecation cycle: mark the old surface with a `@deprecated` TSDoc
  tag (and a runtime warning where practical), and keep it working for at least one release.
- Must be called out explicitly in the commit message (`BREAKING CHANGE:` in the body)
  and in the changelog.

Don't break a consumer silently — an unexpected runtime error in downstream code is harder to
diagnose than an explicit deprecation notice.

## Pre-Push Checklist (manual — no hooks)
Before pushing:
1. Quality gate green: discovered `npm run check` (or `ng lint` + `tsc --noEmit` + `vitest run`).
2. Optional formatter clean if configured (`prettier --check .` / `biome check .`).
3. No `.env` / credential files staged.
4. Commit message follows the convention above.
