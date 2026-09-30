---
id: csharp/cs-release
kind: skill
title: "Release Preparation (.NET / C#)"
description: "Prepare a .NET release — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification"
name: cs-release
language: csharp
appliesTo:
  - "**/*"
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "<version> (e.g. 2.1.0)"
disableModelInvocation: true
uses:
  rules:
    - csharp/cs-conventions
  agents: []
tags:
  - csharp
  - release
  - publish
---

## When to Use

Run manually before cutting a release tag. Pass the target version number as the argument. Does not tag, push, or publish — it produces a checklist and changelog draft for human review.

---

# Release Preparation

**Target version:** $ARGUMENTS

> This skill is **user-invoked only** (`disable-model-invocation: true`). It prepares
> the release but does **not** create a tag, push to remote, or publish to NuGet.
> All final actions require human confirmation.

## Step 1 — Verify quality gates

Discover and run the project's full quality gate:

```bash
# Check for a build orchestrator (build.ps1, Nuke, Cake, justfile, Makefile)
# Fallback: run the standard triple gate
dotnet format --verify-no-changes
dotnet build -warnaserror --no-restore
dotnet test --no-build
```

**If any gate fails: stop and report.** Do not proceed — a release with failing gates is blocked.

## Step 2 — Check the working tree

```bash
git status --porcelain
git stash list
```

If there are uncommitted changes or stashes, **report and stop** — a release must be cut from a
clean working tree.

Note the current branch and whether it is ahead of or behind the remote:
```bash
git log --oneline origin/main..HEAD
```

## Step 3 — Determine the version

**If `$ARGUMENTS` is provided:** use that as the target version.

**If `$ARGUMENTS` is empty:**
1. Read the current version from `Directory.Build.props`, `Directory.Packages.props`, or the library
   `.csproj` (`<Version>`, `<VersionPrefix>`, or `<AssemblyVersion>`).
2. Read recent commits (Step 4) and suggest a version bump:
   - Any `feat:` commit → **minor** bump (`X.Y+1.0`).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → **patch** bump (`X.Y.Z+1`).
   - A commit body containing `BREAKING CHANGE:` → **major** bump (`X+1.0.0`).
   - A `cs-api-compat-reviewer` report with Breaking-tier findings → **major** bump regardless.
3. Ask the user to confirm the version before proceeding.

## Step 4 — Generate changelog

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges
```

If no tag exists, use: `git log --oneline --no-merges`.

Group commits by type and produce a changelog section:

```markdown
## [<version>] — <today's date>

### ⚠️ Breaking Changes
- <summary of BREAKING CHANGE commits or cs-api-compat-reviewer Breaking findings>

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

If a `cs-api-compat-reviewer` report was produced for this branch, include its SemVer recommendation
and confirm it matches the proposed version bump. If not, suggest running it:
```
Note: cs-api-compat-reviewer was not run. For library packages, run it before releasing to confirm
no unintentional breaking changes.
```

## Step 6 — Output release checklist

```
## Release Checklist — v<version>

### Quality gates
✅ format passed  /  ✅ build passed  /  ✅ tests passed (<N> tests, <coverage>%)

### Working tree
✅ clean  /  ❌ uncommitted changes — resolve before releasing

### Version
Current: <current-version>
Proposed: <target-version>
Bump type: <major / minor / patch>
API compat: <cs-api-compat-reviewer SemVer recommendation, or "not run">

### Changelog draft
<markdown changelog section from Step 4>

### Next steps (human action required)
1. Review and edit the changelog above; paste into CHANGELOG.md.
2. Update `<Version>` in `Directory.Build.props` (or the library `.csproj`) to `<target-version>`.
3. Commit: `git commit -m "chore: release v<target-version>"`
4. Tag:    `git tag -a v<target-version> -m "Release v<target-version>"`
5. Push:   `git push origin main --tags`
6. Pack:   `dotnet pack -c Release -o ./artifacts`
7. Publish (if applicable):
           `dotnet nuget push ./artifacts/*.nupkg --api-key "$NUGET_API_KEY" --source https://api.nuget.org/v3/index.json`
           `dotnet nuget push ./artifacts/*.snupkg --api-key "$NUGET_API_KEY" --source https://api.nuget.org/v3/index.json`
```
