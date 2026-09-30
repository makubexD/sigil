---
id: react/react-release
kind: skill
title: "Release Preparation (React)"
description: "Prepare an npm release for a shared component library — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification"
name: react-release
language: react
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
    - react/react-conventions
    - react/react-npm
  agents: []
tags:
  - react
  - release
  - publish
whenToUse: "Run manually via `/react-release <version>` before cutting a release tag for a published component library — e.g. \"prepare a release\", \"cut version 2.1.0\", \"generate a release checklist\". Pass the target version number as the argument; omit it to get a suggested bump from recent commits. Does not tag, push, or publish — produces a checklist and changelog draft for human review. Complements react-api-compat-reviewer, which determines the correct SemVer bump from the exported component/hook diff."
---
<!-- slot: quality-gates -->
Discover the combined gate from `package.json` scripts (`check`/`validate`/`ci`) and run it; fall
back to lint + type-check + `vitest run`/`jest` + `npm run build` separately only if none exists.
Building is part of the gate — a release with a build-breaking change must never ship.

**If any gate fails: stop and report.** A release with failing gates is blocked.

<!-- slot: version-determination -->
1. Read the current version from `package.json`'s `"version"` field.
2. Read recent commits (Step 4) and suggest a version bump:
   - Any `feat:` commit → **minor** bump (`X.Y+1.0`).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → **patch** bump (`X.Y.Z+1`).
   - A commit body containing `BREAKING CHANGE:` → **major** bump (`X+1.0.0`).
   - A `react-api-compat-reviewer` report with Breaking findings → **major** bump regardless.

<!-- slot: changelog-format -->
```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges
```

If no tag exists: `git log --oneline --no-merges`.

Group commits by type and produce a changelog section:

```markdown
## [<version>] — <today's date>
### ⚠️ Breaking Changes
- <summary of BREAKING CHANGE commits or react-api-compat-reviewer Breaking findings>
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

If a `react-api-compat-reviewer` report was produced for this branch, include its SemVer
recommendation and confirm it matches the proposed version bump. If not, suggest running it:

```
Note: react-api-compat-reviewer was not run. For a published component library, run it before
releasing to confirm no unintentional breaking changes to exported components/hooks.
```

<!-- slot: checklist-and-next-steps -->
```
## Release Checklist — v<version>

### Quality gates
✅ <gate command>: passed  /  ❌ <failure detail>
✅ type-check: passed  /  ❌ <failure detail>
✅ tests: passed  /  ❌ <failure detail>
✅ build: passed  /  ❌ <failure detail>

### Working tree
✅ clean  /  ❌ uncommitted changes — resolve before releasing

### Version
Current: <current-version>
Proposed: <target-version>
Bump type: <major / minor / patch>
API compat: <react-api-compat-reviewer SemVer recommendation, or "not run">

### Changelog draft
<markdown changelog section from Step 4>

### Next steps (human action required)
1. Review and edit the changelog above; paste into CHANGELOG.md.
2. Update "version" in package.json to <target-version>.
3. Commit: git commit -m "chore: release v<target-version>"
4. Tag:    git tag -a v<target-version> -m "Release v<target-version>"
5. Push:   git push origin main --tags
6. Publish: npm publish --provenance
```
