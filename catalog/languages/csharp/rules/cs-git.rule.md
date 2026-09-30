---
id: csharp/cs-git
kind: rule
title: Git (.NET / C#)
description: Git conventions for .NET / C# — imperative commit messages, atomic commits, branch naming, and PR hygiene
language: csharp
appliesTo:
  - "**/*"
severity: recommended
extends: []
tags:
  - csharp
  - git
---
## Commit Messages
Write commit messages in the **imperative mood** — describe what the commit *does*,
not what you did: "Add retry logic for ADO API calls", not "Added retry logic".

Focus the subject line on **why** (the business reason or problem solved), not
just the **what** (the mechanical change): "Fix N+1 query in daily-log builder"
explains the problem; "Update ActivityLogService.cs" does not.

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
whether the file is later deleted or the branch is squashed.

**Particular .NET risks:** `appsettings.Development.json`, `appsettings.local.json`,
`*.user` files, and `launchSettings.json` can embed connection strings or PATs.
Add them to `.gitignore` before creating the first commit.

Recommended `.gitignore` additions for .NET:
```gitignore
bin/
obj/
*.user
.vs/
appsettings.*.local.json
appsettings.Development.json   # if it contains real secrets
*.pfx
*.p12
secrets.json
```

If a secret is accidentally committed:
1. Rotate the secret immediately (treat it as compromised).
2. Remove it from history with `git filter-repo` or BFG.
3. Force-push all affected branches (coordinate with the team).

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
Changing or removing a public interface is a **breaking change**. Breaking changes:
- Require a semver-major version bump.
- Should be preceded by a deprecation cycle: mark the old member with
  `[Obsolete("Use X instead. This will be removed in v3.")]` and keep it working
  for at least one release.
- Must be called out explicitly in the commit message (`BREAKING CHANGE:` in the body)
  and in the changelog.
- Should be reviewed by `cs-api-compat-reviewer` before merging.

Don't break a caller silently — an unexpected `MissingMethodException` in downstream
code is harder to diagnose than an explicit `[Obsolete]` warning.

## Pre-Push Checklist (manual — no hooks)
Before pushing:
1. Quality gate green:
   ```bash
   dotnet format --verify-no-changes && dotnet build -warnaserror && dotnet test
   ```
2. No `appsettings.*.json` or `*.user` files staged with secrets.
3. Commit message follows the convention above.
