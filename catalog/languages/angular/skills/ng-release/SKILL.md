---
id: angular/ng-release
kind: skill
title: "Release Preparation (Angular)"
description: "Prepare an Angular library release — verify quality gates, generate a changelog from git log, and propose a version bump"
name: ng-release
language: angular
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "<version> (e.g. 1.2.0)"
disableModelInvocation: true
template: shared/templates/release-skill
uses:
  rules:
    - angular/ng-conventions
    - angular/ng-npm
  agents: []
tags:
  - angular
  - release
  - publish
whenToUse: "Run manually via `/ng-release <version>` before cutting a release tag — e.g. \"prepare a release\", \"cut version 1.2.0\". Pass the target version number as the argument; omit it to get a suggested bump from recent commits. Does not tag, push, or publish — produces a checklist and changelog draft for human review."
---
<!-- slot: quality-gates -->
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

<!-- slot: version-determination -->
1. Read the current version from `package.json` (`"version"`).
2. Read recent commits (Step 4) and suggest a bump:
   - Any `feat:` commit → minor bump (0.X.0).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → patch bump (0.0.X).
   - Breaking change (`BREAKING CHANGE:` in a commit body, or a Breaking finding from `ng-api-compat-reviewer`) → major bump (X.0.0).

<!-- slot: changelog-format -->
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
- <perf, chore, docs, ci, test commits>
```

<!-- slot: checklist-and-next-steps -->
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
