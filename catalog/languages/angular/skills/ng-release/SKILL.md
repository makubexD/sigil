---
id: angular/ng-release
kind: skill
title: "Release Preparation (Angular)"
description: "Prepare a release — verify quality gates, generate a changelog from git log, and propose a version bump"
name: ng-release
language: angular
appliesTo:
  - "**/*"
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "\"<version> (e.g. 1.2.0)\""
uses:
  rules:
    - angular/ng-conventions
  agents: []
tags:
  - angular
  - release
  - publish
---

## When to Use

Run manually before cutting a release tag. Pass the target version number as the argument. Does not tag, push, or publish — it produces a checklist and changelog draft for human review.

---

# Release Preparation

**Target version:** $ARGUMENTS

> This skill is **user-invoked only** (`disable-model-invocation: true`). It prepares
> the release but does **not** create a tag, push to remote, or publish to a registry.
> All final actions require human confirmation.

## Step 1 — Verify quality gates

Discover and run the project's full quality gate, **angular-eslint first**:

```bash
# Prefer a discovered package.json "check" script. Fallback triple:
#   ng lint            (angular-eslint; falls back to eslint .) — required
#   tsc --noEmit       (full strictTemplates check via `ng build`)
#   vitest run         (or ng test --watch=false)
# Optional, only if configured: prettier --check . / biome check . (never fails the gate when absent)
```

**If any required gate fails: stop and report.** Do not proceed — a release with failing gates is blocked. A missing formatter is not a failure; note it and continue.

For a publishable library, also confirm the package builds: `ng build <lib>` (ng-packagr), and consider running `ng-api-compat-reviewer` to confirm the SemVer bump matches the surface diff.

## Step 2 — Check the working tree

```bash
git status --porcelain
git stash list
```

If there are uncommitted changes or stashes, **report and stop** — a release must be cut from a clean tree.

Note the current branch and whether it is ahead of or behind the remote:
```bash
git log --oneline origin/main..HEAD
```

## Step 3 — Determine the version

**If `$ARGUMENTS` is provided:** use that as the target version.

**If `$ARGUMENTS` is empty:**
1. Read the current version from `package.json` (`"version"`).
2. Read recent commits (Step 4) and suggest a bump:
   - Any `feat:` commit → minor bump (0.X.0).
   - Only `fix:` / `refactor:` / `chore:` commits → patch bump (0.0.X).
   - Breaking change (`BREAKING CHANGE:` in a commit body, or a Breaking finding from `ng-api-compat-reviewer`) → major bump (X.0.0).
3. Ask the user to confirm the version before proceeding.

## Step 4 — Generate changelog

```bash
git log <last-tag>..HEAD --oneline --no-merges
```

If no tag exists, use the first commit: `git log --oneline --no-merges`.

Group commits by type and produce a changelog section:

```markdown
## [<version>] — <today's date>

### Features
- <summary of feat: commits>

### Bug Fixes
- <summary of fix: commits>

### Refactoring
- <summary of refactor: commits>

### Other
- <chore, docs, ci, test commits>
```

Omit sections with no entries.

## Step 5 — Output release checklist

```
## Release Checklist — v<version>

### Quality gates
✅ lint passed  /  ✅ types passed  /  ✅ tests passed (<N> tests, <coverage>%)
Formatter: ✅ / ⏭ none configured
Library build: ✅ / ⏭ n/a

### Working tree
✅ clean  /  ❌ uncommitted changes — resolve before releasing

### Version
Current: <current-version>
Proposed: <target-version>
Bump type: <major / minor / patch>

### Changelog draft
<markdown changelog section from Step 4>

### Next steps (human action required)
1. Review and edit the changelog above.
2. Update `version` in `package.json` to `<target-version>`.
3. Commit: `git commit -m "chore: release v<target-version>"`
4. Tag: `git tag -a v<target-version> -m "Release v<target-version>"`
5. Push: `git push origin main --tags`
6. Publish (if applicable): `npm publish` (or `npm publish` from the built library `dist/`).
```
