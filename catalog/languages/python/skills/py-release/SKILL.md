---
id: python/py-release
kind: skill
title: "Release Preparation (Python)"
description: "Prepare a PyPI release — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification (Python)"
name: py-release
language: python
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
    - python/py-conventions
    - python/py-packaging
  agents: []
tags:
  - python
  - release
  - publish
whenToUse: "Run manually via `/py-release <version>` before cutting a release tag — e.g. \"prepare a release\", \"cut version 2.1.0\", \"generate a release checklist\". Pass the target version number as the argument; omit it to get a suggested bump from recent commits. Does not tag, push, or publish — produces a checklist and changelog draft for human review. Complements py-api-compat-reviewer, which determines the correct SemVer bump from the public API diff."
---
<!-- slot: quality-gates -->
Discover the combined gate: `ruff check . && ruff format --check . && mypy . && pytest`. Run it as a
single sequence; fall back to individual tools only if the project has a documented custom gate
command (check `pyproject.toml`'s `[tool.hatch.envs.default.scripts]` or a `Makefile`/`tox.ini`
target first).

**If any gate fails: stop and report.** A release with failing gates is blocked.

<!-- slot: version-determination -->
1. Read the current version — from `[project] version` in `pyproject.toml` if static, or from the
   latest git tag if `[tool.hatch.version] source = "vcs"` (dynamic versioning).
2. Read recent commits (Step 4) and suggest a version bump:
   - Any `feat:` commit → **minor** bump (`X.Y+1.0`).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → **patch** bump (`X.Y.Z+1`).
   - A commit body containing `BREAKING CHANGE:` → **major** bump (`X+1.0.0`).
   - A `py-api-compat-reviewer` report with Breaking findings → **major** bump regardless.

<!-- slot: changelog-format -->
```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges
```

If no tag exists: `git log --oneline --no-merges`.

Group commits by type and produce a changelog section:

```markdown
## [<version>] — <today's date>
### ⚠️ Breaking Changes
- <summary of BREAKING CHANGE commits or py-api-compat-reviewer Breaking findings>
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

If a `py-api-compat-reviewer` report was produced for this branch, include its SemVer
recommendation and confirm it matches the proposed version bump. If not, suggest running it:

```
Note: py-api-compat-reviewer was not run. For published packages, run it before releasing to
confirm no unintentional breaking changes to the public API surface.
```

Also run `pip-audit` (see `py-packaging`) as part of the release gate — never publish a version with
a known-vulnerable resolved dependency.

<!-- slot: checklist-and-next-steps -->
```
## Release Checklist — v<version>

### Quality gates
✅ ruff check: passed  /  ❌ <failure detail>
✅ ruff format --check: passed  /  ❌ N files differ
✅ mypy: passed  /  ❌ <failure detail>
✅ pytest: passed  /  ❌ <failure detail>
✅ pip-audit: no known vulnerabilities  /  ⚠ N flagged

### Working tree
✅ clean  /  ❌ uncommitted changes — resolve before releasing

### Version
Current: <current-version>
Proposed: <target-version>
Bump type: <major / minor / patch>
API compat: <py-api-compat-reviewer SemVer recommendation, or "not run">

### Changelog draft
<markdown changelog section from Step 4>

### Next steps (human action required)
1. Review and edit the changelog above; paste into CHANGELOG.md.
2. Update the version (pyproject.toml, or tag if using vcs-derived versioning).
3. Commit: git commit -m "chore: release v<target-version>"
4. Tag:    git tag -a v<target-version> -m "Release v<target-version>"
5. Push:   git push origin main --tags
6. Build & publish:
           uv build && uv publish --token "$PYPI_TOKEN"
           (or trusted publishing via CI, if configured)
```
