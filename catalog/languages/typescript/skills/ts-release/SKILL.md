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
---

## When to Use

Run manually before cutting a release tag. Pass the target version number as the argument. Does not tag, push, or publish — it produces a checklist and changelog draft for human review.

---

# Release Preparation

**Target version:** $ARGUMENTS

> This skill is **user-invoked only** (`disable-model-invocation: true`). It prepares the release
> but does **not** create a tag, push to remote, or publish to npm. All final actions require human
> confirmation.

## Step 1 — Verify quality gates

Check `package.json` scripts for a combined gate (`check`/`validate`/`ci`/`prepublishOnly`) and run
that. Only if none exists, fall back to running the type checker, linter, and `scripts.test`
separately — discover the test command from `package.json`, never hardcode a specific runner.

**Formatter (optional):** check for `.prettierrc*` / `biome.json`. If present, run
`prettier --check .` or `biome check .`. If absent, skip and note "formatter not configured".

**If any gate fails: stop and report.** Do not proceed — a release with failing gates is blocked.

## Step 2 — Check the working tree

```bash
git status --porcelain
git stash list
```

If there are uncommitted changes or stashes, **report and stop** — a release must be cut from a
clean working tree.

Note the current branch and whether it is ahead of the remote:
```bash
git log --oneline origin/main..HEAD
```

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
