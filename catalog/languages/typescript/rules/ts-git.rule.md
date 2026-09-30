---
id: typescript/ts-git
kind: rule
title: Git (TypeScript)
description: Git conventions — commits, branches, atomic changes, secrets hygiene, backward compatibility
language: typescript
appliesTo:
  - "**/*"
severity: recommended
extends: []
tags:
  - typescript
  - git
---

## Commit Messages

Write commit messages in the **imperative mood** — describe what the commit *does*, not what you did:
"Add retry logic for ADO API calls", not "Added retry logic".

Focus the subject line on **why** (the business reason or problem solved), not just the **what**
(the mechanical change): "Fix N+1 query in daily-log builder" explains the problem; "Update
activityLog.ts" does not.

```
<type>: <imperative summary under 72 chars>

<optional body: motivation, context, tradeoffs — wrap at 72 chars>
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`.

## Atomic Commits

Each commit should be independently reviewable and deployable — one logical change, all tests
passing, quality gates green. Do not bundle unrelated changes. If you find a bug while working on
a feature, fix it in a separate commit.

## Branch Naming

Use lowercase kebab-case with a type prefix:
- `feat/<short-description>` — new capability
- `fix/<issue-or-description>` — bug fix
- `refactor/<scope>` — structural improvement
- `chore/<task>` — maintenance, dependency bumps, config

Keep branch names short (≤ 40 chars after the prefix) and descriptive.

## No Secrets in History

Never commit secrets to a repository — even to a private one, and even temporarily. Git history is
permanent; a leaked secret in a commit is compromised regardless of whether the file is later deleted
or the branch is squashed.

If a secret is accidentally committed:
1. Rotate the secret immediately (treat it as compromised).
2. Remove it from history with `git filter-repo` or BFG.
3. Force-push all affected branches (coordinate with the team).

Use `.gitignore` to exclude: `.env*` files, credential files, and local config containing secrets.
Use `.env.example` with placeholder values to document required variables.

Standard TypeScript additions to `.gitignore`:
```
node_modules/
dist/
build/
coverage/
*.tsbuildinfo
.env
.env.local
.env.*.local
```

## Merge Strategy

Prefer squash-and-merge for feature branches into the main branch so that `git log` on `main` reads
as a clean, one-commit-per-feature history. Reserve merge commits for integrations between long-lived
branches. Avoid `git push --force` on shared branches.

## Small, Focused Pull Requests

Keep pull requests single-purpose — one logical change per PR. Large PRs resist meaningful review,
slow down feedback, and make `git bisect` harder. If a branch has accreted an unrelated bug fix
alongside a feature, split it before opening the PR.

A PR that takes more than 30 minutes to review is likely too large — split it.

## Backward Compatibility

Changing or removing a public export is a **breaking change**. Breaking changes:
- Require a semver-major version bump (see `/ts-release`).
- Should be preceded by a deprecation cycle: mark the old symbol with `@deprecated` in its TSDoc
  and keep it functional for at least one release before removal.
- Must be called out explicitly in the commit message (`BREAKING CHANGE:` in the body) and in the
  changelog.

```typescript
/**
 * @deprecated Use `mergeTimeline` instead. Will be removed in v3.0.
 */
export function mergeRows(…) { … }
```

See `ts-api-compat-reviewer` for a systematic pre-release review of the public type surface.

## Pre-Push Checklist (manual — no hooks)

Before pushing:
1. Quality gate green — discover from `package.json` scripts (`npm run check` or equivalent);
   fallback `tsc --noEmit && eslint . && vitest run` (plus an optional format check if Prettier or
   Biome is configured).
2. No `.env` / credential files staged.
3. Commit message follows the convention above.
