---
id: csharp/cs-release
kind: skill
title: "Release Preparation (.NET / C#)"
description: "Prepare a .NET release — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification"
name: cs-release
language: csharp
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "<version> (e.g. 2.1.0)"
disableModelInvocation: true
template: shared/templates/release-skill
uses:
  rules:
    - csharp/cs-conventions
  agents: []
tags:
  - csharp
  - release
  - publish
whenToUse: "Run manually via `/cs-release <version>` before cutting a release tag — e.g. \"prepare a release\", \"cut version 2.1.0\". Pass the target version number as the argument; omit it to get a suggested bump from recent commits. Does not tag, push, or publish — produces a checklist and changelog draft for human review."
---
<!-- slot: quality-gates -->
Discover and run the project's full quality gate:

```bash
# Check for a build orchestrator (build.ps1, Nuke, Cake, justfile, Makefile)
# Fallback: run the standard triple gate
dotnet format --verify-no-changes
dotnet build -warnaserror --no-restore
dotnet test --no-build
```

**If any gate fails: stop and report.** Do not proceed — a release with failing gates is blocked.

<!-- slot: version-determination -->
1. Read the current version from `Directory.Build.props`, `Directory.Packages.props`, or the library
   `.csproj` (`<Version>`, `<VersionPrefix>`, or `<AssemblyVersion>`).
2. Read recent commits (Step 4) and suggest a version bump:
   - Any `feat:` commit → **minor** bump (`X.Y+1.0`).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → **patch** bump (`X.Y.Z+1`).
   - A commit body containing `BREAKING CHANGE:` → **major** bump (`X+1.0.0`).
   - A `cs-api-compat-reviewer` report with Breaking-tier findings → **major** bump regardless.

<!-- slot: changelog-format -->
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

<!-- slot: api-compat-step -->
## Step 5 — Check API compatibility

If a `cs-api-compat-reviewer` report was produced for this branch, include its SemVer recommendation
and confirm it matches the proposed version bump. If not, suggest running it:
```
Note: cs-api-compat-reviewer was not run. For library packages, run it before releasing to confirm
no unintentional breaking changes.
```

<!-- slot: checklist-and-next-steps -->
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
