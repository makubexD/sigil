---
id: python/py-sync-tests
kind: skill
title: "Sync Tests (Python)"
description: "Sync the pytest suite with source code — add missing tests, update stale ones, and remove orphaned tests (with confirmation before deletion) (Python)"
name: py-sync-tests
language: python
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "[--scope=changed|all] (default: changed)"
uses:
  rules:
    - python/py-testing
  agents:
    - python/py-code-reviewer
tags:
  - python
  - testing
  - sync
whenToUse: "Use after multiple source files have changed and the test suite has drifted — missing tests for new exports, stale tests for renamed symbols, orphaned tests for deleted modules. Also fires for \"sync the tests\", \"clean up orphaned tests\", or \"make sure tests match the current source\". Not for a single untested file with no drift to reconcile (see py-generate-tests for that)."
---

# Sync Tests

**Scope:** {sigil:arguments} (default: changed files since the last commit on the base branch)

## Step 1 — Determine scope

`--scope=changed` (default): `git diff --name-only <base>...HEAD -- '*.py'`, excluding test files
themselves. `--scope=all`: every module under `src/`.

## Step 2 — Discover the runner and layout

Never assume a layout — read `[tool.pytest.ini_options]` in `pyproject.toml` (or `pytest.ini` /
`setup.cfg`) for `testpaths`, `python_files` and plugins such as `pytest-asyncio`, plus any
`conftest.py`. Read 2–3 existing test files to confirm the mirroring pattern (`tests/` tree vs.
co-located `test_*.py`), fixture style and import style; apply them consistently to every module
in scope.

## Step 3 — Add and update tests

### Find drift

For each source module in scope:
- **Missing tests** — a public function/class with no corresponding test in the mirrored
  `tests/` path (see `py-project-layout`'s test-layout convention).
- **Stale tests** — a test referencing a renamed/removed symbol (import error), or asserting
  against a signature that no longer matches.

```bash
pytest --collect-only 2>&1 | grep -i error   # surfaces import errors from renamed/removed symbols
```

### Add missing tests

For each untested public symbol, write tests following `py-testing`'s AAA structure and
`parametrize` conventions — cover the happy path, one edge case, and one error case at minimum.

### Fix stale tests

Update tests referencing a changed signature to match the new one, preserving the original test's
intent (what behavior it was verifying) — do not just delete and regenerate blindly; a stale test's
assertions often still document real intended behavior even when the call site needs updating.

## Step 4 — Detect orphaned tests

- **Orphaned tests** — a test file whose corresponding source module no longer exists.

## Step 5 — Confirm before any deletion (guardrail)

List orphaned test files/functions and **ask for confirmation before deleting** — a test with no
corresponding source might indicate the source was wrongly deleted, not that the test is genuinely
obsolete.

## Step 6 — Run and report

```bash
pytest
ruff check .
```

```
## Sync Tests Report
Scope: <changed files / all>

### Added
- `tests/path/test_x.py::test_new_case` — covers `module.new_function`

### Fixed (stale)
- `tests/path/test_y.py::test_case` — updated for renamed `module.old_name` → `module.new_name`

### Orphaned (pending confirmation)
- `tests/path/test_z.py` — source `module/z.py` no longer exists. Delete? [confirm before removing]

### Verification
Tests: <pass count>, all green
Lint: clean
```
