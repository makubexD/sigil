---
id: python/py-generate-tests
kind: skill
name: py-generate-tests
title: Write pytest Tests for Python
description: Use when adding or reviewing unit and integration tests in a Python project. Covers project layout, fixtures, parametrize, mocking, and async test patterns.
language: python
uses:
  rules:
    - python/py-conventions
  agents:
    - python/py-code-reviewer
tags:
  - python
  - testing
  - pytest
  - mocking
whenToUse: "Use when adding, updating, or reviewing tests in a Python project — e.g. \"write tests for this service\", \"add pytest fixtures\", \"review my test coverage\". Covers project layout, fixtures, parametrize, mocking, and async test patterns."
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "[file-or-module] (optional)"
---

# Generate Tests (Python)

**Target:** {sigil:arguments}

## Step 1 — Resolve target

If `{sigil:arguments}` is provided, use it as the target module or package. If empty, find source
modules under `src/` (or the package root in `pyproject.toml`) that have no matching
`tests/**/test_<module>.py`; present the top candidates and ask the user to choose before proceeding.

## Step 2 — Discover the runner and layout

Read what the project uses rather than assuming: `[tool.pytest.ini_options]` in `pyproject.toml`,
`pytest.ini` or `setup.cfg`, an existing `conftest.py`, and 2–3 existing test files for the real
layout, fixture style and assertion idioms.

## Step 3 — Read the target

Identify every public function, class and method (the test subjects), the external dependencies
(network, filesystem, clock, environment — the mock boundaries), and the branches, edge cases and
error paths that need coverage.

## Step 4 — Write tests

Follow [the project's pytest conventions](references/testing-conventions.md): layout, fixtures
(scopes in [the fixture cheat-sheet](references/fixtures.md)), Arrange / Act / Assert, parametrize,
mocking, async tests and expected exceptions. Create the containing directory if it does not exist.

## Step 5 — Run and report

Run the discovered test command for the new file (`pytest <path> -q`, or the project's own script).
Fix any failures before finishing. Then emit:

```
## Test Generation Report

Target: <source module>
Tests written to: <test file>
Tests written: <N>
Result: ✅ <N> passed  /  ❌ <detail>
```
