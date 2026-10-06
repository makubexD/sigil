---
id: python/py-audit-deps
kind: skill
title: "Audit Dependencies (Python)"
description: "Audit PyPI dependencies — known CVEs (pip-audit), outdated versions, unmaintained packages, unused imports, and license compliance (Python)"
name: py-audit-deps
language: python
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "(no arguments)"
uses:
  rules:
    - python/py-dependencies
    - python/py-packaging
    - python/py-security
  agents:
    - python/py-security-auditor
tags:
  - python
  - audit
  - dependencies
  - security
skillContext: fork
whenToUse: "Use to check for known CVEs, outdated packages, and license issues in a Python project's dependencies. Fires for \"are there any known CVEs\", \"audit dependencies\", \"check for vulnerable packages\", or before a release."
---

# Audit Dependencies

Read-only audit — reports findings, does not modify `pyproject.toml` or the lock file.

## Step 1 — Discover dependency manifest

Locate `pyproject.toml` and the lock file (`uv.lock`/`poetry.lock`). List declared runtime
dependencies from `[project.dependencies]` and dev dependencies from `[dependency-groups]`.

## Step 2 — Run available tooling

### CVE scan

```bash
pip-audit 2>&1
```
If `pip-audit` isn't installed, note that in the report and recommend `uv tool install pip-audit`
(or `pipx install pip-audit`) rather than fabricating results.

If using `uv`:
```bash
uv export --format requirements-txt --no-hashes | pip-audit -r - 2>&1
```

### Outdated packages

```bash
uv pip list --outdated 2>&1   # or: pip list --outdated
```
Flag packages more than 2 major versions behind, or with no release in 18+ months.

### Unused dependencies

```bash
deptry . 2>&1   # cross-references imports against declared dependencies
```
If `deptry` isn't available, cross-reference manually: for each declared dependency, `grep -rn
"^import <pkg>\|^from <pkg>" src/` and flag any with zero matches.

## Step 3 — Manual review

### License compliance

For each direct dependency, check its declared license (via `pip show <pkg>` or the PyPI page).
Flag any GPL/AGPL-licensed dependency for review if the project is proprietary/commercial, and flag
any dependency with no declared license at all.

## Step 4 — Report

```
## Dependency Audit Report

### CVEs / Security vulnerabilities
<pip-audit output, or "None found" / "pip-audit not installed — recommend installing it">

### Outdated packages
- `<package>` — installed <version>, latest <version> [<N> major versions behind / stale since <date>]

### Unused dependencies
- `<package>` — declared but no import found

### License compliance
- `<package>` — <license>, flagged because <reason>

### Manual findings

#### High
- `<package>` — <issue>. **Recommendation:** <action>.

#### Medium
...

#### Low
...

### Summary
<N> critical/high issues requiring immediate action.
<N> medium issues recommended before next release.
<N> low/informational notes.
```

Omit sections and tiers with no findings.
