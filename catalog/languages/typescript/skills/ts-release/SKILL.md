---
id: typescript/ts-release
kind: skill
title: "Release Preparation (TypeScript)"
description: "Prepare a release — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification"
name: ts-release
language: typescript
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "<version> (e.g. 2.1.0)"
disableModelInvocation: true
uses:
  rules:
    - typescript/ts-conventions
  agents: []
tags:
  - typescript
  - release
  - publish
whenToUse: "Run manually via `/ts-release <version>` before cutting a release tag — e.g. \"prepare a release\", \"cut version 2.1.0\", \"generate a release checklist\". Pass the target version number as the argument; omit it to get a suggested bump from recent commits. Does not tag, push, or publish — produces a checklist and changelog draft for human review. Complements ts-api-compat-reviewer, which determines the correct SemVer bump from the public API diff."
---

# Release Preparation

**Target version:** $ARGUMENTS

> User-invoked only — does not tag, push, or publish. All final actions require human confirmation.

## Step 1 — Verify quality gates

Discover the combined gate from `package.json` scripts (`check`/`validate`/`ci`/`prepublishOnly`) and run it; fall back to the type checker, linter, and `scripts.test` separately only if none exists. Run the formatter check too if one is configured (`.prettierrc*` / `biome.json`); otherwise note "formatter not configured".

**If any gate fails: stop and report.** A release with failing gates is blocked.

## Step 2 — Check the working tree

```bash
git status --porcelain
git stash list
git log --oneline origin/main..HEAD   # note branch position vs remote
```

If there are uncommitted changes or stashes, **report and stop** — a release must be cut from a
clean working tree.

## Step 3 — Determine the version

**If `$ARGUMENTS` is provided:** use it as the target version.

**If `$ARGUMENTS` is empty:**
1. Read the current version from `package.json` `"version"` field.
2. Read recent commits (Step 4) and suggest a version bump:
   - Any `feat:` commit → **minor** bump (`X.Y+1.0`).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → **patch** bump (`X.Y.Z+1`).
   - A commit body containing `BREAKING CHANGE:` → **major** bump (`X+1.0.0`).
   - A `ts-api-compat-reviewer` report with Breaking findings → **major** bump regardless.
3. Ask the user to confirm the version before proceeding.

## Step 4 — Generate changelog

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges
```

If no tag exists: `git log --oneline --no-merges`.

Group commits by type and produce a changelog section:

```markdown
## [<version>] — <today's date>
### ⚠️ Breaking Changes
- <summary of BREAKING CHANGE commits or ts-api-compat-reviewer Breaking findings>
### Features
- <summary of feat: commits>
### Bug Fixes
- <summary of fix: commits>
### Performance
- <summary of perf: commits>
### Refactoring / Other
- <refactor, chore, docs, ci, test commits>
```

Omit sections with no entries.

## Step 5 — Check API compatibility

If a `ts-api-compat-reviewer` report was produced for this branch, include its SemVer recommendation
and confirm it matches the proposed version bump. If not, suggest running it:

```
Note: ts-api-compat-reviewer was not run. For published packages, run it before releasing to confirm
no unintentional breaking changes to the public type surface.
```

## Step 6 — Output release checklist

```
## Release Checklist — v<version>

### Quality gates
✅ <gate command>: passed  /  ❌ <failure detail>
✅ format: passed  /  ⏭ not configured  /  ❌ N files differ

### Working tree
✅ clean  /  ❌ uncommitted changes — resolve before releasing

### Version
Current: <current-version>
Proposed: <target-version>
Bump type: <major / minor / patch>
API compat: <ts-api-compat-reviewer SemVer recommendation, or "not run">

### Changelog draft
<markdown changelog section from Step 4>

### Next steps (human action required)
1. Review and edit the changelog above; paste into CHANGELOG.md.
2. Update "version" in package.json to <target-version>.
3. Commit: git commit -m "chore: release v<target-version>"
4. Tag:    git tag -a v<target-version> -m "Release v<target-version>"
5. Push:   git push origin main --tags
6. Publish: npm publish --provenance
           (or: npx np <target-version> if the project uses np)
```
